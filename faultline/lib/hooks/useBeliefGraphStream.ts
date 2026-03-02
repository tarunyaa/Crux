// ─── Hook for Belief Graph Experiment SSE Stream ─────────────

import { useState, useCallback, useRef } from 'react'
import type {
  BeliefGraphEvent,
  PersonaQBAF,
  CommunityGraph,
  StructuralCrux,
  BenchmarkMetrics,
  RoundSnapshot,
  ExperimentResult,
} from '@/lib/belief-graph/types'

export interface RevisionDetail {
  round: number
  personaId: string
  rootStrength: number
  revisionCost: number
  R: number
  reasoning: string
}

export interface BeliefGraphStreamState {
  // Extraction phase
  qbafs: Record<string, PersonaQBAF>
  // Round tracking
  currentRound: number
  rounds: RoundSnapshot[]
  revisionDetails: RevisionDetail[]
  // Community graph phase
  communityGraph: CommunityGraph | null
  cruxes: StructuralCrux[]
  benchmarks: BenchmarkMetrics | null
  // Final result
  result: ExperimentResult | null
  // Status
  phase: 'idle' | 'extracting' | 'debating' | 'building-community' | 'complete'
  isRunning: boolean
  isComplete: boolean
  error: string | null
}

export function useBeliefGraphStream(
  topic: string,
  personaIds: [string, string],
  maxRounds: number = 3,
) {
  const [state, setState] = useState<BeliefGraphStreamState>({
    qbafs: {},
    currentRound: 0,
    rounds: [],
    revisionDetails: [],
    communityGraph: null,
    cruxes: [],
    benchmarks: null,
    result: null,
    phase: 'idle',
    isRunning: false,
    isComplete: false,
    error: null,
  })

  const startedRef = useRef(false)

  const start = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true

    setState({
      qbafs: {},
      currentRound: 0,
      rounds: [],
      revisionDetails: [],
      communityGraph: null,
      cruxes: [],
      benchmarks: null,
      result: null,
      phase: 'extracting',
      isRunning: true,
      isComplete: false,
      error: null,
    })

    fetch('/api/belief-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        personaIds,
        maxRounds,
        convergenceThreshold: 0.02,
        cruxVarianceThreshold: 0.3,
        consensusVarianceThreshold: 0.1,
      }),
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to start experiment')
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
                const event = JSON.parse(line.slice(6)) as BeliefGraphEvent
                processEvent(event)
              } catch {
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

  function processEvent(event: BeliefGraphEvent) {
    switch (event.type) {
      case 'extraction_start':
        setState(prev => ({ ...prev, phase: 'extracting' }))
        break
      case 'extraction_complete':
        setState(prev => ({
          ...prev,
          qbafs: { ...prev.qbafs, [event.personaId]: event.qbaf },
        }))
        break
      case 'round_start':
        setState(prev => ({ ...prev, phase: 'debating', currentRound: event.round }))
        break
      case 'revision_complete':
        setState(prev => ({
          ...prev,
          revisionDetails: [...prev.revisionDetails, {
            round: event.round,
            personaId: event.personaId,
            rootStrength: event.rootStrength,
            revisionCost: event.revisionCost,
            R: event.R,
            reasoning: event.reasoning,
          }],
        }))
        break
      case 'round_complete':
        setState(prev => ({
          ...prev,
          rounds: [...prev.rounds, event.snapshot],
          qbafs: { ...prev.qbafs, ...event.snapshot.qbafs },
        }))
        break
      case 'community_graph_built':
        setState(prev => ({ ...prev, phase: 'building-community', communityGraph: event.graph }))
        break
      case 'cruxes_identified':
        setState(prev => ({ ...prev, cruxes: event.cruxes }))
        break
      case 'benchmarks_computed':
        setState(prev => ({ ...prev, benchmarks: event.benchmarks }))
        break
      case 'experiment_complete':
        setState(prev => ({
          ...prev,
          result: event.result,
          phase: 'complete',
          isRunning: false,
          isComplete: true,
        }))
        break
      case 'error':
        setState(prev => ({ ...prev, isRunning: false, error: event.error }))
        break
    }
  }

  return { ...state, start }
}
