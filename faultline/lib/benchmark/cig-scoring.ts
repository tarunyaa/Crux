// ─── CIG Benchmark Scoring ──────────────────────────────────
//
// Self-consistency scoring only. No ground-truth scoring.

import { completeJSON } from '@/lib/llm/client'

// ─── Types ──────────────────────────────────────────────────

export interface DFSResult {
  flipped: boolean
  explanation: string
}

// ─── Decision Flip Score (DFS) ──────────────────────────────

/**
 * Inject "what if assumption X flips?" and check if the
 * decision coherently pivots. Self-consistency check — not ground-truth.
 */
export async function scoreDFS(
  output: string,
  assumption: string,
): Promise<DFSResult> {
  const result = await completeJSON<{ flipped: boolean; explanation: string }>({
    system: 'You evaluate whether a specific assumption is truly decisive for a given analysis. A decisive assumption is one where, if it turned out to be wrong, the overall conclusion would change.',
    messages: [{
      role: 'user',
      content: `## Analysis
${output}

## Assumption to test
"${assumption}"

Imagine this assumption turns out to be FALSE. Would the conclusion of the analysis above coherently flip or substantially change?

- "flipped": true if the conclusion would change, false if it would remain the same
- "explanation": 1-2 sentences explaining why

Output JSON:
{
  "flipped": true/false,
  "explanation": "..."
}`,
    }],
    model: 'haiku',
    maxTokens: 512,
    temperature: 0.2,
  })

  return {
    flipped: result.flipped ?? false,
    explanation: result.explanation ?? '',
  }
}
