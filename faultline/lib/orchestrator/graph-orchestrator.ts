import type {
  SSEEvent,
  PersonaId,
  AgentStance,
} from '@/lib/types'
import type {
  Argument,
  Attack,
  ValidationResult,
  Labelling,
} from '@/lib/types/graph'
import { decomposeClaims } from './claims'
import { initializeAgents } from './agents'
import type { Agent } from './agents'
import { completeJSON } from '@/lib/llm/client'
import {
  initialArgumentPrompt,
  attackGenerationPrompt,
  batchValidationPrompt,
} from '@/lib/llm/graph-prompts'
import {
  createGraphState,
  addArguments,
  addAttacks,
  deduplicateAttacks,
  recomputeSemantics,
} from '@/lib/argumentation/graph-state'
import { extractGraphOutput, mapToDebateOutput } from '@/lib/argumentation/crux-extractor'

// ─── Configuration ──────────────────────────────────────────

const MAX_ROUNDS = 3
const TABLE_ID = 0

// ─── LLM Response Schemas ───────────────────────────────────

interface InitialArgResponse {
  stances: {
    claimId: string
    stance: 'pro' | 'con' | 'uncertain'
    confidence: number
    reasoning: string
  }[]
  arguments: {
    claim: string
    relatedClaimId?: string
    premises: string[]
    assumptions: string[]
    evidence: string[]
  }[]
}

interface AttackResponse {
  attacks: {
    toArgId: string
    type: 'rebut' | 'undermine' | 'undercut'
    targetComponent: 'claim' | 'premise' | 'assumption'
    targetIndex: number
    counterProposition: string
    rationale: string
    evidence: string[]
    confidence: number
    counterArgument: {
      claim: string
      premises: string[]
      assumptions: string[]
      evidence: string[]
    }
  }[]
}

interface BatchValidationResponse {
  validations: {
    attackId: string
    valid: boolean
    attackStrength: number
    corrections: string | null
  }[]
}

// ─── Graph Orchestrator ─────────────────────────────────────

export interface GraphConfig {
  topic: string
  personaIds: PersonaId[]
  debateId: string
  maxRounds?: number
}

