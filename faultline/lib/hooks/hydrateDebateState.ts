import type {
  SSEEvent,
  Claim,
  ConvergenceState,
  Crux,
  FlipCondition,
  DebateOutput,
  AgentMessage,
  InitialStanceEntry,
} from '@/lib/types'

export interface HydratedDebateState {
  debateId: string | null
  claims: Claim[]
  messages: AgentMessage[]
  convergence: ConvergenceState | null
  cruxes: Crux[]
  flipConditions: FlipCondition[]
  output: DebateOutput | null
  error: string | null
  tables: Record<number, string[]>
  initialStances: InitialStanceEntry[]
}

/**
 * Replay stored SSE events into the same state shape MatchClient renders.
 * Pure function — safe to call on the server.
 */
export function hydrateDebateState(events: SSEEvent[]): HydratedDebateState {
  const state: HydratedDebateState = {
    debateId: null,
    claims: [],
    messages: [],
    convergence: null,
    cruxes: [],
    flipConditions: [],
    output: null,
    error: null,
    tables: {},
    initialStances: [],
  }

  for (const event of events) {
    switch (event.type) {
      case 'debate_start':
        state.debateId = event.debateId
        state.claims = event.claims
        break

      case 'table_assigned':
        state.tables[event.tableId] = event.personaIds
        break

      case 'initial_stance':
        state.initialStances.push({
          personaId: event.personaId,
          stances: event.stances,
          reasoning: event.reasoning,
        })
        break

      case 'agent_turn':
        state.messages.push({
          personaId: event.personaId,
          tableId: event.tableId,
          content: event.content,
          stance: event.stance,
          stances: event.stances,
          round: event.round,
          timestamp: 0,
        })
        break

      case 'convergence_update':
        state.convergence = event.metrics
        break

      case 'merge_complete':
        state.cruxes = event.mergedCruxes
        break

      case 'debate_complete':
        state.output = event.output
        state.cruxes = event.output.cruxes
        state.flipConditions = event.output.flipConditions
        break

      case 'error':
        state.error = event.message
        break
    }
  }

  return state
}
