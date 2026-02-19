// ─── Hook for Dialogue SSE Stream ────────────────────────────

import { useState, useCallback, useRef } from 'react'
import type { DialogueEvent, DialogueMessage } from '@/lib/dialogue/types'
import type { CruxCard, CruxMessage } from '@/lib/crux/types'

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
  completedRooms: Map<string, ActiveCruxRoom>  // Rooms done, still viewable
  isRunning: boolean
  isComplete: boolean
  error: string | null
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
    isRunning: false,
    isComplete: false,
    error: null,
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
      isRunning: true,
      isComplete: false,
      error: null,
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

                if (event.type === 'message_posted') {
                  setState(prev => ({ ...prev, messages: [...prev.messages, event.message] }))

                } else if (event.type === 'crux_room_spawning') {
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
                    return { ...prev, activeCruxRooms: newRooms }
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
                    // Move room from active to completed
                    const room = newActive.get(event.card.cruxRoomId)
                    if (room) {
                      newActive.delete(event.card.cruxRoomId)
                      newCompleted.set(event.card.cruxRoomId, { ...room, status: 'complete' })
                    }
                    return {
                      ...prev,
                      cruxCards: [...prev.cruxCards, event.card],
                      activeCruxRooms: newActive,
                      completedRooms: newCompleted,
                    }
                  })

                } else if (event.type === 'dialogue_complete') {
                  setState(prev => ({ ...prev, isRunning: false, isComplete: true }))

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
