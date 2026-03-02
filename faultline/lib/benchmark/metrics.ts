// ─── Benchmark Metrics ──────────────────────────────────────
//
// Pure computation functions. No LLM calls, no side effects.
// Takes pre-computed data (embeddings, stances) and returns scores.

import { cosineSim } from '@/lib/embeddings/client'

// ─── Types ──────────────────────────────────────────────────

export interface StanceDiversityHaiku {
  pre_sd: number
  post_sd: number
  delta_sd: number
}

export interface StanceDiversityEmbedding {
  pre_dist: number
  post_dist: number
  delta: number
}

export interface StanceDiversityResult {
  haiku: StanceDiversityHaiku
  embedding: StanceDiversityEmbedding
  correlation: number | null
}

export interface SemanticSpreadResult {
  perRound: number[]
  slope: number
}

export interface CruxGroundingResult {
  mean: number
  perCard: number[]
}

// ─── Stance Diversity (Haiku-scored) ────────────────────────

/**
 * ΔSD from Haiku stance scores.
 * pre/post: Record<personaName, averageStanceScore>
 */
export function computeStanceDiversityFromScores(
  pre: Record<string, number>,
  post: Record<string, number>,
): StanceDiversityHaiku {
  const preValues = Object.values(pre)
  const postValues = Object.values(post)
  const preSd = stddev(preValues)
  const postSd = stddev(postValues)
  return {
    pre_sd: round3(preSd),
    post_sd: round3(postSd),
    delta_sd: round3(postSd - preSd),
  }
}

// ─── Stance Diversity (Embedding-based) ─────────────────────

/**
 * ΔSD from embeddings.
 * openingEmbeddings/closingEmbeddings: one vector per persona.
 */
export function computeStanceDiversityFromEmbeddings(
  openingEmbeddings: number[][],
  closingEmbeddings: number[][],
): StanceDiversityEmbedding {
  const preDist = meanPairwiseDistance(openingEmbeddings)
  const postDist = meanPairwiseDistance(closingEmbeddings)
  return {
    pre_dist: round3(preDist),
    post_dist: round3(postDist),
    delta: round3(postDist - preDist),
  }
}

// ─── Semantic Spread ────────────────────────────────────────

export interface TaggedEmbedding {
  personaId: string
  round: number
  embedding: number[]
}

/**
 * Per-round mean pairwise cosine distance between different personas.
 */
export function computeSemanticSpread(
  tagged: TaggedEmbedding[],
): SemanticSpreadResult {
  // Group by round
  const byRound = new Map<number, TaggedEmbedding[]>()
  for (const t of tagged) {
    const arr = byRound.get(t.round) ?? []
    arr.push(t)
    byRound.set(t.round, arr)
  }

  const rounds = [...byRound.keys()].sort((a, b) => a - b)
  const perRound: number[] = []

  for (const round of rounds) {
    const items = byRound.get(round)!
    const distances: number[] = []

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].personaId !== items[j].personaId) {
          distances.push(1 - cosineSim(items[i].embedding, items[j].embedding))
        }
      }
    }

    perRound.push(distances.length > 0 ? round3(mean(distances)) : 0)
  }

  return {
    perRound,
    slope: perRound.length >= 2 ? round3(linearSlope(perRound)) : 0,
  }
}

// ─── Crux Grounding ─────────────────────────────────────────

export interface CruxCardData {
  question: string
  diagnosis: string
  sourceMessageIds: string[]
}

/**
 * For each crux card, compare card embedding to mean source message embedding.
 */
export function computeCruxGrounding(
  cardEmbeddings: number[][],
  sourceEmbeddingsPerCard: number[][][],
): CruxGroundingResult {
  if (cardEmbeddings.length === 0) {
    return { mean: 0, perCard: [] }
  }

  const perCard: number[] = []

  for (let i = 0; i < cardEmbeddings.length; i++) {
    const cardEmb = cardEmbeddings[i]
    const sourceEmbs = sourceEmbeddingsPerCard[i]

    if (sourceEmbs.length === 0) {
      perCard.push(0)
      continue
    }

    // Mean source embedding
    const meanSource = meanVector(sourceEmbs)
    perCard.push(round3(cosineSim(cardEmb, meanSource)))
  }

  return {
    mean: round3(mean(perCard)),
    perCard,
  }
}

// ─── Crux Recurrence ────────────────────────────────────────

/**
 * Cluster crux card embeddings across runs using threshold clustering.
 * Returns number of clusters spanning >= minRuns runs.
 */
export function computeCruxRecurrence(
  cardEmbeddings: { runIndex: number; embedding: number[] }[],
  minRuns: number = 3,
  threshold: number = 0.75,
): { stableClusters: number; totalClusters: number; ratio: number } | null {
  if (cardEmbeddings.length < 2) return null

  // Simple greedy threshold clustering
  const clusters: { members: { runIndex: number; embedding: number[] }[] }[] = []

  for (const card of cardEmbeddings) {
    let assigned = false
    for (const cluster of clusters) {
      const centroid = meanVector(cluster.members.map(m => m.embedding))
      if (cosineSim(card.embedding, centroid) >= threshold) {
        cluster.members.push(card)
        assigned = true
        break
      }
    }
    if (!assigned) {
      clusters.push({ members: [card] })
    }
  }

  const totalClusters = clusters.length
  const stableClusters = clusters.filter(c => {
    const uniqueRuns = new Set(c.members.map(m => m.runIndex))
    return uniqueRuns.size >= minRuns
  }).length

  return {
    stableClusters,
    totalClusters,
    ratio: totalClusters > 0 ? round3(stableClusters / totalClusters) : 0,
  }
}

// ─── Belief Adherence (Stub) ────────────────────────────────

/**
 * Placeholder — returns null until belief graphs exist.
 */
export function computeBeliefAdherence(): null {
  return null
}

// ─── Helpers ────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function meanPairwiseDistance(embeddings: number[][]): number {
  if (embeddings.length < 2) return 0
  const distances: number[] = []
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      distances.push(1 - cosineSim(embeddings[i], embeddings[j]))
    }
  }
  return mean(distances)
}

function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return []
  const dim = vectors[0].length
  const result = new Array(dim).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i]
  }
  for (let i = 0; i < dim; i++) result[i] /= vectors.length
  return result
}

function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
}

/**
 * Pearson correlation between two arrays.
 */
export function pearsonCorrelation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null
  const meanA = mean(a)
  const meanB = mean(b)
  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const denom = Math.sqrt(denA) * Math.sqrt(denB)
  return denom === 0 ? null : round3(num / denom)
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
