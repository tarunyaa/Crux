import type { PersonaId } from '@/lib/types'
import type { Argument, Attack, ValidationResult, ArgumentationGraphState } from '@/lib/types/graph'
import type {
  DebateEngineConfig,
  DebateEngineOutput,
  DebateEvent,
  DialogueTurn,
  DialogueMove,
  DebatePhase,
  Concession,
} from '@/lib/types/debate-engine'
import { initializeAgents } from '@/lib/orchestrator/agents'
import type { Agent } from '@/lib/orchestrator/agents'
import { completeJSON, getTotalUsage, resetUsage } from '@/lib/llm/client'
import { createGraphState, addArguments, addAttacks, recomputeSemantics } from '@/lib/argumentation/graph-state'
import {
  createControllerState,
  controllerStep,
  updateControllerState,
  resetCrystallizationCounter,
  setPhase,
  computeContestedFrontier,
} from './controller'
import { crystallize } from './crystallizer'
import { checkConvergence } from './convergence'
import { openingStatementPrompt, dialogueTurnPrompt, centralizedDiscoveryPrompt, resolutionPrompt } from './prompts'

// ─── Engine ─────────────────────────────────────────────────

export async function* runDebate(
  config: DebateEngineConfig,
): AsyncGenerator<DebateEvent> {
  const startTime = Date.now()
  resetUsage()

  const { topic, personaIds } = config
  const maxTurns = config.maxTurns ?? 30

  yield { type: 'engine_start', topic, personaIds }

  // Initialize agents
  const agents = await initializeAgents(personaIds)

  // Initialize state
  let graph = createGraphState(topic)
  let ctrlState = createControllerState()
  const transcript: DialogueTurn[] = []
  const allConcessions: Concession[] = []
  let globalTurnIndex = 0
  const argCounter = { value: 0 }
  const attackCounter = { value: 0 }

  // Track dialogue since last crystallization
  let dialogueSinceLastCrystallization: DialogueTurn[] = []

  // ─── Phase 1: Opening Statements ────────────────────────

  yield { type: 'phase_start', phase: 1 }

  for (const pid of personaIds) {
    const agent = agents.get(pid)!
    const prompt = openingStatementPrompt(topic)

    let response: { dialogue: string; move: string }
    try {
      response = await completeJSON({
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        model: 'haiku',  // Use Haiku for faster opening statements
        maxTokens: 512,
        temperature: 0.7,
      })
    } catch {
      continue
    }

    const turn: DialogueTurn = {
      turnIndex: globalTurnIndex++,
      phase: 1,
      personaId: pid,
      dialogue: response.dialogue ?? '',
      move: 'CLAIM',
      steeringHint: null,
      timestamp: Date.now(),
    }
    transcript.push(turn)
    dialogueSinceLastCrystallization.push(turn)
    ctrlState = updateControllerState(ctrlState, turn, [])
    yield { type: 'dialogue_turn', turn }
  }

  // Initial crystallization: extract opening positions into graph
  const initCrystal = await crystallize(
    dialogueSinceLastCrystallization, graph, topic, argCounter, attackCounter,
  )
  graph = initCrystal.state
  allConcessions.push(...initCrystal.concessions)
  dialogueSinceLastCrystallization = []

  const cfSize = computeContestedFrontier(graph).length
  ctrlState = resetCrystallizationCounter(ctrlState, cfSize)
  yield { type: 'crystallization', result: initCrystal.result }
  yield graphUpdateEvent(graph)

  // If we got arguments, run centralized discovery for cross-attacks
  if (graph.arguments.length >= 2) {
    const discoveryResult = await completeJSON<{
      attacks: {
        fromArgId: string; toArgId: string; type: string
        targetComponent: string; targetIndex: number
        counterProposition: string; rationale: string
        evidence: string[]; confidence: number; valid: boolean; attackStrength: number
      }[]
    }>({
      messages: [{ role: 'user', content: centralizedDiscoveryPrompt(graph.arguments, topic) }],
      model: 'sonnet',
      maxTokens: 4096,
      temperature: 0.5,
    })

    const validArgIds = new Set(graph.arguments.map(a => a.id))
    const newAttacks: Attack[] = []
    const newValidations: ValidationResult[] = []

    for (const atk of discoveryResult.attacks) {
      if (!validArgIds.has(atk.fromArgId) || !validArgIds.has(atk.toArgId)) continue
      if (atk.fromArgId === atk.toArgId) continue

      const attackId = `atk-${attackCounter.value++}`
      const fromArg = graph.arguments.find(a => a.id === atk.fromArgId)

      newAttacks.push({
        id: attackId,
        fromArgId: atk.fromArgId,
        toArgId: atk.toArgId,
        type: (atk.type as 'rebut' | 'undermine' | 'undercut') ?? 'rebut',
        target: {
          argId: atk.toArgId,
          component: (atk.targetComponent as 'claim' | 'premise' | 'assumption') ?? 'claim',
          index: atk.targetIndex ?? 0,
        },
        counterProposition: atk.counterProposition ?? '',
        rationale: atk.rationale ?? '',
        evidence: atk.evidence ?? [],
        confidence: atk.confidence ?? 0.8,
        speakerId: fromArg?.speakerId ?? personaIds[0],
        round: 0,
      })

      newValidations.push({
        attackId,
        valid: atk.valid !== false,
        attackStrength: atk.attackStrength ?? atk.confidence ?? 0.8,
        corrections: null,
      })
    }

    if (newAttacks.length > 0) {
      graph = addAttacks(graph, newAttacks, newValidations)
      graph = recomputeSemantics(graph)
    }

    yield graphUpdateEvent(graph)
  }

  // Transition to Phase 2
  ctrlState = setPhase(ctrlState, 2)
  yield { type: 'phase_transition', from: 1, to: 2, reason: 'Opening statements complete' }
  yield { type: 'phase_start', phase: 2 }

  // ─── Phases 2-4: Dialogue Loop ──────────────────────────

  while (globalTurnIndex < maxTurns) {
    // Controller step
    const decision = controllerStep(ctrlState, transcript, graph, personaIds, maxTurns)

    // Phase transition
    if (decision.phaseTransition) {
      const from = ctrlState.phase
      const to = decision.phaseTransition.to
      ctrlState = setPhase(ctrlState, to)

      // Crystallize before transitioning if we have material
      if (dialogueSinceLastCrystallization.length > 0) {
        const crystal = await crystallize(
          dialogueSinceLastCrystallization, graph, topic, argCounter, attackCounter,
        )
        graph = crystal.state
        allConcessions.push(...crystal.concessions)
        dialogueSinceLastCrystallization = []

        const cf = computeContestedFrontier(graph).length
        ctrlState = resetCrystallizationCounter(ctrlState, cf)
        yield { type: 'crystallization', result: crystal.result }
        yield graphUpdateEvent(graph)
      }

      yield { type: 'phase_transition', from, to, reason: decision.phaseTransition.reason }
      yield { type: 'phase_start', phase: to }

      // Phase 4: break out of dialogue loop, resolution happens after
      if (to === 4) break
    }

    // Crystallize before this turn if triggered
    if (decision.shouldCrystallize && dialogueSinceLastCrystallization.length > 0) {
      const crystal = await crystallize(
        dialogueSinceLastCrystallization, graph, topic, argCounter, attackCounter,
      )
      graph = crystal.state
      allConcessions.push(...crystal.concessions)
      dialogueSinceLastCrystallization = []

      const cf = computeContestedFrontier(graph).length
      ctrlState = resetCrystallizationCounter(ctrlState, cf)
      yield { type: 'crystallization', result: crystal.result }
      yield graphUpdateEvent(graph)

      for (const c of crystal.concessions) {
        yield { type: 'concession', concession: c }
      }
    }

    // Emit steering hint
    if (decision.steeringHint) {
      yield { type: 'steering', hint: decision.steeringHint, targetPersonaId: decision.nextSpeaker }
    }

    // Get agent response
    const agent = agents.get(decision.nextSpeaker)!
    const recentDialogue = transcript.slice(-8)

    const isPhase4 = ctrlState.phase === 4
    const prompt = isPhase4
      ? resolutionPrompt(topic, transcript)
      : dialogueTurnPrompt(topic, recentDialogue, decision.steeringHint, ctrlState.phase)

    let response: { dialogue: string; move: string }
    try {
      response = await completeJSON({
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        model: 'haiku',  // Use Haiku for faster dialogue turns
        maxTokens: 256,   // Shorter responses
        temperature: 0.7,
      })
    } catch {
      continue // Skip failed turns
    }

    // Validate move type
    const validMoves: DialogueMove[] = ['CLAIM', 'CHALLENGE', 'CLARIFY', 'CONCEDE', 'REFRAME', 'PROPOSE_CRUX']
    const move: DialogueMove = validMoves.includes(response.move as DialogueMove)
      ? (response.move as DialogueMove)
      : 'CLAIM'

    const turn: DialogueTurn = {
      turnIndex: globalTurnIndex++,
      phase: ctrlState.phase,
      personaId: decision.nextSpeaker,
      dialogue: response.dialogue ?? '',
      move,
      steeringHint: decision.steeringHint,
      timestamp: Date.now(),
    }
    transcript.push(turn)
    dialogueSinceLastCrystallization.push(turn)
    ctrlState = updateControllerState(ctrlState, turn, [])
    yield { type: 'dialogue_turn', turn }

    // Track crux proposals
    if (move === 'PROPOSE_CRUX') {
      yield { type: 'crux_proposed', personaId: decision.nextSpeaker, statement: response.dialogue }
    }

    // Convergence check (every few turns)
    if (globalTurnIndex % 4 === 0) {
      const convergence = checkConvergence(
        transcript, graph, allConcessions, ctrlState.contestedFrontierHistory,
      )
      yield { type: 'convergence_check', converged: convergence.converged, reason: convergence.reason }
      if (convergence.converged) break
    }
  }

  // Final crystallization if we have pending dialogue
  if (dialogueSinceLastCrystallization.length > 0) {
    const crystal = await crystallize(
      dialogueSinceLastCrystallization, graph, topic, argCounter, attackCounter,
    )
    graph = crystal.state
    allConcessions.push(...crystal.concessions)
    yield { type: 'crystallization', result: crystal.result }
    yield graphUpdateEvent(graph)
  }

  // ─── Build Output ───────────────────────────────────────

  const usage = getTotalUsage()

  // Extract crux from PROPOSE_CRUX turns
  const cruxTurns = transcript.filter(t => t.move === 'PROPOSE_CRUX')
  const crux = cruxTurns.length > 0
    ? {
        proposedBy: [...new Set(cruxTurns.map(t => t.personaId))],
        statement: cruxTurns[cruxTurns.length - 1].dialogue,
        assumptions: [],
        acknowledged: new Set(cruxTurns.map(t => t.personaId)).size >= personaIds.length,
      }
    : null

  // Common ground
  const commonGround = [...graph.groundedExtension]

  // Camps
  const camps = buildCamps(graph, personaIds)

  // Regime
  const { regime, regimeDescription } = classifyRegime(graph)

  const output: DebateEngineOutput = {
    topic,
    personaIds,
    transcript,
    graph,
    crux,
    commonGround,
    camps,
    concessionTrail: allConcessions,
    regime,
    regimeDescription,
    tokenUsage: usage,
    duration: Date.now() - startTime,
  }

  // Resolution phase: each agent summarizes
  if (ctrlState.phase === 4 || globalTurnIndex >= maxTurns) {
    for (const pid of personaIds) {
      const agent = agents.get(pid)!
      const prompt = resolutionPrompt(topic, transcript)

      try {
        const response = await completeJSON<{ dialogue: string; move: string }>({
          system: agent.systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          model: 'haiku',  // Use Haiku for faster resolution
          maxTokens: 512,
          temperature: 0.5,
        })

        const turn: DialogueTurn = {
          turnIndex: globalTurnIndex++,
          phase: 4,
          personaId: pid,
          dialogue: response.dialogue ?? '',
          move: 'CLAIM',
          steeringHint: null,
          timestamp: Date.now(),
        }
        transcript.push(turn)
        yield { type: 'dialogue_turn', turn }
      } catch {
        // Skip failed resolution turns
      }
    }
  }

  yield { type: 'engine_complete', output }
}