export async function* runGraph(config: GraphConfig): AsyncGenerator<SSEEvent> {
  const { topic, personaIds, debateId, maxRounds = MAX_ROUNDS } = config

  try {
    // ── Step 1: Decompose topic ──
    yield { type: 'status', phase: 'claims', message: 'Decomposing topic into testable claims...' }
    const claims = await decomposeClaims(topic, debateId)
    yield { type: 'debate_start', debateId, claims }

    // ── Step 2: Initialize agents ──
    yield { type: 'status', phase: 'agents', message: `Loading ${personaIds.length} persona contracts...` }
    const agents = await initializeAgents(personaIds)
    yield { type: 'table_assigned', tableId: TABLE_ID, personaIds }

    // ── Step 3: Round 0 — Initial arguments ──
    yield { type: 'status', phase: 'arguments', message: 'Generating initial arguments...' }

    let graphState = createGraphState(topic)
    let argCounter = 0
    let attackCounter = 0
    const argClaimMap = new Map<string, string>() // argId → most relevant claimId

    // Parallel: each persona generates initial arguments
    const initPromises = personaIds.map(async (pid) => {
      const agent = agents.get(pid)!
      const excerpts = agent.contract.anchorExcerpts ?? []

      const result = await completeJSON<InitialArgResponse>({
        system: agent.systemPrompt,
        messages: [{
          role: 'user',
          content: initialArgumentPrompt(topic, claims, excerpts),
        }],
        model: 'sonnet',
        maxTokens: 2048,
        temperature: 0.7,
      })

      return { personaId: pid, arguments: result.arguments, stances: result.stances ?? [] }
    })

    const initResults = await Promise.all(initPromises)

    // Track per-persona stances across rounds
    const personaStances = new Map<PersonaId, Map<string, AgentStance>>()

    for (const result of initResults) {
      const newArgs: Argument[] = result.arguments.map(a => ({
        id: `arg-${argCounter++}`,
        speakerId: result.personaId,
        claim: a.claim,
        premises: a.premises ?? [],
        assumptions: a.assumptions ?? [],
        evidence: a.evidence ?? [],
        round: 0,
      }))

      // Map arguments to their related claims
      for (const [i, a] of result.arguments.entries()) {
        if (a.relatedClaimId && newArgs[i]) {
          argClaimMap.set(newArgs[i].id, a.relatedClaimId)
        }
      }

      graphState = addArguments(graphState, newArgs)

      // Emit arguments_submitted
      yield {
        type: 'arguments_submitted',
        personaId: result.personaId,
        arguments: newArgs,
        round: 0,
      }

      // Build stances from LLM response
      const stances: AgentStance[] = claims.map(claim => {
        const llmStance = result.stances.find(s => s.claimId === claim.id)
        return {
          personaId: result.personaId,
          claimId: claim.id,
          stance: llmStance?.stance ?? 'uncertain' as const,
          confidence: Math.max(0, Math.min(1, llmStance?.confidence ?? 0.5)),
          round: 0,
        }
      })

      // Store stances for later use during attacks
      const stanceMap = new Map<string, AgentStance>()
      for (const s of stances) stanceMap.set(s.claimId, s)
      personaStances.set(result.personaId, stanceMap)

      const reasonings = result.stances.map(s => ({
        claimId: s.claimId,
        reasoning: s.reasoning ?? '',
      }))

      yield {
        type: 'initial_stance',
        personaId: result.personaId,
        stances,
        reasonings,
      }
    }

    // Compute initial semantics
    graphState = recomputeSemantics(graphState)
    graphState = { ...graphState, round: 0 }

    // ── Step 4: Attack rounds ──
    let previousLabellingSnapshot = serializeLabelling(graphState.labelling)

    for (let round = 1; round <= maxRounds; round++) {
      yield {
        type: 'status',
        phase: 'attacks',
        message: `Round ${round}: Generating attacks...`,
      }

      // ── 4a. Attack generation (parallel, 1 Sonnet call per persona) ──
      const ownArgsByPersona = new Map<PersonaId, Set<string>>()
      for (const arg of graphState.arguments) {
        if (!ownArgsByPersona.has(arg.speakerId)) {
          ownArgsByPersona.set(arg.speakerId, new Set())
        }
        ownArgsByPersona.get(arg.speakerId)!.add(arg.id)
      }

      const attackPromises = personaIds.map(async (pid) => {
        const agent = agents.get(pid)!
        const ownIds = ownArgsByPersona.get(pid) ?? new Set()

        const result = await completeJSON<AttackResponse>({
          system: agent.systemPrompt,
          messages: [{
            role: 'user',
            content: attackGenerationPrompt(
              graphState.arguments,
              ownIds,
              topic,
              graphState.labelling,
            ),
          }],
          model: 'sonnet',
          maxTokens: 2048,
          temperature: 0.7,
        })

        return { personaId: pid, attacks: result.attacks ?? [] }
      })

      const attackResults = await Promise.all(attackPromises)

      // Collect all new attacks and counter-arguments
      const roundAttacks: Attack[] = []
      const roundCounterArgs: Argument[] = []

      for (const result of attackResults) {
        for (const atk of result.attacks) {
          // Validate that target exists
          const targetExists = graphState.arguments.some(a => a.id === atk.toArgId)
          if (!targetExists) continue

          // Prevent self-attacks
          const ownIds = ownArgsByPersona.get(result.personaId) ?? new Set()
          if (ownIds.has(atk.toArgId)) continue

          // Create counter-argument node
          const counterArgId = `arg-${argCounter++}`
          const counterArg: Argument = {
            id: counterArgId,
            speakerId: result.personaId,
            claim: atk.counterArgument?.claim ?? atk.counterProposition,
            premises: atk.counterArgument?.premises ?? [],
            assumptions: atk.counterArgument?.assumptions ?? [],
            evidence: atk.counterArgument?.evidence ?? atk.evidence ?? [],
            round,
          }
          roundCounterArgs.push(counterArg)

          const attackId = `atk-${attackCounter++}`
          roundAttacks.push({
            id: attackId,
            fromArgId: counterArgId,
            toArgId: atk.toArgId,
            type: atk.type,
            target: {
              argId: atk.toArgId,
              component: atk.targetComponent ?? 'claim',
              index: atk.targetIndex ?? 0,
            },
            counterProposition: atk.counterProposition,
            rationale: atk.rationale,
            evidence: atk.evidence ?? [],
            confidence: Math.max(0, Math.min(1, atk.confidence ?? 0.5)),
            speakerId: result.personaId,
            round,
          })
        }
      }

      // Add counter-argument nodes to graph
      graphState = addArguments(graphState, roundCounterArgs)

      // Emit attacks_generated
      yield {
        type: 'attacks_generated',
        attacks: roundAttacks,
        round,
      }

      if (roundAttacks.length === 0) {
        // No attacks = stable
        yield {
          type: 'graph_convergence',
          stable: true,
          newEdges: 0,
          round,
        }
        yield {
          type: 'convergence_update',
          metrics: {
            entropy: 0,
            confidenceWeightedDistance: 0,
            unresolvedCruxCount: 0,
            converged: true,
            diverged: false,
            eventCount: round,
            maxEvents: maxRounds,
          },
        }
        break
      }

      // ── 4b. Batch validation (1 Haiku call) ──
      yield {
        type: 'status',
        phase: 'validation',
        message: `Round ${round}: Validating ${roundAttacks.length} attacks...`,
      }

      const validationInput = roundAttacks.map(atk => ({
        id: atk.id,
        fromArgId: atk.fromArgId,
        toArgId: atk.toArgId,
        type: atk.type,
        counterProposition: atk.counterProposition,
        rationale: atk.rationale,
        target: { component: atk.target.component, index: atk.target.index },
      }))

      const argInput = graphState.arguments.map(a => ({
        id: a.id,
        claim: a.claim,
        premises: a.premises,
        assumptions: a.assumptions,
      }))

      let validations: ValidationResult[]
      try {
        const valResult = await completeJSON<BatchValidationResponse>({
          messages: [{
            role: 'user',
            content: batchValidationPrompt(validationInput, argInput),
          }],
          model: 'haiku',
          maxTokens: 2048,
          temperature: 0.3,
        })

        validations = (valResult.validations ?? []).map(v => ({
          attackId: v.attackId,
          valid: v.valid,
          attackStrength: Math.max(0, Math.min(1, v.attackStrength ?? 0.5)),
          corrections: v.corrections ?? null,
        }))
      } catch {
        // If validation fails, accept all attacks at medium strength
        validations = roundAttacks.map(atk => ({
          attackId: atk.id,
          valid: true,
          attackStrength: 0.5,
          corrections: null,
        }))
      }

      yield {
        type: 'validation_complete',
        results: validations,
        round,
      }

      // ── 4c. Deduplication ──
      const dedupedAttacks = deduplicateAttacks(roundAttacks)

      // ── 4d. Add attacks and recompute semantics ──
      graphState = addAttacks(graphState, dedupedAttacks, validations)
      graphState = recomputeSemantics(graphState)
      graphState = { ...graphState, round }

      // Emit graph_update
      yield {
        type: 'graph_update',
        labelling: graphState.labelling,
        groundedSize: graphState.groundedExtension.size,
        preferredCount: graphState.preferredExtensions.length,
        round,
      }

      // ── 4e. Backward compat: emit agent_turn per validated attack ──
      const validAttacks = dedupedAttacks.filter(atk =>
        validations.some(v => v.attackId === atk.id && v.valid)
      )

      for (const atk of validAttacks) {
        const content = atk.counterProposition

        // Find the most relevant claim for this attack
        const targetClaimId = argClaimMap.get(atk.toArgId)
          ?? argClaimMap.get(atk.fromArgId)
          ?? claims[0]?.id ?? ''

        // Use this persona's actual stance, not hardcoded 'con'
        const speakerStanceMap = personaStances.get(atk.speakerId)
        const speakerStance = speakerStanceMap?.get(targetClaimId)

        const allStances = claims.map(c => {
          const s = speakerStanceMap?.get(c.id)
          return {
            personaId: atk.speakerId,
            claimId: c.id,
            stance: s?.stance ?? ('uncertain' as const),
            confidence: s?.confidence ?? 0.5,
            round,
          }
        })

        yield {
          type: 'agent_turn',
          personaId: atk.speakerId,
          tableId: TABLE_ID,
          content,
          stance: {
            personaId: atk.speakerId,
            claimId: targetClaimId,
            stance: speakerStance?.stance ?? 'uncertain',
            confidence: atk.confidence,
            round,
          },
          stances: allStances,
          round,
        }

        // Map counter-argument to same claim
        argClaimMap.set(atk.fromArgId, targetClaimId)
      }

      // ── 4f. Convergence check ──
      const newLabellingSnapshot = serializeLabelling(graphState.labelling)
      const labellingStable = newLabellingSnapshot === previousLabellingSnapshot
      const validEdgeCount = validAttacks.length

      const converged = labellingStable || validEdgeCount === 0

      yield {
        type: 'graph_convergence',
        stable: converged,
        newEdges: validEdgeCount,
        round,
      }

      // Backward compat: convergence_update
      const undecCount = [...graphState.labelling.labels.values()].filter(l => l === 'UNDEC').length
      yield {
        type: 'convergence_update',
        metrics: {
          entropy: undecCount / Math.max(1, graphState.arguments.length),
          confidenceWeightedDistance: converged ? 0 : 0.5,
          unresolvedCruxCount: undecCount,
          converged,
          diverged: false,
          eventCount: round,
          maxEvents: maxRounds,
        },
      }

      // Backward compat: blackboard_update
      const inCount = [...graphState.labelling.labels.values()].filter(l => l === 'IN').length
      const outCount = [...graphState.labelling.labels.values()].filter(l => l === 'OUT').length
      yield {
        type: 'blackboard_update',
        tableId: TABLE_ID,
        summary: `Graph: ${graphState.arguments.length} args, ${inCount} IN / ${outCount} OUT / ${undecCount} UNDEC. ${graphState.preferredExtensions.length} preferred extension(s).`,
      }

      previousLabellingSnapshot = newLabellingSnapshot

      if (converged) break
    }

    // ── Step 5: Extract output (pure code, no LLM) ──
    yield { type: 'status', phase: 'output', message: 'Computing debate results from graph...' }

    const graphOutput = extractGraphOutput(graphState)
    const output = mapToDebateOutput(graphOutput, graphState, personaIds)

    yield { type: 'debate_complete', output }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    yield { type: 'error', message }
  }
}

// ─── Helpers ────────────────────────────────────────────────

function serializeLabelling(labelling: Labelling): string {
  const entries = [...labelling.labels.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return entries.map(([id, label]) => `${id}:${label}`).join(',')
}
