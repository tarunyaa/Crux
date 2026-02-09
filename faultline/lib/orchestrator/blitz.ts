import type {
  SSEEvent,
  Claim,
  PersonaId,
  BlackboardState,
  Stance,
} from '@/lib/types'
import { decomposeClaims } from './claims'
import { initializeAgents, generateInitialStancesWithReasoning } from './agents'
import type { Agent } from './agents'
import { createBlackboard, updateBlackboard } from './blackboard'
import type { TurnResult } from './blackboard'
import {
  computeConvergence,
  createConvergenceTracker,
} from './convergence'
import { assembleContext } from './context'
import type { TurnMessage } from './context'
import { extractOutput } from './output'
import { completeJSON } from '@/lib/llm/client'
import { agentTurnPrompt } from '@/lib/llm/prompts'

// ─── Configuration ───────────────────────────────────────────

const MAX_ROUNDS = 5
const TABLE_ID = 0 // single table for V1

// ─── Agent Turn Response Schema ──────────────────────────────

interface ClaimResponse {
  claimId: string
  response: string
  stance: Stance
  confidence: number
}

interface AgentTurnResponse {
  claimResponses: ClaimResponse[]
  newCruxes: string[]
  flipTriggers: string[]
}

// ─── Blitz Orchestrator ──────────────────────────────────────

export interface BlitzConfig {
  topic: string
  personaIds: PersonaId[]
  debateId: string
  maxRounds?: number
}

/**
 * Async generator that runs a blitz-mode debate and yields SSE events.
 * Single table, all agents respond in parallel per round.
 */