// ─── Helpers ───────────────────────────────────────────────

function graphUpdateEvent(g: ArgumentationGraphState): DebateEvent {
  let ic = 0, oc = 0, uc = 0
  for (const l of g.labelling.labels.values()) {
    if (l === 'IN') ic++
    else if (l === 'OUT') oc++
    else uc++
  }
  return {
    type: 'graph_updated',
    inCount: ic,
    outCount: oc,
    undecCount: uc,
    preferredCount: g.preferredExtensions.length,
  }
}

function buildCamps(
  graph: ArgumentationGraphState,
  personaIds: PersonaId[],
): { personaIds: PersonaId[]; argumentIds: string[]; extensionIndex: number }[] {
  if (graph.preferredExtensions.length === 0) return []

  const argById = new Map(graph.arguments.map(a => [a.id, a]))

  // Count each persona's args per extension
  const personaExtCounts = new Map<PersonaId, number[]>()
  for (const pid of personaIds) {
    personaExtCounts.set(pid, new Array(graph.preferredExtensions.length).fill(0))
  }
  for (const [idx, ext] of graph.preferredExtensions.entries()) {
    for (const argId of ext) {
      const arg = argById.get(argId)
      if (arg && personaExtCounts.has(arg.speakerId)) {
        personaExtCounts.get(arg.speakerId)![idx]++
      }
    }
  }

  // Assign each persona to their best extension
  const extPersonas = new Map<number, PersonaId[]>()
  for (const [pid, counts] of personaExtCounts) {
    let bestIdx = 0
    let bestCount = counts[0]
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] > bestCount) { bestIdx = i; bestCount = counts[i] }
    }
    if (!extPersonas.has(bestIdx)) extPersonas.set(bestIdx, [])
    extPersonas.get(bestIdx)!.push(pid)
  }

  return [...extPersonas.entries()].map(([idx, pids]) => {
    const pidSet = new Set(pids)
    const argumentIds = [...graph.preferredExtensions[idx]].filter(argId => {
      const arg = argById.get(argId)
      return arg && pidSet.has(arg.speakerId)
    })
    return { extensionIndex: idx, argumentIds, personaIds: pids }
  })
}

function classifyRegime(graph: ArgumentationGraphState): { regime: 'consensus' | 'polarized' | 'partial'; regimeDescription: string } {
  const prefCount = graph.preferredExtensions.length
  const groundedSize = graph.groundedExtension.size
  const totalArgs = graph.arguments.length

  if (totalArgs === 0) {
    return { regime: 'partial', regimeDescription: 'No arguments in graph' }
  }

  if (prefCount <= 1 && groundedSize > totalArgs * 0.3) {
    return {
      regime: 'consensus',
      regimeDescription: `Consensus: ${groundedSize} of ${totalArgs} arguments in common ground.`,
    }
  }

  if (prefCount >= 2 && groundedSize < totalArgs * 0.15) {
    return {
      regime: 'polarized',
      regimeDescription: `Polarized: ${prefCount} camps, only ${groundedSize} arguments in common ground.`,
    }
  }

  return {
    regime: 'partial',
    regimeDescription: `Partial agreement: ${groundedSize} in common ground, ${prefCount} preferred extension(s).`,
  }
}
