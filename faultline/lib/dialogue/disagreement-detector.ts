// ─── Disagreement Detection ───────────────────────────────────
// Tracks disagreement candidates across detection windows.
// A crux room only spawns after the same disagreement persists for
// 3 consecutive windows (≥9 messages on the same topic).

import type { DialogueMessage } from './types'
import type { DisagreementCandidate } from '@/lib/crux/types'
import { completeJSON } from '@/lib/llm/client'

interface DetectionResult {
  hasDisagreement: boolean
  personas: string[]
  topic: string
  shortLabel: string
  confidence: number
}

/**
 * Tracks a candidate disagreement over time.
 */
interface CandidateRecord {
  personas: string[]          // Normalized pair (sorted)
  topic: string
  shortLabel: string
  consecutiveWindows: number  // How many consecutive checks detected this
  confidence: number          // Latest confidence score
  firstSeenAt: number
  lastSeenAt: number
}

/**
 * Registry keyed by "personaA|personaB|topic" (normalized).
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
    confidence: number,
    activeRoomPairs: Set<string>,
  ): CandidateRecord | null {
    const key = CandidateRegistry.pairKey(detectedPersonas)
    const existing = this.records.get(key)

    const record: CandidateRecord = existing
      ? { ...existing, consecutiveWindows: existing.consecutiveWindows + 1, confidence, topic, shortLabel, lastSeenAt: Date.now() }
      : { personas: [...detectedPersonas].sort(), topic, shortLabel, consecutiveWindows: 1, confidence, firstSeenAt: Date.now(), lastSeenAt: Date.now() }

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

    // Confidence must be high enough
    if (record.confidence < 0.8) return false

    // No existing room for this pair
    if (activeRoomPairs.has(pairKey)) return false

    // Cooldown: 5 minutes since last room for this pair
    const lastSpawn = this.cooldowns.get(pairKey)
    if (lastSpawn && Date.now() - lastSpawn < 5 * 60 * 1000) return false

    return true
  }
}

/**
 * Detect disagreements in recent dialogue messages.
 * Uses a 10-message window and returns the detected candidate (if any).
 */
export async function detectDisagreements(
  messages: DialogueMessage[],
  personaNames: Map<string, string>,
): Promise<{ personas: string[]; topic: string; shortLabel: string; confidence: number } | null> {
  if (messages.length < 4) return null

  // 10-message window (up from 6)
  const recentMessages = messages.slice(-10)

  const conversation = recentMessages
    .map(msg => `${personaNames.get(msg.personaId) ?? msg.personaId}: ${msg.content}`)
    .join('\n')

  const prompt = `Analyze this group chat for a substantive disagreement:

${conversation}

A substantive disagreement requires:
1. Two personas taking clearly opposing positions on the same specific claim
2. At least 2 back-and-forth exchanges on the topic (not just passing comments)
3. Both have committed to a position (not just asking questions)

Skip: one-off comments, questions without opposing claims, minor quibbles

RESPOND WITH JSON:
{
  "hasDisagreement": boolean,
  "personas": ["name1", "name2"],
  "topic": "specific claim they disagree on (not vague like 'Bitcoin')",
  "shortLabel": "2-4 word label e.g. 'Yield timeline risk' or 'Adoption vs price'",
  "confidence": 0.0-1.0
}`

  try {
    const result = await completeJSON<DetectionResult>({
      system: 'You detect substantive disagreements in conversations. Be conservative — only flag clear, committed opposing positions.',
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 150,
      temperature: 0.2,
    })

    if (!result.hasDisagreement || result.confidence < 0.8) return null
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

    return { personas: personaIds, topic: result.topic, shortLabel: result.shortLabel ?? result.topic.split(' ').slice(0, 4).join(' '), confidence: result.confidence }
  } catch (error) {
    console.error('[detector] Error:', error)
    return null
  }
}
