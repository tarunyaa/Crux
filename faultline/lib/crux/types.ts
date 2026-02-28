// ─── Crux Room Types ──────────────────────────────────────────

export type PersonaId = string

export type DisagreementType =
  | 'horizon'      // Different time horizons
  | 'evidence'     // Different data/sources
  | 'values'       // Different priorities
  | 'definition'   // Different terms
  | 'claim'        // Disputing conclusion
  | 'premise'      // Disputing assumption

export type Position = 'YES' | 'NO' | 'NUANCED'

/**
 * Disagreement candidate detected in dialogue
 */
export interface DisagreementCandidate {
  messages: string[]                 // Message IDs involved
  personas: PersonaId[]              // Who's disagreeing
  topic: string                      // What they're disagreeing about
  confidence: number                 // 0-1
}

/**
 * Crux room state — now a free conversation, no phases
 */
export interface CruxRoom {
  id: string
  question: string
  personas: PersonaId[]
  status: 'arguing' | 'complete'
  messages: CruxMessage[]
  resolved: boolean
  sourceMessages: string[]
  startTime: number
}

/**
 * Message in crux room
 */
export interface CruxMessage {
  id: string
  type: 'system' | 'persona'
  personaId?: PersonaId
  content: string
  timestamp: number
  phase?: 'position' | 'exchange' | 'convergence'
}

/**
 * Crux card — output of crux room
 */
export interface CruxCard {
  id: string
  question: string

  personas: {
    [personaId: string]: {
      position: Position
      reasoning: string
      falsifier?: string
    }
  }

  disagreementType: DisagreementType
  diagnosis: string

  resolved: boolean
  resolution?: string

  sourceMessages: string[]
  cruxRoomId: string
  timestamp: number
}

/**
 * Crux room SSE events
 */
export type CruxEvent =
  | { type: 'crux_room_spawned'; room: CruxRoom }
  | { type: 'crux_message'; roomId: string; message: CruxMessage }
  | { type: 'crux_card_generated'; card: CruxCard }
  | { type: 'crux_room_complete'; roomId: string }
