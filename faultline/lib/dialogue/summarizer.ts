// ─── Post-Debate Summarizer ──────────────────────────────────
// Single Sonnet pass over the full transcript. Strictly grounded —
// only extracts what was actually said, no invented analysis.

import type { DialogueMessage, DebateSummary, PersonaId } from './types'
import type { CruxCard } from '@/lib/crux/types'
import { completeJSON } from '@/lib/llm/client'

export async function summarizeDebate(
  topic: string,
  messages: DialogueMessage[],
  cruxCards: CruxCard[],
  personaIds: PersonaId[],
  personaNames: Map<string, string>,
): Promise<DebateSummary | null> {
  if (messages.length < 4) return null

  const transcript = messages
    .map(m => `${personaNames.get(m.personaId) ?? m.personaId}: ${m.content}`)
    .join('\n\n')

  const cruxSummary = cruxCards.length > 0
    ? '\n\nCrux cards produced during the debate:\n' + cruxCards.map(c => {
        const positions = Object.entries(c.personas)
          .map(([id, d]) => `  ${personaNames.get(id) ?? id}:\n    Position: ${d.position}\n    Reasoning: ${d.reasoning}${d.falsifier ? `\n    Would change mind if: ${d.falsifier}` : ''}`)
          .join('\n')
        return `- Question: "${c.question}"\n  Type: ${c.disagreementType}\n  Diagnosis: ${c.diagnosis}\n  Resolved: ${c.resolved}${c.resolution ? ` — ${c.resolution}` : ''}\n${positions}`
      }).join('\n\n')
    : ''

  const personaList = personaIds
    .map(id => `"${id}": "${personaNames.get(id) ?? id}"`)
    .join(', ')

  console.log(`[summarizer] Starting: ${messages.length} messages, ${cruxCards.length} crux cards, ${personaIds.length} personas`)

  try {
    const result = await completeJSON<DebateSummary>({
      system: `You summarize debates by extracting ONLY what participants actually said. Never invent claims, evidence, or positions that weren't stated. If a participant didn't mention something, don't attribute it to them. Quote their words or closely paraphrase — do not generalize or interpret beyond what was said. Respond with a single JSON object. Keep reasoning strings concise (1-2 sentences each) to stay within token limits.`,
      messages: [{
        role: 'user',
        content: `Summarize this debate on "${topic}".

Participants: {${personaList}}

Full transcript:
${transcript}
${cruxSummary}

Extract the following as JSON. ONLY include what was actually said:

1. "claims": 3-5 main claims debated. For each, list each participant's stance (for/against/mixed) and 1-2 sentence reasoning using their words.

2. "agreements": 1-3 points all participants agreed on.

3. "evidenceLedger": For each participant, what they ACCEPTED (conceded/built upon) vs CHALLENGED (disputed/rebutted). Each entry: {"claim": "...", "reason": "..."}. Keep reasons to 1 sentence.

4. "flipConditions": For each participant, what they said would change their mind. Empty array if unstated.

5. "resolutionPaths": 2-4 specific testable conditions that would settle disputes. Format: "If [specific condition], then [what it settles]".

JSON schema:
{"claims":[{"claim":"str","stances":[{"personaId":"str","position":"for|against|mixed","reasoning":"str"}]}],"agreements":["str"],"evidenceLedger":[{"personaId":"str","accepted":[{"claim":"str","reason":"str"}],"challenged":[{"claim":"str","reason":"str"}]}],"flipConditions":[{"personaId":"str","conditions":["str"]}],"resolutionPaths":["str"]}`,
      }],
      model: 'sonnet',
      maxTokens: 4096,
      temperature: 0.2,
    })

    // Validate required fields exist
    if (!result.claims || !result.evidenceLedger || !result.resolutionPaths) {
      console.error('[summarizer] Missing required fields. Got keys:', Object.keys(result))
      return null
    }

    console.log(`[summarizer] Success: ${result.claims.length} claims, ${result.evidenceLedger.length} ledger entries, ${result.resolutionPaths.length} paths`)
    return result
  } catch (error) {
    console.error('[summarizer] Error:', error)
    return null
  }
}