export async function* runBlitz(config: BlitzConfig): AsyncGenerator<SSEEvent> {
  const { topic, personaIds, debateId, maxRounds = MAX_ROUNDS } = config

  try {
    // 0. Signal setup started
    yield { type: 'status', phase: 'claims', message: 'Decomposing topic into testable claims...' }

    // 1. Decompose topic into claims
    const claims = await decomposeClaims(topic, debateId)

    yield {
      type: 'debate_start',
      debateId,
      claims,
    }

    // 2. Initialize agents
    yield { type: 'status', phase: 'agents', message: `Loading ${personaIds.length} persona contracts...` }
    const agents = await initializeAgents(personaIds)

    yield {
      type: 'table_assigned',
      tableId: TABLE_ID,
      personaIds,
    }

    // 3. Generate initial stances (parallel, yield as each completes)
    yield { type: 'status', phase: 'stances', message: 'Generating initial stances...' }
    let blackboard = createBlackboard(topic, claims)

    // Fire all LLM calls in parallel, but yield results as they resolve
    const initialStanceResults: { personaId: PersonaId; stances: typeof blackboard.stances; reasoning: string }[] = []
    const stancePromises = personaIds.map(async (id) => {
      const agent = agents.get(id)!
      const result = await generateInitialStancesWithReasoning(agent, claims)
      return { personaId: id, ...result }
    })

    // Use Promise.allSettled to process in completion order isn't straightforward,
    // but we can collect all and yield them — they resolve in parallel anyway
    const allResults = await Promise.all(stancePromises)

    for (const result of allResults) {
      initialStanceResults.push(result)
      blackboard = updateBlackboard(blackboard, {
        personaId: result.personaId,
        stances: result.stances.map(s => ({
          claimId: s.claimId,
          stance: s.stance,
          confidence: s.confidence,
        })),
        newCruxes: [],
        flipTriggers: [],
        round: 0,
      })

      yield {
        type: 'initial_stance',
        personaId: result.personaId,
        stances: result.stances,
        reasoning: result.reasoning,
      }
    }

    // 4. Debate loop
    const messages: TurnMessage[] = []
    const tracker = createConvergenceTracker()
    let eventCount = 0

    for (let round = 1; round <= maxRounds; round++) {
      // Run all agents in parallel for this round
      const turnPromises = personaIds.map(personaId =>
        executeAgentTurn(
          agents.get(personaId)!,
          personaId,
          blackboard,
          messages,
          round,
        ),
      )

      const turnResults = await Promise.all(turnPromises)

      // Process results sequentially (order matters for blackboard updates)
      for (const result of turnResults) {
        if (!result) continue

        // Update blackboard
        blackboard = updateBlackboard(blackboard, result.turnResult)

        // Record message (concatenate per-claim responses for context assembly)
        const fullContent = result.claimResponses
          .map(cr => `[${cr.claimId}] ${cr.response}`)
          .join('\n\n')
        messages.push({
          personaId: result.turnResult.personaId,
          round,
          content: fullContent,
        })

        // Build all stances for this agent's turn
        const allStances = result.claimResponses.map(cr => ({
          personaId: result.turnResult.personaId,
          claimId: cr.claimId,
          stance: cr.stance,
          confidence: cr.confidence,
          round,
        }))

        // Yield one agent_turn event per claim response
        for (const cr of result.claimResponses) {
          yield {
            type: 'agent_turn',
            personaId: result.turnResult.personaId,
            tableId: TABLE_ID,
            content: cr.response,
            stance: {
              personaId: result.turnResult.personaId,
              claimId: cr.claimId,
              stance: cr.stance,
              confidence: Math.max(0, Math.min(1, cr.confidence)),
              round,
            },
            stances: allStances,
            round,
          }

          eventCount++
        }
      }

      // Yield blackboard update
      yield {
        type: 'blackboard_update',
        tableId: TABLE_ID,
        summary: buildQuickSummary(blackboard),
      }

      // Compute and yield convergence
      const convergence = computeConvergence(
        blackboard,
        tracker,
        eventCount,
        round,
      )

      yield {
        type: 'convergence_update',
        metrics: convergence,
      }

      // Check stop conditions
      if (convergence.converged || convergence.diverged) {
        break
      }
    }

    // 5. Extract final output
    const output = await extractOutput(blackboard)

    yield {
      type: 'debate_complete',
      output,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    yield {
      type: 'error',
      message,
    }
  }
}

// ─── Single Agent Turn ───────────────────────────────────────

interface AgentTurnResult {
  claimResponses: ClaimResponse[]
  turnResult: TurnResult
}

async function executeAgentTurn(
  agent: Agent,
  personaId: PersonaId,
  blackboard: BlackboardState,
  messages: TurnMessage[],
  round: number,
): Promise<AgentTurnResult | null> {
  try {
    // Assemble context
    const ctx = await assembleContext(personaId, blackboard, messages, round)

    // LLM call
    const result = await completeJSON<AgentTurnResponse>({
      system: agent.systemPrompt,
      messages: [
        {
          role: 'user',
          content: agentTurnPrompt({
            blackboardSummary: ctx.blackboardSummary,
            localNeighborhood: ctx.localNeighborhood,
            claims: ctx.claims,
            currentStances: ctx.currentStances,
          }),
        },
      ],
      model: 'sonnet',
      maxTokens: 1024,
      temperature: 0.7,
    })

    const claimResponses = (result.claimResponses ?? []).map(cr => ({
      claimId: cr.claimId,
      response: cr.response,
      stance: cr.stance,
      confidence: Math.max(0, Math.min(1, cr.confidence)),
    }))

    return {
      claimResponses,
      turnResult: {
        personaId,
        stances: claimResponses.map(cr => ({
          claimId: cr.claimId,
          stance: cr.stance,
          confidence: cr.confidence,
        })),
        newCruxes: result.newCruxes ?? [],
        flipTriggers: result.flipTriggers ?? [],
        round,
      },
    }
  } catch (err: unknown) {
    console.error(`Agent turn failed for ${personaId}:`, err)
    return null
  }
}

// ─── Quick Summary ───────────────────────────────────────────

function buildQuickSummary(board: BlackboardState): string {
  const parts: string[] = []

  // Dispute summary
  if (board.disputes.length > 0) {
    parts.push(`${board.disputes.length} active dispute(s).`)
  }

  // Crux summary
  const openCruxes = board.cruxCandidates.filter(c => !c.resolved)
  if (openCruxes.length > 0) {
    parts.push(`${openCruxes.length} open crux(es): ${openCruxes.map(c => c.proposition).join('; ')}.`)
  }

  // Flip conditions
  const triggered = board.flipConditions.filter(fc => fc.triggered)
  if (triggered.length > 0) {
    parts.push(`Flip conditions triggered: ${triggered.map(fc => `${fc.personaId} (${fc.condition})`).join(', ')}.`)
  }

  return parts.join(' ') || 'No significant developments yet.'
}
