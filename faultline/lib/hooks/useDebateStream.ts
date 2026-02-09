'use client'

import { useState, useRef, useCallback } from 'react'
import type {
  SSEEvent,
  Claim,
  AgentStance,
  ConvergenceState,
  Crux,
  FlipCondition,
  DebateOutput,
  DebateMode,
  AgentMessage,
  InitialStanceEntry,
} from '@/lib/types'

type DebateStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'error'

interface ActiveSpeaker {
  personaId: string
  urgency: number
  intent: string
}

interface DebateStreamState {
  status: DebateStatus
  statusMessage: string | null
  debateId: string | null
  claims: Claim[]
  messages: AgentMessage[]
  convergence: ConvergenceState | null
  cruxes: Crux[]
  flipConditions: FlipCondition[]
  output: DebateOutput | null
  error: string | null
  tables: Map<number, string[]>
  activeSpeaker: ActiveSpeaker | null
  initialStances: InitialStanceEntry[]
}

interface DebateStreamControls {
  start: (params: { topic: string; personaIds: string[]; mode?: DebateMode; save?: boolean }) => void
  abort: () => void
}

const initialState: DebateStreamState = {
  status: 'idle',
  statusMessage: null,
  debateId: null,
  claims: [],
  messages: [],
  convergence: null,
  cruxes: [],
  flipConditions: [],
  output: null,
  error: null,
  tables: new Map(),
  activeSpeaker: null,
  initialStances: [],
}

export function useDebateStream(): [DebateStreamState, DebateStreamControls] {
  const [state, setState] = useState<DebateStreamState>(initialState)
  const abortRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const start = useCallback(
    (params: { topic: string; personaIds: string[]; mode?: DebateMode; save?: boolean }) => {
      // Abort any existing stream
      abort()

      const controller = new AbortController()
      abortRef.current = controller

      setState({ ...initialState, status: 'connecting' })

      ;(async () => {
        try {
          // Timeout if no response headers within 20s
          const timeoutId = setTimeout(() => {
            controller.abort()
          }, 20_000)

          const res = await fetch('/api/debate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: params.topic,
              personaIds: params.personaIds,
              mode: params.mode ?? 'blitz',
              save: params.save ?? false,
            }),
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (!res.ok) {
            const errBody = await res.text()
            setState(prev => ({
              ...prev,
              status: 'error',
              error: `API error ${res.status}: ${errBody}`,
            }))
            return
          }

          const reader = res.body?.getReader()
          if (!reader) {
            setState(prev => ({ ...prev, status: 'error', error: 'No response body' }))
            return
          }

          setState(prev => ({ ...prev, status: 'streaming' }))

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Split on double newlines (SSE event boundary)
            const parts = buffer.split('\n\n')
            // Keep the last incomplete chunk in the buffer
            buffer = parts.pop() ?? ''

            for (const part of parts) {
              const trimmed = part.trim()
              if (!trimmed) continue

              // Extract the data line
              const dataLine = trimmed
                .split('\n')
                .find(line => line.startsWith('data: '))
              if (!dataLine) continue

              const jsonStr = dataLine.slice(6) // remove 'data: '
              try {
                const event = JSON.parse(jsonStr) as SSEEvent
                processEvent(event, setState)
              } catch {
                // Malformed JSON — skip
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const dataLine = buffer
              .trim()
              .split('\n')
              .find(line => line.startsWith('data: '))
            if (dataLine) {
              try {
                const event = JSON.parse(dataLine.slice(6)) as SSEEvent
                processEvent(event, setState)
              } catch {
                // skip
              }
            }
          }

          // If we finished without debate_complete or error, mark completed
          setState(prev => {
            if (prev.status === 'streaming') {
              return { ...prev, status: 'completed' }
            }
            return prev
          })
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // Check if this was our timeout vs user abort
            if (abortRef.current === controller) {
              setState(prev => ({
                ...prev,
                status: 'error',
                error: 'Connection timed out — try reloading the page',
              }))
            }
            return
          }
          setState(prev => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'Stream error',
          }))
        }
      })()
    },
    [abort]
  )

  return [state, { start, abort }]
}

function processEvent(
  event: SSEEvent,
  setState: React.Dispatch<React.SetStateAction<DebateStreamState>>
) {
  switch (event.type) {
    case 'status':
      setState(prev => ({
        ...prev,
        statusMessage: event.message,
      }))
      break

    case 'debate_start':
      setState(prev => ({
        ...prev,
        debateId: event.debateId,
        claims: event.claims,
        statusMessage: null,
      }))
      break

    case 'table_assigned':
      setState(prev => {
        const tables = new Map(prev.tables)
        tables.set(event.tableId, event.personaIds)
        return { ...prev, tables }
      })
      break

    case 'initial_stance':
      setState(prev => ({
        ...prev,
        initialStances: [
          ...prev.initialStances,
          {
            personaId: event.personaId,
            stances: event.stances,
            reasoning: event.reasoning,
          },
        ],
      }))
      break

    case 'speaker_selected':
      setState(prev => ({
        ...prev,
        activeSpeaker: {
          personaId: event.personaId,
          urgency: event.urgency,
          intent: event.intent,
        },
      }))
      break

    case 'agent_turn':
      setState(prev => ({
        ...prev,
        activeSpeaker: null,
        messages: [
          ...prev.messages,
          {
            personaId: event.personaId,
            tableId: event.tableId,
            content: event.content,
            stance: event.stance,
            stances: event.stances,
            round: event.round,
            timestamp: Date.now(),
          },
        ],
      }))
      break

    case 'convergence_update':
      setState(prev => ({
        ...prev,
        convergence: event.metrics,
      }))
      break

    case 'merge_complete':
      setState(prev => ({
        ...prev,
        cruxes: event.mergedCruxes,
      }))
      break

    case 'debate_complete':
      setState(prev => ({
        ...prev,
        status: 'completed',
        output: event.output,
        cruxes: event.output.cruxes ?? [],
        flipConditions: event.output.flipConditions ?? [],
      }))
      break

    case 'error':
      setState(prev => ({
        ...prev,
        status: 'error',
        error: event.message,
      }))
      break
  }
}
