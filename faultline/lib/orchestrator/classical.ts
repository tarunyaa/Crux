import type {
  SSEEvent,
  Claim,
  PersonaId,
  BlackboardState,
  Stance,
  ActionPlan,
  DebateOutput,
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
import { actionPlanPrompt, classicalAgentTurnPrompt } from '@/lib/llm/prompts'

// ─── Configuration ───────────────────────────────────────────

const MAX_TURNS = 15
const TABLE_ID = 0 // single table for V1
const MAX_CONSECUTIVE_SILENCE = 3

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

interface ActionPlanResponse {
  action: 'speak' | 'interrupt' | 'listen'
  urgency: number
  intent: string
}

// ─── Classical Orchestrator ─────────────────────────────────

export interface ClassicalConfig {
  topic: string
  personaIds: PersonaId[]
  debateId: string
  maxTurns?: number
}

/**
 * Async generator that runs a classical-mode debate and yields SSE events.
 * Sequential turns with urgency-based speaker selection.
 */
export async function* runClassical(config: ClassicalConfig): AsyncGenerator<SSEEvent> {
  const { topic, personaIds, debateId, maxTurns = MAX_TURNS } = config

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

    const stancePromises = personaIds.map(async (id) => {
      const agent = agents.get(id)!
      const result = await generateInitialStancesWithReasoning(agent, claims)
      return { personaId: id, ...result }
    })

    const allResults = await Promise.all(stancePromises)

    for (const result of allResults) {
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
        reasonings: result.reasonings,
      }
    }

    // 4. Classical debate loop
    yield { type: 'status', phase: 'debate', message: 'Starting classical debate...' }
    const messages: TurnMessage[] = []
    const tracker = createConvergenceTracker()
    let eventCount = 0
    let consecutiveSilence = 0

    for (let turn = 1; turn <= maxTurns; turn++) {
      // a. Generate action plans for all agents in parallel
      const actionPlans = await generateActionPlans(
        agents,
        personaIds,
        blackboard,
        messages,
        turn,
      )

      // b. Select speaker = highest urgency among agents wanting to speak/interrupt
      const candidates = actionPlans.filter(
        p => p.action === 'speak' || p.action === 'interrupt',
      )

      if (candidates.length === 0) {
        consecutiveSilence++
        yield {
          type: 'status',
          phase: 'silence',
          message: `Turn ${turn}: All agents listening (silence ${consecutiveSilence}/${MAX_CONSECUTIVE_SILENCE})`,
        }
        if (consecutiveSilence >= MAX_CONSECUTIVE_SILENCE) {
          yield {
            type: 'status',
            phase: 'silence_break',
            message: 'Debate ended: extended silence — no agent wants to speak.',
          }
          break
        }
        continue
      }

      consecutiveSilence = 0

      // Pick highest urgency, break ties by preferring interrupts
      candidates.sort((a, b) => {
        if (b.urgency !== a.urgency) return b.urgency - a.urgency
        if (a.action === 'interrupt' && b.action !== 'interrupt') return -1
        if (b.action === 'interrupt' && a.action !== 'interrupt') return 1
        return 0
      })
      const speaker = candidates[0]

      // c. Yield speaker_selected event
      yield {
        type: 'speaker_selected',
        personaId: speaker.personaId,
        urgency: speaker.urgency,
        intent: speaker.intent,
      }

      // d. Execute speaker's turn
      const result = await executeClassicalTurn(
        agents.get(speaker.personaId)!,
        speaker.personaId,
        blackboard,
        messages,
        turn,
        speaker.intent,
      )

      if (result) {
        // e. Update blackboard
        blackboard = updateBlackboard(blackboard, result.turnResult)

        // Record message (concatenate per-claim responses for context)
        const fullContent = result.claimResponses
          .map(cr => `[${cr.claimId}] ${cr.response}`)
          .join('\n\n')
        messages.push({
          personaId: result.turnResult.personaId,
          round: turn,
          content: fullContent,
        })

        // Build all stances for this agent's turn
        const allStances = result.claimResponses.map(cr => ({
          personaId: result.turnResult.personaId,
          claimId: cr.claimId,
          stance: cr.stance,
          confidence: cr.confidence,
          round: turn,
        }))

        // f. Yield one agent_turn event per claim response
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
              round: turn,
            },
            stances: allStances,
            round: turn,
          }

          eventCount++
        }

        yield {
          type: 'blackboard_update',
          tableId: TABLE_ID,
          summary: buildQuickSummary(blackboard),
        }

        // g. Compute and yield convergence
        const convergence = computeConvergence(
          blackboard,
          tracker,
          eventCount,
          turn,
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
    }

    // 5. Extract final output (with fallback if LLM call times out)
    let output
    try {
      output = await extractOutput(blackboard)
    } catch (extractErr) {
      console.error('[classical] extractOutput failed, using fallback:', extractErr)
      output = buildFallbackOutput(blackboard)
    }

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

