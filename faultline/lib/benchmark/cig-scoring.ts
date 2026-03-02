// ─── CIG Benchmark Scoring ──────────────────────────────────
//
// Pure scoring functions using Haiku as judge.
// All functions take extracted data and return scored results.

import { completeJSON } from '@/lib/llm/client'

// ─── Types ──────────────────────────────────────────────────

export interface DARMatch {
  groundTruth: string
  matched: boolean
  confidence: number
  matchedAssumption?: string
  reasoning?: string
}

export interface DARResult {
  recall: number
  matches: DARMatch[]
}

export interface ANSResult {
  uniqueCount: number
  uniqueAssumptions: string[]
}

export interface DFSResult {
  flipped: boolean
  explanation: string
}

export interface JudgeScores {
  clarity: number
  robustness: number
  novelty: number
}

// ─── Decisive Assumption Recall (DAR) ───────────────────────

/**
 * For each ground-truth assumption, judge whether it was surfaced
 * in the output. Returns recall percentage.
 */
export async function scoreDAR(
  output: string[],
  groundTruth: string[],
): Promise<DARResult> {
  const outputList = output.map((a, i) => `${i + 1}. ${a}`).join('\n')

  const result = await completeJSON<{ matches: Array<{ index: number; matched: boolean; confidence: number; matchedIndex?: number; reasoning: string }> }>({
    system: `You are a strict semantic matching judge. You determine whether specific assumptions from a ground-truth list were directly addressed in an output list.

STRICT MATCHING RULES:
- Match ONLY if the output assumption addresses the SAME specific variable or mechanism as the ground truth.
- The output must identify the same causal factor, not merely a related topic area.
- "Related to the same industry" or "in the same category" is NOT a match.
- "Mentions a similar theme but different mechanism" is NOT a match.
- When in doubt, mark as NOT matched. False negatives are better than false positives.

Examples of NON-matches:
- Ground truth: "Whether Chinese HBM reaches production quality" vs Output: "Whether inference volume grows 4x" → NOT a match (different mechanism entirely)
- Ground truth: "Whether hyperscaler vertical integration reduces demand" vs Output: "Whether hyperscalers choose low-HBM architectures" → NOT a match (architecture choice ≠ vertical integration into manufacturing)

Examples of valid matches:
- Ground truth: "Whether inference shifts memory requirements away from HBM" vs Output: "Whether inference workloads can optimize away from HBM at scale" → MATCH (same mechanism)
- Ground truth: "Whether Chinese HBM reaches production quality" vs Output: "Whether CXMT achieves viable HBM3 yields by 2027" → MATCH (same variable, more specific)`,
    messages: [{
      role: 'user',
      content: `## Ground-Truth Assumptions
${groundTruth.map((a, i) => `${i + 1}. ${a}`).join('\n')}

## Output Assumptions
${outputList || '(none)'}

For EACH ground-truth assumption (by index), determine:
- "matched": true ONLY if the output contains an assumption about the SAME specific causal variable or mechanism
- "confidence": 0.0-1.0 how confident you are in the match
- "matchedIndex": 1-based index of the matching output assumption (omit if no match)
- "reasoning": 1 sentence explaining why this is or isn't a match

Output JSON:
{
  "matches": [
    { "index": 1, "matched": true/false, "confidence": 0.0-1.0, "matchedIndex": N, "reasoning": "..." }
  ]
}`,
    }],
    model: 'haiku',
    maxTokens: 2048,
    temperature: 0.2,
  })

  const matches: DARMatch[] = groundTruth.map((gt, i) => {
    const m = result.matches.find(r => r.index === i + 1)
    return {
      groundTruth: gt,
      matched: m?.matched ?? false,
      confidence: m?.confidence ?? 0,
      matchedAssumption: m?.matchedIndex ? output[m.matchedIndex - 1] : undefined,
      reasoning: m?.reasoning,
    }
  })

  const matchedCount = matches.filter(m => m.matched).length
  const recall = groundTruth.length > 0 ? matchedCount / groundTruth.length : 0

  return {
    recall: Math.round(recall * 1000) / 1000,
    matches,
  }
}

// ─── Assumption Novelty Score (ANS) ─────────────────────────

/**
 * Count assumptions in cruxOutput that are NOT present in baselineOutput.
 * Returns unique assumptions contributed by the Crux condition.
 */
export async function scoreANS(
  cruxOutput: string[],
  baselineOutput: string[],
): Promise<ANSResult> {
  const result = await completeJSON<{ uniqueIndices: number[] }>({
    system: 'You compare two lists of assumptions and identify which ones in List A are genuinely novel — not present (even in different wording) in List B.',
    messages: [{
      role: 'user',
      content: `## List A (Crux output)
${cruxOutput.map((a, i) => `${i + 1}. ${a}`).join('\n')}

## List B (Baseline output)
${baselineOutput.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Which assumptions in List A are NOT semantically covered by any assumption in List B?

Output JSON:
{
  "uniqueIndices": [1-based indices of novel assumptions in List A]
}`,
    }],
    model: 'haiku',
    maxTokens: 1024,
    temperature: 0.2,
  })

  const uniqueAssumptions = (result.uniqueIndices ?? [])
    .filter(i => i >= 1 && i <= cruxOutput.length)
    .map(i => cruxOutput[i - 1])

  return {
    uniqueCount: uniqueAssumptions.length,
    uniqueAssumptions,
  }
}

// ─── Decision Flip Score (DFS) ──────────────────────────────

/**
 * Inject "what if assumption X flips?" and check if the
 * decision coherently pivots.
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

// ─── Blind Quality Judge ────────────────────────────────────

/**
 * Rate an analysis output on clarity, robustness, and novelty (1-5 each).
 * Designed to be called on blinded outputs (judge doesn't know which condition).
 */
export async function blindJudge(output: string): Promise<JudgeScores> {
  const result = await completeJSON<{ clarity: number; robustness: number; novelty: number }>({
    system: 'You are a blind evaluator rating the quality of an analysis. Score each dimension 1-5. Be calibrated: 3 is average, 5 is exceptional.',
    messages: [{
      role: 'user',
      content: `## Analysis to evaluate
${output}

Rate this analysis on three dimensions (1-5 each):

1. **Clarity** (1-5): Are the assumptions clearly stated and well-defined? Can a decision-maker act on them?
2. **Robustness** (1-5): Does the analysis consider multiple angles, edge cases, and counterarguments?
3. **Novelty** (1-5): Does it surface non-obvious assumptions that a generalist would miss?

Output JSON:
{
  "clarity": N,
  "robustness": N,
  "novelty": N
}`,
    }],
    model: 'haiku',
    maxTokens: 256,
    temperature: 0.2,
  })

  return {
    clarity: clamp(result.clarity ?? 3, 1, 5),
    robustness: clamp(result.robustness ?? 3, 1, 5),
    novelty: clamp(result.novelty ?? 3, 1, 5),
  }
}

// ─── Helpers ────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
