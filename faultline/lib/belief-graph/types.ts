// ─── Belief Graph Debate Types ────────────────────────────────

// ─── QBAF Core ───────────────────────────────────────────────

export interface QBAFNode {
  id: string
  claim: string
  type: 'root' | 'pro' | 'con' | 'evidence'
  baseScore: number           // τ ∈ [0,1] — intrinsic plausibility
  dialecticalStrength: number // σ ∈ [0,1] — computed by DF-QuAD
  grounding: string[]         // corpus chunk IDs
  personaId: string           // who originated this node
  depth: number               // distance from root (0 = root claim)
}

export interface QBAFEdge {
  id: string
  from: string                // source node ID
  to: string                  // target node ID
  type: 'attack' | 'support'
  weight: number              // edge strength ∈ [0,1]
}

export interface PersonaQBAF {
  personaId: string
  topic: string
  rootClaim: string           // root node ID
  nodes: QBAFNode[]
  edges: QBAFEdge[]
}

// ─── Pairwise Structural Diff ───────────────────────────────

export interface ClaimMapping {
  nodeIdA: string
  nodeIdB: string
  relationship: 'agreement' | 'opposition' | 'related'
  confidence: number
  sharedTopic: string
}

export interface PairwiseDiff {
  personaA: string
  personaB: string
  contradictions: ClaimMapping[]
  agreements: ClaimMapping[]
  gaps: string[]              // node IDs present in one QBAF but unmatched in the other
}

// ─── Community Graph ─────────────────────────────────────────

export interface CommunityNode {
  id: string
  claim: string
  mergedFrom: string[]                   // original node IDs from persona QBAFs
  baseScores: Record<string, number>     // personaId → τ
  communityStrength: number              // DF-QuAD on averaged base scores
  variance: number                       // variance of per-persona strengths
  classification: 'consensus' | 'crux' | 'neutral'
}

export interface CommunityGraph {
  topic: string
  personas: string[]
  nodes: CommunityNode[]
  edges: QBAFEdge[]
  cruxNodes: string[]                    // node IDs where variance > threshold
  consensusNodes: string[]               // node IDs where variance < threshold
}

// ─── Structural Crux ─────────────────────────────────────────

export interface PersonaCruxPosition {
  baseScore: number
  dialecticalStrength: number
  contribution: number                   // τ × Δ_edge toward their root
}

export interface StructuralCrux {
  id: string
  nodeId: string                         // the community graph node
  claim: string
  cruxScore: number                      // |contribution_A - contribution_B|
  disagreementType: 'base_score' | 'edge_structure' | 'both'
  personaPositions: Record<string, PersonaCruxPosition>
  counterfactual: string                 // natural language counterfactual
  settlingQuestion: string               // what evidence would resolve this?
}

// ─── Experiment Config / Result ──────────────────────────────

export interface ExperimentConfig {
  topic: string
  personaIds: string[]                   // N personas (min 2)
  revisionEnabled?: boolean              // default true
  convergenceThreshold: number           // default 0.02
  cruxVarianceThreshold: number          // default 0.3
  consensusVarianceThreshold: number     // default 0.1
}

export interface RevisionSnapshot {
  personaId: string
  preRootStrength: number
  postRootStrength: number
  cost: number                           // Σ|Δτ|
  R: number                              // revision resistance
  reasoning: string
}

export interface BenchmarkMetrics {
  rootStrengthDelta: Record<string, number>  // personaId → |σ_final - σ_initial|
  stanceDivergence: number                   // ΔSD
  beliefRevisionCost: Record<string, number> // personaId → total Σ|Δτ| / |nodes|
  cruxLocalizationRate: number               // % nodes with crux_score > 0.3
  argumentCoverage: number                   // |community_nodes| / (N × |initial_nodes|)
  counterfactualSensitivity: number          // top crux: |Δσ(root)| when removed
  decisionFlipScore: { flipped: boolean; explanation: string } | null
}

export interface ExperimentResult {
  config: ExperimentConfig
  diffs: PairwiseDiff[]
  revisions: RevisionSnapshot[]
  communityGraph: CommunityGraph
  cruxes: StructuralCrux[]
  benchmarks: BenchmarkMetrics
  timestamp: string
}

// ─── Belief Revision ─────────────────────────────────────────

export interface RevisionResult {
  adjustedScores: Record<string, number>    // nodeId → new τ
  totalShift: number                        // Σ|Δτ|
  polarityMap: Record<string, 'positive' | 'negative' | 'neutral'>
}

// ─── SSE Events ──────────────────────────────────────────────

export type BeliefGraphEvent =
  | { type: 'experiment_start'; topic: string; personas: string[] }
  | { type: 'extraction_start'; personaId: string }
  | { type: 'extraction_complete'; personaId: string; qbaf: PersonaQBAF }
  | { type: 'diff_start'; personaA: string; personaB: string }
  | { type: 'diff_complete'; diff: PairwiseDiff }
  | { type: 'revision_complete'; personaId: string; rootStrength: number; revisionCost: number; R: number; reasoning: string; adjustedScores?: Record<string, number> }
  | { type: 'community_graph_built'; graph: CommunityGraph }
  | { type: 'cruxes_identified'; cruxes: StructuralCrux[] }
  | { type: 'benchmarks_computed'; benchmarks: BenchmarkMetrics }
  | { type: 'experiment_complete'; result: ExperimentResult }
  | { type: 'error'; error: string }
