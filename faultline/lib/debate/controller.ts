import type { PersonaId } from '@/lib/types'
import type { ArgumentationGraphState } from '@/lib/types/graph'
import type {
  ControllerState,
  ControllerDecision,
  DialogueTurn,
  DialogueMove,
  DebatePhase,
  Concession,
} from '@/lib/types/debate-engine'

// ─── Create Initial State ──────────────────────────────────

export function createControllerState(): ControllerState {
  return {
    phase: 1,
    turnsSinceLastCrystallization: 0,
    substantiveMovesInWindow: [],
    contestedFrontierHistory: [],
    concessions: [],
    circlingDetected: false,
  }
}

// ─── Controller Step ───────────────────────────────────────

/**
 * Pure function. Decides: who speaks next, optional steering hint,
 * whether to crystallize before this turn, and phase transitions.
 */
export function controllerStep(
  ctrlState: ControllerState,
  transcript: DialogueTurn[],
  graph: ArgumentationGraphState,
  personaIds: PersonaId[],
  maxTurns: number,
): ControllerDecision {
  const phase = ctrlState.phase

  // Phase transition check
  const phaseTransition = checkPhaseTransition(ctrlState, transcript, graph, personaIds, maxTurns)

  // Turn-taking: alternate speakers
  const nextSpeaker = pickNextSpeaker(transcript, personaIds)

  // Crystallization trigger
  const shouldCrystallize = checkCrystallizationTrigger(ctrlState, transcript)

  // Steering hint
  const steeringHint = computeSteeringHint(ctrlState, transcript, graph, personaIds, nextSpeaker)

  return {
    nextSpeaker,
    steeringHint,
    shouldCrystallize,
    phaseTransition,
  }
}

// ─── Update State ──────────────────────────────────────────

/**
 * Update controller state after a dialogue turn.
 */
export function updateControllerState(
  ctrlState: ControllerState,
  turn: DialogueTurn,
  concessions: Concession[],
): ControllerState {
  const substantive: DialogueMove[] = ['CLAIM', 'CHALLENGE', 'CONCEDE', 'REFRAME', 'PROPOSE_CRUX']

  return {
    ...ctrlState,
    turnsSinceLastCrystallization: ctrlState.turnsSinceLastCrystallization + 1,
    substantiveMovesInWindow: substantive.includes(turn.move)
      ? [...ctrlState.substantiveMovesInWindow.slice(-10), turn.move]
      : ctrlState.substantiveMovesInWindow,
    concessions: [...ctrlState.concessions, ...concessions],
  }
}

/**
 * Reset crystallization counter after a crystallization runs.
 */
export function resetCrystallizationCounter(
  ctrlState: ControllerState,
  contestedFrontierSize: number,
): ControllerState {
  return {
    ...ctrlState,
    turnsSinceLastCrystallization: 0,
    substantiveMovesInWindow: [],
    contestedFrontierHistory: [...ctrlState.contestedFrontierHistory, contestedFrontierSize],
  }
}

/**
 * Update phase in controller state.
 */
export function setPhase(ctrlState: ControllerState, phase: DebatePhase): ControllerState {
  return { ...ctrlState, phase }
}

// ─── Turn-Taking ───────────────────────────────────────────

function pickNextSpeaker(
  transcript: DialogueTurn[],
  personaIds: PersonaId[],
): PersonaId {
  if (transcript.length === 0) return personaIds[0]

  const lastSpeaker = transcript[transcript.length - 1].personaId
  const lastIdx = personaIds.indexOf(lastSpeaker)

  // Simple alternation
  return personaIds[(lastIdx + 1) % personaIds.length]
}

// ─── Crystallization Trigger ───────────────────────────────

function checkCrystallizationTrigger(
  ctrlState: ControllerState,
  transcript: DialogueTurn[],
): boolean {
  const turnsSince = ctrlState.turnsSinceLastCrystallization

  // Too soon — not enough material
  if (turnsSince < 2) return false

  // Check recent moves for urgent triggers
  const recentMoves = ctrlState.substantiveMovesInWindow
  const hasConcede = recentMoves.includes('CONCEDE')
  const hasReframe = recentMoves.includes('REFRAME')
  const hasProposeCrux = recentMoves.includes('PROPOSE_CRUX')

  // Urgent: concession, reframe, or crux proposal
  if (hasConcede || hasReframe || hasProposeCrux) return true

  // Safety net: crystallize every 5 turns
  if (turnsSince >= 5) return true

  // Substantive exchange: CLAIM followed by CHALLENGE
  if (recentMoves.length >= 2) {
    const last2 = recentMoves.slice(-2)
    if (last2.includes('CLAIM') && last2.includes('CHALLENGE')) return true
  }

  return false
}

// ─── Phase Transitions ─────────────────────────────────────

