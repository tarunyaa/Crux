import { useState, useCallback, useRef, useMemo } from 'react'
import type {
  ArgumentEvent,
  ArgumentState,
  ArgumentMessage,
  ExpertsGeneratedData,
  MainArgumentsData,
  LevelCompleteData,
  BaseScoresData,
  QBAFEvaluatedData,
  QBAFHierarchyNode,
  CounterfactualData,
  ConsensusData,
  ReportData,
  ArgumentCompleteData,
  BaselineResult,
  PositionInfo,
  StreamingArg,
  ArgumentCruxCard,
  DivergenceMap,
  FlipCondition,
  CrossFacetAnalysis,
} from '@/lib/argument/types'
import { createInitialState } from '@/lib/argument/types'
import type { BridgeConfig } from '@/lib/argument/bridge'

function flattenHierarchy(
  nodes: QBAFHierarchyNode[],
  experts: string[],
  parentId?: string,
  depth: number = 0,
): ArgumentMessage[] {
  const messages: ArgumentMessage[] = []
  const seenStatements = new Set<string>() // deduplicate siblings with identical text
  for (const node of nodes) {
    if (!node.statement) continue
    const key = node.statement.trim()
    if (seenStatements.has(key)) continue
    seenStatements.add(key)
    const expertIndex = experts.indexOf(node.expert)
    const msgType = depth === 0 ? 'main_argument' as const
      : node.relation === 'attack' ? 'attack' as const
      : 'support' as const
    const id = `node-${node.node_id}`
    messages.push({
      id,
      expertName: node.expert || 'Unknown',
      expertIndex: expertIndex >= 0 ? expertIndex : 0,
      content: node.statement,
      type: msgType,
      parentId,
      depth,
      scores: (node.initial_score !== null || node.final_score !== null) ? {
        initial: node.initial_score,
        final: node.final_score,
      } : undefined,
    })
    if (node.supplementary_args?.length) {
      messages.push(...flattenHierarchy(node.supplementary_args, experts, id, depth + 1))
    }
  }
  return messages
}

function buildMessagesFromStreaming(
  args: StreamingArg[],
  experts: string[],
): ArgumentMessage[] {
  // ARGORA builds graphs concurrently (thread pool), so events from different
  // graphs interleave. Each event includes graph_id to scope node IDs correctly.
  // Key format: g{graph_id}-n{node_id} — guaranteed unique across graphs.
  const graphMaps = new Map<number, Map<number, string>>() // graph_id → (node_id → key)
  const result: ArgumentMessage[] = []

  for (const arg of args) {
    const gid = arg.graph_id ?? 0
    if (!graphMaps.has(gid)) graphMaps.set(gid, new Map())
    const nodeMap = graphMaps.get(gid)!

    const key = `g${gid}-n${arg.id}`
    nodeMap.set(arg.id, key)

    result.push({
      id: key,
      expertName: arg.expert,
      expertIndex: experts.indexOf(arg.expert),
      content: arg.statement,
      type: arg.type === 'main_argument' ? 'main_argument' as const
        : arg.type === 'attacking_argument' ? 'attack' as const
        : 'support' as const,
      parentId: arg.parent_id !== null ? nodeMap.get(arg.parent_id) : undefined,
      depth: 0,
    })
  }

  return result
}

