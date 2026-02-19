// ─── Core Types for Dialogue Layer ───────────────────────────

import type { DisagreementCandidate, CruxCard, CruxMessage } from '@/lib/crux/types'

export type PersonaId = string

export interface DialogueMessage {
  id: string
  personaId: PersonaId
  content: string
  replyTo?: string        // Message ID being replied to (for @mention display)
  timestamp: number
}

export interface DialogueState {
  topic: string
  messages: DialogueMessage[]
  activePersonas: PersonaId[]
  startTime: number
  lastSpeakerId?: PersonaId
}

export interface DialogueConfig {
  topic: string
  personaIds: PersonaId[]
  maxMessages?: number         // Default: 50
  maxDurationMs?: number       // Default: 5 minutes
}

// SSE Events
export type DialogueEvent =
  | { type: 'dialogue_start'; topic: string; personas: PersonaId[] }
  | { type: 'message_posted'; message: DialogueMessage }
  | { type: 'disagreement_detected'; candidate: DisagreementCandidate }
  | { type: 'crux_room_spawning'; roomId: string; question: string; label: string; personas: PersonaId[] }
  | { type: 'crux_message'; roomId: string; message: CruxMessage }
  | { type: 'crux_card_posted'; card: CruxCard }
  | { type: 'dialogue_complete'; finalState: DialogueState }
  | { type: 'error'; error: string }
