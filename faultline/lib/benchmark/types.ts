// ─── CIG Benchmark v2 Types ─────────────────────────────────
//
// Human-judged crux comparison — no LLM-based scoring.

import type { TokenUsage } from '@/lib/llm/client'
import type { CruxCard, Condition } from '@/lib/benchmark/cig-conditions'

export type { Condition }

export interface FlipSensitivity {
  assumption: string
  flipped: boolean
  explanation: string
}

export interface StructuralMetrics {
  /** Tokens per assumption — cost normalization */
  tokensPerAssumption: number
  /** Per-round cosine distance between personas (dialogue/belief-graph only) */
  semanticSpread?: { perRound: number[]; slope: number }
  /** Cosine similarity of crux cards to source messages (dialogue only) */
  cruxGrounding?: { mean: number; perCard: number[] }
  /** Opening vs closing embedding distance delta (dialogue only) */
  stanceDiversity?: { pre_dist: number; post_dist: number; delta: number }
}

export interface ConditionResultV2 {
  rawOutput: string
  assumptions: string[]
  cruxCards: CruxCard[]
  flipSensitivity: FlipSensitivity[]
  tokenUsage: TokenUsage
  structuralMetrics?: StructuralMetrics
}

export interface OverlapResult {
  sharedAll: number
  uniqueTo: Record<string, number>
  uniqueAssumptions: Record<string, string[]>
  pairwiseShared: Record<string, number>
}

export interface TaskResultV2 {
  taskId: string
  topic: string
  category: string
  timestamp: string
  conditions: Partial<Record<Condition, ConditionResultV2>>
  overlap: OverlapResult
}

export interface SummaryResultV2 {
  timestamp: string
  taskCount: number
  meanAssumptions: Record<string, number>
  meanUniqueAssumptions: Record<string, number>
  totalTokens: Record<string, TokenUsage>
}
