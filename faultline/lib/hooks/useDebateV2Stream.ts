import { useState, useCallback, useRef } from 'react'
import type { DebateEvent, DialogueTurn, Concession, DebateEngineOutput, DebatePhase } from '@/lib/types/debate-engine'
import type { ArgumentationGraphState } from '@/lib/types/graph'

interface DebateV2State {
  running: boolean
  complete: boolean
  error: string | null
  topic: string
  personaIds: string[]
  transcript: DialogueTurn[]
  currentPhase: DebatePhase | null
  graph: ArgumentationGraphState | null
  graphStats: {
    inCount: number
    outCount: number
    undecCount: number
    preferredCount: number
  }
  concessions: Concession[]
  cruxProposals: Array<{ personaId: string; statement: string }>
  output: DebateEngineOutput | null
}

interface StartParams {
  topic: string
  personaIds: string[]
  maxTurns?: number
}

const initialState: DebateV2State = {
  running: false,
  complete: false,
  error: null,
  topic: '',
  personaIds: [],
  transcript: [],
  currentPhase: null,
  graph: null,
  graphStats: { inCount: 0, outCount: 0, undecCount: 0, preferredCount: 0 },
  concessions: [],
  cruxProposals: [],
  output: null,
}

export function useDebateV2Stream() {
  const [state, setState] = useState<DebateV2State>(initialState)
  const eventSourceRef = useRef<EventSource | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const start = useCallback((params: StartParams) => {
    // Reset state
    setState({
      ...initialState,
      running: true,
      topic: params.topic,
      personaIds: params.personaIds,
    })

    // Abort any existing stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    // Start SSE stream
    fetch('/api/debate-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: abortControllerRef.current.signal,
    })
      .then(async response => {
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error ?? 'Request failed')
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) continue

            const eventMatch = line.match(/^event: (.+)/)
            const dataMatch = line.match(/^data: (.+)/)

            if (eventMatch && dataMatch) {
              try {
                const event: DebateEvent = JSON.parse(dataMatch[1])
                handleEvent(event)
              } catch (err) {
                console.error('Failed to parse event:', err)
              }
            }
          }
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setState(prev => ({
            ...prev,
            running: false,
            error: err.message,
          }))
        }
      })

    function handleEvent(event: DebateEvent) {
      switch (event.type) {
        case 'engine_start':
          setState(prev => ({
            ...prev,
            topic: event.topic,
            personaIds: event.personaIds,
          }))
          break

        case 'phase_start':
          setState(prev => ({ ...prev, currentPhase: event.phase }))
          break

        case 'phase_transition':
          setState(prev => ({ ...prev, currentPhase: event.to }))
          break

        case 'dialogue_turn':
          setState(prev => ({
            ...prev,
            transcript: [...prev.transcript, event.turn],
          }))
          break

        case 'crystallization':
          // Just log, graph will be updated via graph_updated event
          break

        case 'graph_updated':
          setState(prev => ({
            ...prev,
            graphStats: {
              inCount: event.inCount,
              outCount: event.outCount,
              undecCount: event.undecCount,
              preferredCount: event.preferredCount,
            },
          }))
          break

        case 'concession':
          setState(prev => ({
            ...prev,
            concessions: [...prev.concessions, event.concession],
          }))
          break

        case 'crux_proposed':
          setState(prev => ({
            ...prev,
            cruxProposals: [
              ...prev.cruxProposals,
              { personaId: event.personaId, statement: event.statement },
            ],
          }))
          break

        case 'convergence_check':
          // Just logging
          break

        case 'engine_complete':
          setState(prev => ({
            ...prev,
            running: false,
            complete: true,
            output: event.output,
            graph: event.output.graph,
          }))
          break

        case 'engine_error':
          setState(prev => ({
            ...prev,
            running: false,
            error: event.message,
          }))
          break
      }
    }
  }, [])

  const abort = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setState(prev => ({ ...prev, running: false }))
  }, [])

  return [state, { start, abort }] as const
}
