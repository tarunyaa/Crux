// ─── Stance Extraction via Haiku ────────────────────────────

import { completeJSON } from '@/lib/llm/client'

interface StanceScores {
  /** Per-persona stance score (-2 to +2) on each claim, pre-debate */
  pre: Record<string, number>
  /** Per-persona stance score (-2 to +2) on each claim, post-debate */
  post: Record<string, number>
}

interface HaikuStanceResult {
  claims: string[]
  pre: Record<string, number[]>
  post: Record<string, number[]>
}

/**
 * Ask Haiku to rate each persona's stance on the topic's key claims
 * from their opening vs closing statements. Returns per-persona
 * average stance scores (mean across claims).
 */
export async function extractStances(
  topic: string,
  openingMessages: { personaId: string; content: string }[],
  closingMessages: { personaId: string; content: string }[],
  personaNames: Map<string, string>,
): Promise<StanceScores> {
  const names = [...personaNames.values()]

  const openingsText = openingMessages
    .map(m => `${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
    .join('\n\n')

  const closingsText = closingMessages
    .map(m => `${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
    .join('\n\n')

  const result = await completeJSON<HaikuStanceResult>({
    system: 'You extract stance positions from debate statements. Output valid JSON only.',
    messages: [{
      role: 'user',
      content: `Topic: "${topic}"

## Opening Statements
${openingsText}

## Closing Statements
${closingsText}

Identify 2-4 key contested claims in this debate. For each persona, rate their stance on EACH claim using this scale:
- -2: Strongly against
- -1: Leaning against
- 0: Neutral/unclear
- +1: Leaning for
- +2: Strongly for

Output JSON:
{
  "claims": ["claim 1", "claim 2", ...],
  "pre": { ${names.map(n => `"${n}": [-2 to +2 per claim]`).join(', ')} },
  "post": { ${names.map(n => `"${n}": [-2 to +2 per claim]`).join(', ')} }
}

Rate based ONLY on what was actually said. Integers only.`,
    }],
    model: 'haiku',
    maxTokens: 1024,
    temperature: 0.2,
  })

  // Average across claims per persona
  const pre: Record<string, number> = {}
  const post: Record<string, number> = {}

  for (const name of names) {
    const preScores = result.pre[name] ?? []
    const postScores = result.post[name] ?? []
    pre[name] = preScores.length > 0
      ? preScores.reduce((a, b) => a + b, 0) / preScores.length
      : 0
    post[name] = postScores.length > 0
      ? postScores.reduce((a, b) => a + b, 0) / postScores.length
      : 0
  }

  return { pre, post }
}
