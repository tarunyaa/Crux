// ─── Disagreement Detection ───────────────────────────────────
// Tracks disagreement candidates across detection windows.
// A crux room only spawns after the same disagreement persists for
// 2 consecutive windows (≥6 messages on the same topic).

import type { DialogueMessage } from './types'
import { completeJSON } from '@/lib/llm/client'

interface DetectionResult {
  has_direct_opposition: boolean  // Two personas take clearly opposing positions
  has_specific_claim: boolean     // About a specific claim, not vague topic
  topic_relevant: boolean         // Relevant to the wider debate topic
  personas: string[]
  topic: string
  shortLabel: string
}

/**
 * Tracks a candidate disagreement over time.
 */
interface CandidateRecord {
  personas: string[]          // Normalized pair (sorted)
  topic: string
  shortLabel: string
  consecutiveWindows: number  // How many consecutive checks detected this
  firstSeenAt: number
  lastSeenAt: number
}

/**
 * Registry keyed by "personaA|personaB" (normalized pair).
 * Lives in the orchestrator and is passed between detection calls.
 */
export class CandidateRegistry {
  private records = new Map<string, CandidateRecord>()
  private cooldowns = new Map<string, number>()  // pair → timestamp room spawned

  private static pairKey(personas: string[]): string {
    return [...personas].sort().join('|')
  }

  /**
   * Update registry from a fresh detection result.
   * Returns the candidate if it has passed the spawn threshold.
   * Key is pair-only — topic label may vary between LLM calls so we
   * don't require exact topic match, just that the same pair keeps disagreeing.
   */
  update(
    detectedPersonas: string[],
    topic: string,
    shortLabel: string,
    activeRoomPairs: Set<string>,
  ): CandidateRecord | null {
    const key = CandidateRegistry.pairKey(detectedPersonas)
    const existing = this.records.get(key)

    const record: CandidateRecord = existing
      ? { ...existing, consecutiveWindows: existing.consecutiveWindows + 1, topic, shortLabel, lastSeenAt: Date.now() }
      : { personas: [...detectedPersonas].sort(), topic, shortLabel, consecutiveWindows: 1, firstSeenAt: Date.now(), lastSeenAt: Date.now() }

    this.records.set(key, record)

    if (this.shouldSpawn(record, activeRoomPairs)) {
      return record
    }
    return null
  }

  /**
   * Decrement all records that weren't detected in this window.
   * Called when detection returns no disagreement for a given pair.
   */
  decay(personas: string[], topic: string): void {
    const key = CandidateRegistry.pairKey(personas)
    const existing = this.records.get(key)
    if (existing) {
      if (existing.consecutiveWindows <= 1) {
        this.records.delete(key)
      } else {
        this.records.set(key, { ...existing, consecutiveWindows: existing.consecutiveWindows - 1 })
      }
    }
  }

  /** Record that a crux room was spawned for this pair. */
  recordSpawn(personas: string[]): void {
    const key = CandidateRegistry.pairKey(personas)
    this.cooldowns.set(key, Date.now())
    // Remove the candidate record so it starts fresh
    for (const [k] of this.records) {
      if (k.startsWith(key)) this.records.delete(k)
    }
  }

  private shouldSpawn(record: CandidateRecord, activeRoomPairs: Set<string>): boolean {
    const pairKey = CandidateRegistry.pairKey(record.personas)

    // Must have been detected in 2 consecutive windows (6 messages on same pair)
    if (record.consecutiveWindows < 2) return false

    // No existing room for this pair
    if (activeRoomPairs.has(pairKey)) return false

    // Cooldown: 5 minutes since last room for this pair
    const lastSpawn = this.cooldowns.get(pairKey)
    if (lastSpawn && Date.now() - lastSpawn < 5 * 60 * 1000) return false

    return true
  }
}

/**
 * Detect disagreements in recent dialogue messages (sequential/sliding window).
 * Uses a 10-message window and returns the detected candidate (if any).
 */