function checkPhaseTransition(
  ctrlState: ControllerState,
  transcript: DialogueTurn[],
  graph: ArgumentationGraphState,
  personaIds: PersonaId[],
  maxTurns: number,
): { to: DebatePhase; reason: string } | null {
  const phase = ctrlState.phase

  // Phase 1 → 2: All agents have given opening statements
  if (phase === 1) {
    const speakers = new Set(transcript.filter(t => t.phase === 1).map(t => t.personaId))
    if (speakers.size >= personaIds.length) {
      return { to: 2, reason: 'All agents have given opening statements' }
    }
  }

  // Phase 2 → 3
  if (phase === 2) {
    const budgetUsed = transcript.length / maxTurns
    const cfHistory = ctrlState.contestedFrontierHistory

    // CF stable for 2+ crystallizations
    if (cfHistory.length >= 3) {
      const last3 = cfHistory.slice(-3)
      if (last3[0] === last3[1] && last3[1] === last3[2] && last3[0] > 0) {
        return { to: 3, reason: 'Contested frontier stable across 3 crystallizations' }
      }
    }

    // Circling detected
    if (detectCircling(transcript)) {
      return { to: 3, reason: 'Dialogue is circling — moving to crux seeking' }
    }

    // Budget > 60%
    if (budgetUsed > 0.6) {
      return { to: 3, reason: 'Turn budget >60% consumed' }
    }
  }

  // Phase 3 → 4
  if (phase === 3) {
    const cruxTurns = transcript.filter(t => t.move === 'PROPOSE_CRUX')
    const cruxSpeakers = new Set(cruxTurns.map(t => t.personaId))

    // Both agents proposed cruxes
    if (cruxSpeakers.size >= personaIds.length) {
      return { to: 4, reason: 'Both agents have proposed cruxes' }
    }

    // Budget exhausted (leave room for phase 4)
    const budgetUsed = transcript.length / maxTurns
    if (budgetUsed > 0.85) {
      return { to: 4, reason: 'Turn budget nearly exhausted' }
    }
  }

  return null
}

// ─── Steering Hints ────────────────────────────────────────

function computeSteeringHint(
  ctrlState: ControllerState,
  transcript: DialogueTurn[],
  graph: ArgumentationGraphState,
  personaIds: PersonaId[],
  nextSpeaker: PersonaId,
): string | null {
  const phase = ctrlState.phase

  // Phase 1: no steering
  if (phase === 1) return null

  // Phase 4: no steering
  if (phase === 4) return null

  const recent = transcript.slice(-6)
  if (recent.length === 0) return null

  const otherSpeaker = personaIds.find(p => p !== nextSpeaker) ?? personaIds[0]
  const lastTurn = transcript[transcript.length - 1]

  // Phase 3: Active crux seeking
  if (phase === 3) {
    const cruxTurns = transcript.filter(t => t.move === 'PROPOSE_CRUX')
    const cruxSpeakers = new Set(cruxTurns.map(t => t.personaId))

    if (cruxSpeakers.size === 0) {
      return `In one sentence, what do you think is the core disagreement between you and ${otherSpeaker}?`
    }

    if (cruxSpeakers.size === 1 && !cruxSpeakers.has(nextSpeaker)) {
      const proposedCrux = cruxTurns[cruxTurns.length - 1]
      return `${proposedCrux.personaId} thinks the crux is: "${proposedCrux.dialogue.slice(0, 150)}". Do you agree, or is the real disagreement about something else?`
    }

    return null
  }

  // Phase 2: Light steering

  // Rule 1: Post-concession follow-up
  if (lastTurn.move === 'CONCEDE' && lastTurn.personaId !== nextSpeaker) {
    return `${lastTurn.personaId} just conceded a point. Given that, does your position change on anything?`
  }

  // Rule 2: Post-reframe
  if (lastTurn.move === 'REFRAME') {
    return `${lastTurn.personaId} reframed the debate. Do you agree that's the right framing?`
  }

  // Rule 3: Circling
  if (detectCircling(transcript)) {
    return `You've been going back and forth on similar points. What specific evidence or scenario would change your mind?`
  }

  // Rule 4: One-sided (same move type 3+ times in a row)
  const recentMoves = recent.map(t => t.move)
  if (recentMoves.length >= 4) {
    const last4Moves = recentMoves.slice(-4)
    if (last4Moves.every(m => m === 'CHALLENGE')) {
      return `Is there any part of ${otherSpeaker}'s argument you find compelling?`
    }
  }

  return null
}

// ─── Circling Detection ────────────────────────────────────

function detectCircling(transcript: DialogueTurn[]): boolean {
  if (transcript.length < 8) return false

  const recent = transcript.slice(-4).map(t => t.dialogue)
  const earlier = transcript.slice(-8, -4).map(t => t.dialogue)

  // Simple word overlap between recent and earlier windows
  const recentWords = toWordSet(recent.join(' '))
  const earlierWords = toWordSet(earlier.join(' '))

  if (recentWords.size === 0 || earlierWords.size === 0) return false

  const intersection = new Set([...recentWords].filter(w => earlierWords.has(w)))
  const overlap = intersection.size / Math.min(recentWords.size, earlierWords.size)

  return overlap > 0.6
}

// ─── Contested Frontier ────────────────────────────────────

/**
 * Compute the contested frontier: args that are IN in some preferred
 * extensions and OUT/UNDEC in others.
 */
export function computeContestedFrontier(graph: ArgumentationGraphState): string[] {
  if (graph.preferredExtensions.length < 2) return []

  const contested: string[] = []
  for (const arg of graph.arguments) {
    let inSome = false
    let outSome = false
    for (const ext of graph.preferredExtensions) {
      if (ext.has(arg.id)) inSome = true
      else outSome = true
    }
    if (inSome && outSome) contested.push(arg.id)
  }
  return contested
}

// ─── Helpers ───────────────────────────────────────────────

const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'but', 'or', 'not', 'so', 'yet', 'if', 'that', 'this', 'it', 'its', 'you', 'your', 'they', 'their', 'we', 'our', 'i', 'my', 'me'])

function toWordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )
}
