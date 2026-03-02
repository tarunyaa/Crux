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
  round: number               // which debate round this represents
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
  personaIds: [string, string]           // exactly 2 personas
  maxRounds: number                      // default 5
  convergenceThreshold: number           // default 0.02
  cruxVarianceThreshold: number          // default 0.3
  consensusVarianceThreshold: number     // default 0.1
}

export interface RoundSnapshot {
  round: number
  qbafs: Record<string, PersonaQBAF>    // personaId → QBAF at this round
  rootStrengths: Record<string, number>  // personaId → σ(root)
  revisionCosts: Record<string, number>  // personaId → Σ|Δτ| this round
}

export interface BenchmarkMetrics {
  rootStrengthDelta: Record<string, number>  // personaId → |σ_final - σ_initial|
  stanceDivergence: number                   // ΔSD
  beliefRevisionCost: Record<string, number> // personaId → total Σ|Δτ| / |nodes|
  cruxLocalizationRate: number               // % nodes with crux_score > 0.3
  argumentCoverage: number                   // |community_nodes| / (2 × |initial_nodes|)
  graphGrowthRate: Record<string, number>    // personaId → |final_nodes| / |initial_nodes|
  counterfactualSensitivity: number          // top crux: |Δσ(root)| when removed
  decisionFlipScore: { flipped: boolean; explanation: string } | null  // CIG: does top crux flip conclusion?
  convergenceRound: number | null            // round where Δσ < threshold, or null
}

export interface ExperimentResult {
  config: ExperimentConfig
  rounds: RoundSnapshot[]
  communityGraph: CommunityGraph
  cruxes: StructuralCrux[]
  benchmarks: BenchmarkMetrics
  totalRounds: number
  converged: boolean
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
  | { type: 'round_start'; round: number }
  | { type: 'debate_moves'; round: number; personaId: string; newNodes: number; newEdges: number }
  | { type: 'revision_complete'; round: number; personaId: string; rootStrength: number; revisionCost: number; R: number; reasoning: string }
  | { type: 'round_complete'; round: number; snapshot: RoundSnapshot }
  | { type: 'convergence_check'; round: number; converged: boolean; deltas: Record<string, number> }
  | { type: 'community_graph_built'; graph: CommunityGraph }
  | { type: 'cruxes_identified'; cruxes: StructuralCrux[] }
  | { type: 'benchmarks_computed'; benchmarks: BenchmarkMetrics }
  | { type: 'experiment_complete'; result: ExperimentResult }
  | { type: 'error'; error: string }
