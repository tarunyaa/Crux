import type { PersonaId } from './index'
import type { Argument, Attack, ArgumentationGraphState } from './graph'

// ─── Dialogue Moves ────────────────────────────────────────

export type DialogueMove = 'CLAIM' | 'CHALLENGE' | 'CLARIFY' | 'CONCEDE' | 'REFRAME' | 'PROPOSE_CRUX'

export interface DialogueTurn {
  turnIndex: number
  phase: DebatePhase
  personaId: PersonaId
  dialogue: string          // 2-4 sentences, natural language
  move: DialogueMove
  steeringHint: string | null
  timestamp: number
}

// ─── Crystallization ───────────────────────────────────────

export interface CrystallizationResult {
  newArgs: Argument[]
  updatedArgs: { id: string; claim?: string; assumptions?: string[] }[]
  removedArgIds: string[]
  newAttacks: Attack[]
  removedAttackIds: string[]
}

// ─── Concession Tracking ───────────────────────────────────

export interface Concession {
  turnIndex: number
  personaId: PersonaId
  type: 'full' | 'partial' | 'scope_narrowing'
  concededClaim: string
  effect: string               // human-readable description of graph change
  removedArgIds: string[]
  updatedArgIds: string[]
}

// ─── Phases ────────────────────────────────────────────────

export type DebatePhase = 1 | 2 | 3 | 4

// ─── Controller ────────────────────────────────────────────

export interface ControllerState {
  phase: DebatePhase
  turnsSinceLastCrystallization: number
  substantiveMovesInWindow: DialogueMove[]
  contestedFrontierHistory: number[]
  concessions: Concession[]
  circlingDetected: boolean
}

export interface ControllerDecision {
  nextSpeaker: PersonaId
  steeringHint: string | null
  shouldCrystallize: boolean
  phaseTransition: { to: DebatePhase; reason: string } | null
}

// ─── Config ────────────────────────────────────────────────

export interface DebateEngineConfig {
  topic: string
  deckSlug?: string
  personaIds: PersonaId[]
  maxTurns?: number            // total dialogue turns budget (default 30)
}

// ─── Engine Output ─────────────────────────────────────────

export interface DebateEngineOutput {
  topic: string
  personaIds: PersonaId[]
  transcript: DialogueTurn[]
  graph: ArgumentationGraphState
  crux: {
    proposedBy: PersonaId[]
    statement: string
    assumptions: string[]
    acknowledged: boolean
  } | null
  commonGround: string[]       // grounded extension arg IDs
  camps: { personaIds: PersonaId[]; argumentIds: string[]; extensionIndex: number }[]
  concessionTrail: Concession[]
  regime: 'consensus' | 'polarized' | 'partial'
  regimeDescription: string
  tokenUsage: { inputTokens: number; outputTokens: number }
  duration: number
}

// ─── SSE Events ────────────────────────────────────────────

export type DebateEvent =
  | { type: 'engine_start'; topic: string; personaIds: PersonaId[] }
  | { type: 'phase_start'; phase: DebatePhase }
  | { type: 'phase_transition'; from: DebatePhase; to: DebatePhase; reason: string }
  | { type: 'dialogue_turn'; turn: DialogueTurn }
  | { type: 'steering'; hint: string; targetPersonaId: PersonaId }
  | { type: 'crystallization'; result: CrystallizationResult }
  | { type: 'graph_updated'; inCount: number; outCount: number; undecCount: number; preferredCount: number }
  | { type: 'concession'; concession: Concession }
  | { type: 'crux_proposed'; personaId: PersonaId; statement: string }
  | { type: 'convergence_check'; converged: boolean; reason: string | null }
  | { type: 'engine_complete'; output: DebateEngineOutput }
  | { type: 'engine_error'; message: string }
