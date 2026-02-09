// ─── Primitives ───────────────────────────────────────────────

export type PersonaId = string
export type DeckId = string
export type Stance = 'pro' | 'con' | 'uncertain'
export type DebateMode = 'blitz' | 'classical'

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

// ─── Blackboard ───────────────────────────────────────────────

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

export interface Dispute {
  claimId: string
  sides: { personaId: PersonaId; stance: Stance; confidence: number }[]
}

export interface BlackboardState {
  topic: string
  claims: Claim[]
  cruxCandidates: Crux[]
  disputes: Dispute[]
  flipConditions: FlipCondition[]
  openQuestions: string[]
  stances: AgentStance[]
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

// ─── Action Plans (Classical Mode) ───────────────────────────

export interface ActionPlan {
  personaId: PersonaId
  action: 'speak' | 'interrupt' | 'listen'
  urgency: number
  intent: string
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
  | { type: 'initial_stance'; personaId: PersonaId; stances: AgentStance[]; reasoning: string }
  | { type: 'debate_complete'; output: DebateOutput }
  | { type: 'error'; message: string }

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
  reasoning: string
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
