// ─── Hook for Dialogue SSE Stream ────────────────────────────

import { useState, useCallback, useRef } from 'react'
import type { DialogueEvent, DialogueMessage, DebateAspect, PositionShift, DebateSummary } from '@/lib/dialogue/types'
import type { CruxCard, CruxMessage, DisagreementType } from '@/lib/crux/types'

export interface CruxTriggerInfo {
  roomId: string
  topic: string
  label: string
  disagreementType?: DisagreementType
}

export interface ActiveCruxRoom {
  roomId: string
  question: string
  label: string
  personas: string[]
  messages: CruxMessage[]
  status: 'arguing' | 'complete'
}

export interface DialogueStreamState {
  messages: DialogueMessage[]
  cruxCards: CruxCard[]
  activeCruxRooms: Map<string, ActiveCruxRoom>
  completedRooms: Map<string, ActiveCruxRoom>
  cruxTriggerMap: Map<string, CruxTriggerInfo>
  isRunning: boolean
  isComplete: boolean
  error: string | null
  // Panel debate state
  aspects: DebateAspect[]
  currentRound: number | null
  currentPhase: 'opening' | 'take' | 'clash' | 'closing' | null
  shifts: PositionShift[]
  summary: DebateSummary | null
}

export function useDialogueStream(
  topic: string,
  personaIds: string[],
) {
  const [state, setState] = useState<DialogueStreamState>({
    messages: [],
    cruxCards: [],
    activeCruxRooms: new Map(),
    completedRooms: new Map(),
    cruxTriggerMap: new Map(),
    isRunning: false,
    isComplete: false,
    error: null,
    aspects: [],
    currentRound: null,
    currentPhase: null,
    shifts: [],
    summary: null,
  })

  // useRef guard prevents double-invocation from React StrictMode
  const startedRef = useRef(false)

  const start = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true

    setState({
      messages: [],
      cruxCards: [],
      activeCruxRooms: new Map(),
      completedRooms: new Map(),
      cruxTriggerMap: new Map(),
      isRunning: true,
      isComplete: false,
      error: null,
      aspects: [],
      currentRound: null,
      currentPhase: null,
      shifts: [],
      summary: null,
    })

    fetch('/api/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, personaIds }),
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to start dialogue')
        return response.body
      })
      .then(body => {
        if (!body) throw new Error('No response body')

        const reader = body.getReader()
        const decoder = new TextDecoder()

        function read(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) {
              setState(prev => ({ ...prev, isRunning: false, isComplete: true }))
              return
            }

            const text = decoder.decode(value)
            const lines = text.split('\n')

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const event = JSON.parse(line.slice(6)) as DialogueEvent

                if (event.type === 'debate_start') {
                  setState(prev => ({ ...prev, aspects: event.aspects }))

                } else if (event.type === 'round_start') {
                  setState(prev => ({ ...prev, currentRound: event.roundNumber, currentPhase: 'take' }))

                } else if (event.type === 'clash_start') {
                  setState(prev => ({ ...prev, currentPhase: 'clash' }))

                } else if (event.type === 'round_end') {
                  setState(prev => ({ ...prev, currentRound: null, currentPhase: null }))

                } else if (event.type === 'message_posted') {
                  setState(prev => ({
                    ...prev,
                    messages: [...prev.messages, event.message],
                    currentPhase: event.phase ?? prev.currentPhase,
                  }))

                } else if (event.type === 'disagreement_detected') {
                  // No-op for trigger tracking — handled in crux_room_spawning which has roomId + sourceMessages

                } else if (event.type === 'crux_room_spawning') {
                  console.log('[trigger-debug] crux_room_spawning received:', {
                    roomId: event.roomId,
                    label: event.label,
                    sourceMessages: event.sourceMessages,
                    hasSourceMessages: 'sourceMessages' in event,
                  })
                  setState(prev => {
                    const newRooms = new Map(prev.activeCruxRooms)
                    newRooms.set(event.roomId, {
                      roomId: event.roomId,
                      question: event.question,
                      label: event.label,
                      personas: event.personas,
                      messages: [],
                      status: 'arguing',
                    })
                    const newTriggerMap = new Map(prev.cruxTriggerMap)
                    for (const msgId of event.sourceMessages) {
                      newTriggerMap.set(msgId, {
                        roomId: event.roomId,
                        topic: event.question,
                        label: event.label,
                      })
                    }
                    console.log('[trigger-debug] triggerMap after update:', Array.from(newTriggerMap.entries()))
                    return { ...prev, activeCruxRooms: newRooms, cruxTriggerMap: newTriggerMap }
                  })

                } else if (event.type === 'crux_message') {
                  setState(prev => {
                    const newRooms = new Map(prev.activeCruxRooms)
                    const room = newRooms.get(event.roomId)
                    if (room) {
                      newRooms.set(event.roomId, {
                        ...room,
                        messages: [...room.messages, event.message],
                      })
                    }
                    return { ...prev, activeCruxRooms: newRooms }
                  })

                } else if (event.type === 'crux_card_posted') {
                  setState(prev => {
                    const newActive = new Map(prev.activeCruxRooms)
                    const newCompleted = new Map(prev.completedRooms)
                    const room = newActive.get(event.card.cruxRoomId)
                    if (room) {
                      newActive.delete(event.card.cruxRoomId)
                      newCompleted.set(event.card.cruxRoomId, { ...room, status: 'complete' })
                    }
                    // Retroactively enrich trigger messages with disagreement type
                    const newTriggerMap = new Map(prev.cruxTriggerMap)
                    for (const [msgId, info] of newTriggerMap) {
                      if (info.roomId === event.card.cruxRoomId) {
                        newTriggerMap.set(msgId, { ...info, disagreementType: event.card.disagreementType })
                      }
                    }
                    return {
                      ...prev,
                      cruxCards: [...prev.cruxCards, event.card],
                      activeCruxRooms: newActive,
                      completedRooms: newCompleted,
                      cruxTriggerMap: newTriggerMap,
                    }
                  })

                } else if (event.type === 'dialogue_complete') {
                  setState(prev => ({
                    ...prev,
                    isRunning: false,
                    isComplete: true,
                    shifts: event.shifts ?? [],
                    summary: event.summary ?? null,
                  }))

                } else if (event.type === 'error') {
                  setState(prev => ({ ...prev, isRunning: false, error: event.error }))
                }
              } catch (_) {
                // Skip malformed lines
              }
            }

            return read()
          })
        }

        return read()
      })
      .catch(error => {
        setState(prev => ({ ...prev, isRunning: false, error: error.message }))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, personaIds])

  return { ...state, start }
}
