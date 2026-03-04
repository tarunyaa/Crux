// ─── Assumption Overlap Analysis ────────────────────────────
//
// Pure string comparison across condition assumption lists.
// No LLM calls — intentionally simple normalized matching.

import type { Condition } from '@/lib/benchmark/cig-conditions'
import type { OverlapResult } from '@/lib/benchmark/types'

/**
 * Normalize an assumption string for comparison.
 * Lowercases, strips punctuation, collapses whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if two normalized strings are "close enough" to be the same assumption.
 * Uses token overlap ratio — if >70% of tokens overlap, treat as same.
 */
function isSimilar(a: string, b: string): boolean {
  if (a === b) return true
  const tokensA = new Set(a.split(' '))
  const tokensB = new Set(b.split(' '))
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length
  const smaller = Math.min(tokensA.size, tokensB.size)
  return smaller > 0 && intersection / smaller >= 0.6
}

/**
 * Compute overlap analysis across all conditions' assumption lists.
 */
export function computeOverlap(
  conditionAssumptions: Partial<Record<Condition, string[]>>,
): OverlapResult {
  const conditions = Object.keys(conditionAssumptions) as Condition[]

  // Normalize all assumptions
  const normalized: Record<string, { original: string; norm: string }[]> = {}
  for (const cond of conditions) {
    normalized[cond] = (conditionAssumptions[cond] ?? []).map(a => ({
      original: a,
      norm: normalize(a),
    }))
  }

  // For each assumption in each condition, check if it appears in other conditions
  const uniqueAssumptions: Record<string, string[]> = {}
  const uniqueTo: Record<string, number> = {}

  for (const cond of conditions) {
    const unique: string[] = []
    for (const { original, norm } of normalized[cond]) {
      const otherConditions = conditions.filter(c => c !== cond)
      const foundInOther = otherConditions.some(other =>
        normalized[other].some(({ norm: otherNorm }) => isSimilar(norm, otherNorm))
      )
      if (!foundInOther) {
        unique.push(original)
      }
    }
    uniqueAssumptions[cond] = unique
    uniqueTo[cond] = unique.length
  }

  // Shared across ALL conditions
  let sharedAll = 0
  if (conditions.length >= 2) {
    const firstCond = conditions[0]
    for (const { norm } of normalized[firstCond]) {
      const inAll = conditions.slice(1).every(other =>
        normalized[other].some(({ norm: otherNorm }) => isSimilar(norm, otherNorm))
      )
      if (inAll) sharedAll++
    }
  }

  // Pairwise shared counts
  const pairwiseShared: Record<string, number> = {}
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const a = conditions[i]
      const b = conditions[j]
      let count = 0
      for (const { norm: normA } of normalized[a]) {
        if (normalized[b].some(({ norm: normB }) => isSimilar(normA, normB))) {
          count++
        }
      }
      pairwiseShared[`${a}+${b}`] = count
    }
  }

  return { sharedAll, uniqueTo, uniqueAssumptions, pairwiseShared }
}