export async function detectDisagreements(
  messages: DialogueMessage[],
  personaNames: Map<string, string>,
  debateTopic?: string,
): Promise<{ personas: string[]; topic: string; shortLabel: string; spawnCruxRoom: boolean } | null> {
  if (messages.length < 4) return null

  // 10-message window
  const recentMessages = messages.slice(-10)

  const conversation = recentMessages
    .map(msg => `${personaNames.get(msg.personaId) ?? msg.personaId}: ${msg.content}`)
    .join('\n')

  const topicLine = debateTopic
    ? `\nWider debate topic: "${debateTopic}"\n`
    : ''

  const topicRelevantLine = debateTopic
    ? `3. topic_relevant: Is this disagreement relevant to the wider debate topic "${debateTopic}"?`
    : '3. topic_relevant: Is this disagreement about a substantive issue (not a meta-comment or tangent)?'

  const prompt = `Analyze this group chat for a substantive disagreement:

${conversation}
${topicLine}
Answer each question independently:

1. has_direct_opposition: Are two personas taking clearly opposing positions on the same claim? (not just different perspectives — actual contradiction)
2. has_specific_claim: Is the disagreement about a SPECIFIC claim (not vague like "Bitcoin" or "regulation")?
${topicRelevantLine}

RESPOND WITH JSON:
{
  "has_direct_opposition": boolean,
  "has_specific_claim": boolean,
  "topic_relevant": boolean,
  "personas": ["name1", "name2"],
  "topic": "the specific claim they disagree on",
  "shortLabel": "2-4 word label"
}`

  try {
    const result = await completeJSON<DetectionResult>({
      system: 'You detect substantive disagreements in conversations. Be conservative — only flag clear, committed opposing positions.',
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 150,
      temperature: 0.2,
    })

    if (!result.has_direct_opposition || !result.has_specific_claim || !result.topic_relevant) return null
    if (result.personas.length < 2) return null

    // Map names back to IDs
    const personaIds = result.personas
      .map(name => {
        for (const [id, pName] of personaNames.entries()) {
          if (pName === name) return id
        }
        return null
      })
      .filter(Boolean) as string[]

    if (personaIds.length < 2) return null

    // For sequential detection, spawnCruxRoom is false — the orchestrator uses
    // the CandidateRegistry for consecutive window tracking before spawning.
    return {
      personas: personaIds,
      topic: result.topic,
      shortLabel: result.shortLabel ?? result.topic.split(' ').slice(0, 4).join(' '),
      spawnCruxRoom: false,
    }
  } catch (error) {
    console.error('[detector] Error:', error)
    return null
  }
}

/**
 * Detect disagreements from parallel takes on the same aspect.
 * Analyzes 3-4 parallel responses and finds the pair with strongest opposition.
 * Returns spawnCruxRoom=true if all boolean conditions met (no consecutive window needed).
 */
export async function detectDisagreementFromTakes(
  takes: DialogueMessage[],
  personaNames: Map<string, string>,
  debateTopic: string,
): Promise<{ personas: string[]; topic: string; shortLabel: string; spawnCruxRoom: boolean } | null> {
  if (takes.length < 2) return null

  const formatted = takes
    .map(msg => `${personaNames.get(msg.personaId) ?? msg.personaId}: ${msg.content}`)
    .join('\n\n')

  const prompt = `These are parallel responses from different debaters on the same aspect of "${debateTopic}":

${formatted}

Identify the strongest disagreement between any two participants:

1. has_direct_opposition: Do any two participants take clearly opposing positions?
2. has_specific_claim: Is the opposition about a specific claim?
3. topic_relevant: Is this relevant to "${debateTopic}"?

If yes to all three, identify the two participants who most strongly disagree.
If no clear opposition exists, set has_direct_opposition to false.

RESPOND WITH JSON:
{
  "has_direct_opposition": boolean,
  "has_specific_claim": boolean,
  "topic_relevant": boolean,
  "personas": ["name1", "name2"],
  "topic": "specific claim they disagree on",
  "shortLabel": "2-4 word label"
}`

  try {
    const result = await completeJSON<DetectionResult>({
      system: 'You detect substantive disagreements between parallel debate responses. Be conservative — only flag clear opposing positions.',
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 150,
      temperature: 0.2,
    })

    if (!result.has_direct_opposition || !result.has_specific_claim || !result.topic_relevant) return null
    if (result.personas.length < 2) return null

    // Map names back to IDs
    const personaIds = result.personas
      .map(name => {
        for (const [id, pName] of personaNames.entries()) {
          if (pName === name) return id
        }
        return null
      })
      .filter(Boolean) as string[]

    if (personaIds.length < 2) return null

    // For parallel takes, spawn directly — no need for consecutive window tracking
    return {
      personas: personaIds,
      topic: result.topic,
      shortLabel: result.shortLabel ?? result.topic.split(' ').slice(0, 4).join(' '),
      spawnCruxRoom: true,
    }
  } catch (error) {
    console.error('[detector] Error detecting from takes:', error)
    return null
  }
}
