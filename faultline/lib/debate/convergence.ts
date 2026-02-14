import type { ArgumentationGraphState } from '@/lib/types/graph'
import type { DialogueTurn, Concession } from '@/lib/types/debate-engine'

// ─── Convergence Check ─────────────────────────────────────

export interface ConvergenceResult {
  converged: boolean
  reason: string | null
}

/**
 * Check if the debate should stop.
 */
export function checkConvergence(
  transcript: DialogueTurn[],
  graph: ArgumentationGraphState,
  concessions: Concession[],
  contestedFrontierHistory: number[],
): ConvergenceResult {
  // Crux proposed and acknowledged
  const cruxTurns = transcript.filter(t => t.move === 'PROPOSE_CRUX')
  const cruxSpeakers = new Set(cruxTurns.map(t => t.personaId))
  if (cruxSpeakers.size >= 2) {
    return { converged: true, reason: 'Both agents proposed cruxes' }
  }

  // Graph stable: no changes across 2+ crystallizations
  if (contestedFrontierHistory.length >= 3) {
    const last3 = contestedFrontierHistory.slice(-3)
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
      // Also check that graph size hasn't changed
      return { converged: true, reason: 'Graph stable across 3 crystallizations' }
    }
  }

  return { converged: false, reason: null }
}
