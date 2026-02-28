// ─── Hydrate Dialogue Events for Replay ─────────────────────
// Replays stored DialogueEvent[] into the shape ThreeColumnLayout expects.

import type { DialogueMessage, DialogueEvent, DebateAspect, PositionShift, DebateSummary } from '@/lib/dialogue/types'
import type { CruxCard, CruxMessage, DisagreementType } from '@/lib/crux/types'

export interface ActiveCruxRoom {
  roomId: string
  question: string
  label: string
  personas: string[]
  messages: CruxMessage[]
  status: 'arguing' | 'complete'
}

export interface CruxTriggerInfo {
  roomId: string
  topic: string
  label: string
  disagreementType?: DisagreementType
}

export interface HydratedDialogueState {
  messages: DialogueMessage[]
  cruxCards: CruxCard[]
  completedRooms: Map<string, ActiveCruxRoom>
  cruxTriggerMap: Map<string, CruxTriggerInfo>
  aspects: DebateAspect[]
  shifts: PositionShift[]
  summary: DebateSummary | null
  error: string | null
}

export function hydrateDialogueState(events: DialogueEvent[]): HydratedDialogueState {
  const state: HydratedDialogueState = {
    messages: [],
    cruxCards: [],
    completedRooms: new Map(),
    cruxTriggerMap: new Map(),
    aspects: [],
    shifts: [],
    summary: null,
    error: null,
  }

  const activeRooms = new Map<string, ActiveCruxRoom>()

  for (const event of events) {
    switch (event.type) {
      case 'debate_start':
        state.aspects = event.aspects
        break

      case 'message_posted':
        state.messages.push(event.message)
        break

      case 'crux_room_spawning':
        activeRooms.set(event.roomId, {
          roomId: event.roomId,
          question: event.question,
          label: event.label,
          personas: event.personas,
          messages: [],
          status: 'arguing',
        })
        for (const msgId of event.sourceMessages) {
          state.cruxTriggerMap.set(msgId, {
            roomId: event.roomId,
            topic: event.question,
            label: event.label,
          })
        }
        break

      case 'crux_message': {
        const room = activeRooms.get(event.roomId)
        if (room) room.messages.push(event.message)
        break
      }

      case 'crux_card_posted': {
        state.cruxCards.push(event.card)
        const room = activeRooms.get(event.card.cruxRoomId)
        if (room) {
          activeRooms.delete(event.card.cruxRoomId)
          state.completedRooms.set(event.card.cruxRoomId, { ...room, status: 'complete' })
        }
        // Enrich trigger map with disagreement type
        for (const [msgId, info] of state.cruxTriggerMap) {
          if (info.roomId === event.card.cruxRoomId) {
            state.cruxTriggerMap.set(msgId, { ...info, disagreementType: event.card.disagreementType })
          }
        }
        break
      }

      case 'dialogue_complete':
        state.shifts = event.shifts ?? []
        state.summary = event.summary ?? null
        break

      case 'error':
        state.error = event.error
        break
    }
  }

  return state
}