// ─── Action Plan Generation ─────────────────────────────────

async function generateActionPlans(
  agents: Map<PersonaId, Agent>,
  personaIds: PersonaId[],
  blackboard: BlackboardState,
  messages: TurnMessage[],
  turn: number,
): Promise<ActionPlan[]> {
  const plans = await Promise.all(
    personaIds.map(async personaId => {
      try {
        const agent = agents.get(personaId)!
        const ctx = await assembleContext(personaId, blackboard, messages, turn)

        const recentMessages = messages
          .filter(m => m.round >= turn - 2)
          .slice(-10)
          .map(m => `[Turn ${m.round}] ${m.personaId}: ${m.content}`)
          .join('\n\n')

        const result = await completeJSON<ActionPlanResponse>({
          system: agent.systemPrompt,
          messages: [
            {
              role: 'user',
              content: actionPlanPrompt({
                blackboardSummary: ctx.blackboardSummary,
                recentMessages,
                claims: ctx.claims,
                currentStances: ctx.currentStances,
                personaId,
              }),
            },
          ],
          model: 'haiku',
          maxTokens: 256,
          temperature: 0.5,
        })

        return {
          personaId,
          action: result.action,
          urgency: Math.max(0, Math.min(1, result.urgency)),
          intent: result.intent,
        } satisfies ActionPlan
      } catch (err: unknown) {
        console.error(`Action plan failed for ${personaId}:`, err)
        // Default to speak with moderate urgency on failure
        return {
          personaId,
          action: 'speak' as const,
          urgency: 0.5,
          intent: 'Continue the discussion',
        } satisfies ActionPlan
      }
    }),
  )

  return plans
}

// ─── Single Classical Turn ──────────────────────────────────

interface ClassicalTurnResult {
  claimResponses: ClaimResponse[]
  turnResult: TurnResult
}

async function executeClassicalTurn(
  agent: Agent,
  personaId: PersonaId,
  blackboard: BlackboardState,
  messages: TurnMessage[],
  turn: number,
  intent: string,
): Promise<ClassicalTurnResult | null> {
  try {
    const ctx = await assembleContext(personaId, blackboard, messages, turn)

    const result = await completeJSON<AgentTurnResponse>({
      system: agent.systemPrompt,
      messages: [
        {
          role: 'user',
          content: classicalAgentTurnPrompt({
            blackboardSummary: ctx.blackboardSummary,
            localNeighborhood: ctx.localNeighborhood,
            claims: ctx.claims,
            currentStances: ctx.currentStances,
            intent,
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
        round: turn,
      },
    }
  } catch (err: unknown) {
    console.error(`Classical turn failed for ${personaId}:`, err)
    return null
  }
}

// ─── Quick Summary ──────────────────────────────────────────

// ─── Fallback Output (when extractOutput LLM call fails) ────

function buildFallbackOutput(board: BlackboardState): DebateOutput {
  return {
    cruxes: board.cruxCandidates.map(c => ({
      ...c,
      surfacedByTables: c.surfacedByTables ?? [0],
    })),
    faultLines: [],
    flipConditions: board.flipConditions,
    evidenceLedger: [],
    resolutionPaths: [],
  }
}

// ─── Quick Summary ──────────────────────────────────────────

function buildQuickSummary(board: BlackboardState): string {
  const parts: string[] = []

  if (board.disputes.length > 0) {
    parts.push(`${board.disputes.length} active dispute(s).`)
  }

  const openCruxes = board.cruxCandidates.filter(c => !c.resolved)
  if (openCruxes.length > 0) {
    parts.push(`${openCruxes.length} open crux(es): ${openCruxes.map(c => c.proposition).join('; ')}.`)
  }

  const triggered = board.flipConditions.filter(fc => fc.triggered)
  if (triggered.length > 0) {
    parts.push(`Flip conditions triggered: ${triggered.map(fc => `${fc.personaId} (${fc.condition})`).join(', ')}.`)
  }

  return parts.join(' ') || 'No significant developments yet.'
}
