import type { Argument, Attack, ValidationResult, Labelling } from './graph'

// ─── Primitives ───────────────────────────────────────────────

export type PersonaId = string
export type DeckId = string
export type Stance = 'pro' | 'con' | 'uncertain'
export type DebateMode = 'blitz' | 'classical' | 'graph' | 'v2' | 'dialogue'

// ─── Personas ─────────────────────────────────────────────────

export interface Persona {
  id: PersonaId
  name: string
  twitterHandle: string
  twitterPicture: string
  deckIds: DeckId[]
  suite: string | null
  locked: boolean
}

export interface EvidencePolicy {
  acceptableSources: string[]
  unacceptableSources: string[]
  weightingRules: string
  toolPullTriggers: string
}

export interface AnchorExcerpt {
  id: string
  content: string
  source: string
  date: string
}

export interface PersonaContract {
  personaId: PersonaId
  version: string // ISO timestamp of corpus build
  personality: string
  bias: string
  stakes: string
  epistemology: string
  timeHorizon: string
  flipConditions: string
  evidencePolicy: EvidencePolicy
  anchorExcerpts: AnchorExcerpt[]
}

// ─── Decks ────────────────────────────────────────────────────

export interface Deck {
  id: DeckId
  name: string
  slug: string
  personaIds: PersonaId[]
  locked: boolean
  createdAt?: string
}

// ─── Claims & Stances ─────────────────────────────────────────

export interface Claim {
  id: string
  text: string
  debateId: string
}

export interface AgentStance {
  personaId: PersonaId
  claimId: string
  stance: Stance
  confidence: number // 0.0 – 1.0
  round: number
}

// ─── Debate Results ───────────────────────────────────────────

export interface Crux {
  id: string
  proposition: string
  weight: number
  surfacedByTables: number[]
  resolved: boolean
}

export interface FlipCondition {
  personaId: PersonaId
  condition: string
  claimId: string
  triggered: boolean
}

// ─── Convergence ──────────────────────────────────────────────

export interface ConvergenceState {
  entropy: number
  confidenceWeightedDistance: number
  unresolvedCruxCount: number
  converged: boolean
  diverged: boolean
  eventCount: number
  maxEvents: number
}

// ─── Debate Output ────────────────────────────────────────────

export interface FaultLine {
  category: 'time_horizon' | 'assumptions' | 'identity_values' | 'epistemology' | 'stakes'
  description: string
  relatedCruxIds: string[]
}

export interface EvidenceLedgerEntry {
  personaId: PersonaId
  accepted: string[]
  rejected: { evidence: string; reason: string }[]
}

export interface ResolutionPath {
  description: string
  relatedCruxIds: string[]
}

export interface DebateOutput {
  cruxes: Crux[]
  faultLines: FaultLine[]
  flipConditions: FlipCondition[]
  evidenceLedger: EvidenceLedgerEntry[]
  resolutionPaths: ResolutionPath[]
}

// ─── SSE Events ───────────────────────────────────────────────

export type SSEEvent =
  | { type: 'status'; phase: string; message: string }
  | { type: 'debate_start'; debateId: string; claims: Claim[] }
  | { type: 'table_assigned'; tableId: number; personaIds: PersonaId[] }
  | { type: 'agent_turn'; personaId: PersonaId; tableId: number; content: string; stance: AgentStance; stances: AgentStance[]; round: number }
  | { type: 'blackboard_update'; tableId: number; summary: string }
  | { type: 'convergence_update'; metrics: ConvergenceState }
  | { type: 'merge_start'; round: number }
  | { type: 'merge_complete'; mergedCruxes: Crux[] }
  | { type: 'final_table_start'; personaIds: PersonaId[] }
  | { type: 'speaker_selected'; personaId: PersonaId; urgency: number; intent: string }
  | { type: 'initial_stance'; personaId: PersonaId; stances: AgentStance[]; reasonings: { claimId: string; reasoning: string }[] }
  | { type: 'debate_complete'; output: DebateOutput }
  | { type: 'arguments_submitted'; personaId: PersonaId; arguments: Argument[]; round: number }
  | { type: 'attacks_generated'; attacks: Attack[]; round: number }
  | { type: 'validation_complete'; results: ValidationResult[]; round: number }
  | { type: 'graph_update'; labelling: Labelling; groundedSize: number; preferredCount: number; round: number }
  | { type: 'graph_convergence'; stable: boolean; newEdges: number; round: number }
  | { type: 'error'; message: string }

// ─── Belief Graph ─────────────────────────────────────────────

export interface BeliefNode {
  id: string
  concept: string
  type: 'core_value' | 'factual_claim' | 'inference' | 'assumption'
  grounding: string[]  // corpus chunk IDs (e.g., "tweet_42", "essay_3")
}

export interface BeliefEdge {
  from: string  // node ID
  to: string    // node ID
  polarity: 1 | -1
  confidence: number  // 0-1
  sourceChunks: string[]
}

export interface BeliefGraph {
  personaId: string
  personaName: string
  nodes: BeliefNode[]
  edges: BeliefEdge[]
  extractedAt: string  // ISO date
}

// ─── Agent Messages (shared with hooks & replay) ─────────────

export interface AgentMessage {
  personaId: string
  tableId: number
  content: string
  stance: AgentStance
  stances: AgentStance[]
  round: number
  timestamp: number
}

export interface InitialStanceEntry {
  personaId: string
  stances: AgentStance[]
  reasonings: { claimId: string; reasoning: string }[]
}

// ─── Debate Session ───────────────────────────────────────────

export interface DebateSession {
  id: string
  topic: string
  mode: DebateMode
  deckId: DeckId
  personaIds: PersonaId[]
  status: 'pending' | 'running' | 'completed' | 'error'
  createdAt: string
  output?: DebateOutput
}