export function useArgumentStream(config: BridgeConfig) {
  const [state, setState] = useState<ArgumentState>(createInitialState())
  const startedRef = useRef(false)

  const start = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true

    setState({ ...createInitialState(), phase: 'starting', topic: config.topic })

    const run = async () => {
      try {
        const res = await fetch('/api/argument', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        })

        if (!res.ok) {
          const err = await res.json()
          setState(s => ({ ...s, phase: 'error', error: err.error || 'Request failed' }))
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setState(s => ({ ...s, phase: 'error', error: 'No response body' }))
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (!json) continue

            try {
              const event = JSON.parse(json) as ArgumentEvent
              handleEvent(event)
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (error) {
        setState(s => ({
          ...s,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Stream error',
        }))
      }
    }

    const handleEvent = (event: ArgumentEvent) => {
      // Handle all argument_posted variants: bare, progress-prefixed, facet-prefixed
      // e.g. 'argument_posted', 'progress_argument_posted', 'facet0_argument_posted'
      if (
        event.type === 'argument_posted' ||
        event.type === 'progress_argument_posted' ||
        /^facet\d+_argument_posted$/.test(event.type)
      ) {
        const d = event.data as StreamingArg
        setState(s => ({ ...s, streamingArgs: [...s.streamingArgs, d] }))
        return
      }

      switch (event.type) {
        case 'argument_start':
          setState(s => ({ ...s, phase: 'starting' }))
          break

        case 'experts_generated': {
          const data = event.data as ExpertsGeneratedData
          setState(s => ({
            ...s,
            phase: 'experts',
            experts: data.experts,
            task: data.task,
          }))
          break
        }

        case 'main_arguments_generated': {
          const data = event.data as MainArgumentsData
          setState(s => ({
            ...s,
            phase: 'arguments',
            mainArguments: data.main_arguments,
          }))
          break
        }

        case 'level1_complete':
        case 'level2_complete':
        case 'level3_complete': {
          const data = event.data as LevelCompleteData
          setState(s => ({
            ...s,
            phase: 'building',
            levelInfo: data.included_in_graphs ? s.levelInfo : data,
          }))
          break
        }

        case 'base_scores_assigned': {
          const data = event.data as BaseScoresData
          setState(s => ({
            ...s,
            phase: 'scoring',
            baseScores: data.scores,
          }))
          break
        }

        case 'qbaf_evaluated': {
          const data = event.data as QBAFEvaluatedData
          setState(s => ({
            ...s,
            phase: 'evaluating',
            qbafStrengths: data.strengths,
            qbafHierarchy: data.hierarchy ?? [],
          }))
          break
        }

        case 'counterfactual_complete': {
          const data = event.data as CounterfactualData
          setState(s => ({
            ...s,
            phase: 'analyzing',
            counterfactual: data,
          }))
          break
        }

        case 'consensus_generated': {
          const data = event.data as ConsensusData
          setState(s => ({ ...s, consensus: data }))
          break
        }

        case 'report_generated': {
          const data = event.data as ReportData
          setState(s => ({ ...s, report: data }))
          break
        }

        case 'flip_conditions': {
          const data = event.data as { flip_conditions: FlipCondition[] }
          setState(s => ({ ...s, flipConditions: data.flip_conditions ?? [] }))
          break
        }

        case 'crux_cards_extracted': {
          const data = event.data as { cards: ArgumentCruxCard[]; count: number; faceted?: boolean }
          setState(s => ({
            ...s,
            phase: 'crux_extraction',
            cruxCards: data.cards ?? [],
          }))
          break
        }

        case 'cross_facet_analysis': {
          const data = event.data as CrossFacetAnalysis
          setState(s => ({ ...s, crossFacetAnalysis: data }))
          break
        }

        case 'divergence_computed': {
          const data = event.data as DivergenceMap
          setState(s => ({ ...s, divergenceMap: data }))
          break
        }

        case 'facets_decomposed': {
          const data = event.data as { facets: string[] }
          setState(s => ({
            ...s,
            facets: { questions: data.facets ?? [], active_index: 0, completed: [] },
          }))
          break
        }

        case 'facet_start': {
          const data = event.data as { index: number }
          setState(s => ({
            ...s,
            facets: s.facets ? { ...s.facets, active_index: data.index } : s.facets,
          }))
          break
        }

        case 'facet_complete': {
          const data = event.data as { index: number }
          setState(s => ({
            ...s,
            facets: s.facets ? {
              ...s.facets,
              completed: [...s.facets.completed, data.index],
            } : s.facets,
          }))
          break
        }

        case 'saved': {
          const data = event.data as { debateId: string }
          setState(s => ({ ...s, savedDebateId: data.debateId }))
          break
        }

        case 'arena_saved': {
          const data = event.data as { arenaDebateId: string }
          setState(s => ({ ...s, arenaDebateId: data.arenaDebateId }))
          break
        }

        case 'argument_complete': {
          const data = event.data as ArgumentCompleteData & { divergence_map?: DivergenceMap }
          setState(s => ({
            ...s,
            phase: 'complete',
            fullResult: data,
            cruxCards: s.cruxCards.length > 0 ? s.cruxCards : (data.crux_cards ?? []),
            divergenceMap: s.divergenceMap ?? data.divergence_map ?? null,
            streamingArgs: [],
          }))
          break
        }

        case 'baselines_started': {
          setState(s => ({ ...s, phase: 'baselines' }))
          break
        }

        case 'baseline_result': {
          const data = event.data as {
            method: string
            label: string
            answer: string | null
            reasoning: string | null
            main_task?: string
            token_usage?: Record<string, number>
            error?: string
          }
          const result: BaselineResult = {
            method: data.method as BaselineResult['method'],
            label: data.label,
            answer: data.answer,
            reasoning: data.reasoning,
            mainTask: data.main_task,
            tokenUsage: data.token_usage,
            error: data.error,
          }
          setState(s => ({
            ...s,
            baselineResults: [...s.baselineResults, result],
          }))
          break
        }

        case 'baselines_complete': {
          setState(s => ({ ...s, phase: 'complete' }))
          break
        }

        // Real-time progress events from ARGORA pipeline
        case 'progress_task_extracted':
          setState(s => ({ ...s, phase: 'starting' }))
          break
        case 'progress_experts_selected': {
          const d = event.data as { experts?: string[] }
          setState(s => ({ ...s, phase: 'experts', experts: d?.experts ?? s.experts }))
          break
        }
        case 'progress_main_arguments_ready': {
          // The main_arguments in this event have malformed expert fields (Python dict keys).
          // Don't store them — real argument data arrives via streamingArgs and qbafHierarchy.
          setState(s => ({ ...s, phase: 'arguments' }))
          break
        }
        case 'progress_first_level_complete':
          setState(s => ({ ...s, phase: 'building' }))
          break
        case 'progress_graph_debate_complete':
          setState(s => ({ ...s, phase: 'building' }))
          break
        case 'progress_scoring_complete':
          setState(s => ({ ...s, phase: 'scoring' }))
          break
        case 'progress_counterfactual_complete':
          setState(s => ({ ...s, phase: 'analyzing' }))
          break

        case 'status': {
          const data = event.data as { message?: string; positions?: PositionInfo[]; framedTopic?: string }
          if (data.positions || data.framedTopic) {
            setState(s => ({
              ...s,
              framedTopic: data.framedTopic ?? s.framedTopic,
              positions: data.positions ?? s.positions,
            }))
          }
          break
        }

        case 'error': {
          const data = event.data as { message: string }
          setState(s => ({
            ...s,
            phase: 'error',
            error: data.message,
          }))
          break
        }
      }
    }

    run()
  }, [config])

  const messages = useMemo(() => {
    if (state.qbafHierarchy.length > 0) {
      return flattenHierarchy(state.qbafHierarchy, state.experts)
    }
    if (state.streamingArgs.length > 0) {
      return buildMessagesFromStreaming(state.streamingArgs, state.experts)
    }
    return state.mainArguments.map((arg, i): ArgumentMessage => {
      const expert = arg.expert || (Array.isArray(arg.experts) ? (arg.experts as string[])[0] : '') || 'Expert'
      return {
        id: `main-${i}`,
        expertName: expert,
        expertIndex: state.experts.indexOf(expert),
        content: arg.statement,
        type: 'main_argument',
        depth: 0,
      }
    })
  }, [state.qbafHierarchy, state.streamingArgs, state.mainArguments, state.experts])

  return { state, messages, start }
}
