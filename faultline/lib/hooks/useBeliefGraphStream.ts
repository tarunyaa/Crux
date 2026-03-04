// ─── Hook for Belief Graph Experiment SSE Stream ─────────────

import { useState, useCallback, useRef } from 'react'
import type {
  BeliefGraphEvent,
  PersonaQBAF,
  CommunityGraph,
  StructuralCrux,
  BenchmarkMetrics,
  PairwiseDiff,
  RevisionSnapshot,
  ExperimentResult,
} from '@/lib/belief-graph/types'

export interface BeliefGraphStreamState {
  // Extraction phase
  qbafs: Record<string, PersonaQBAF>
  // Diff phase
  diffs: PairwiseDiff[]
  // Revision phase
  revisions: RevisionSnapshot[]
  revisedNodeIds: Set<string>  // node IDs whose base scores were adjusted
  // Community graph phase
  communityGraph: CommunityGraph | null
  cruxes: StructuralCrux[]
  benchmarks: BenchmarkMetrics | null
  // Final result
  result: ExperimentResult | null
  // Status
  phase: 'idle' | 'extracting' | 'diffing' | 'revising' | 'building-community' | 'complete'
  isRunning: boolean
  isComplete: boolean
  error: string | null
}

export function useBeliefGraphStream(
  topic: string,
  personaIds: string[],
) {
  const [state, setState] = useState<BeliefGraphStreamState>({
    qbafs: {},
    diffs: [],
    revisions: [],
    revisedNodeIds: new Set(),
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
      diffs: [],
      revisions: [],
      revisedNodeIds: new Set(),
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
        let buffer = ''

        function read(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) {
              setState(prev => ({ ...prev, isRunning: false, isComplete: true }))
              return
            }

            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''

            for (const part of parts) {
              const line = part.trim()
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
      case 'diff_start':
        setState(prev => ({ ...prev, phase: 'diffing' }))
        break
      case 'diff_complete':
        setState(prev => ({
          ...prev,
          diffs: [...prev.diffs, event.diff],
        }))
        break
      case 'revision_complete': {
        const newRevisedIds = new Set<string>()
        if (event.adjustedScores) {
          for (const nodeId of Object.keys(event.adjustedScores)) {
            newRevisedIds.add(nodeId)
          }
        }
        setState(prev => {
          // Merge adjusted scores into the QBAF for this persona
          let updatedQbafs = prev.qbafs
          if (event.adjustedScores && prev.qbafs[event.personaId]) {
            const qbaf = prev.qbafs[event.personaId]
            updatedQbafs = {
              ...prev.qbafs,
              [event.personaId]: {
                ...qbaf,
                nodes: qbaf.nodes.map(n => {
                  const newScore = event.adjustedScores![n.id]
                  return newScore !== undefined ? { ...n, baseScore: newScore } : n
                }),
              },
            }
          }
          return {
            ...prev,
            qbafs: updatedQbafs,
            phase: 'revising',
            revisedNodeIds: new Set([...prev.revisedNodeIds, ...newRevisedIds]),
            revisions: [...prev.revisions, {
              personaId: event.personaId,
              preRootStrength: 0,
              postRootStrength: event.rootStrength,
              cost: event.revisionCost,
              R: event.R,
              reasoning: event.reasoning,
            }],
          }
        })
        break
      }
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
