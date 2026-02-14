import type {
  Argument,
  Attack,
  ValidationResult,
  ArgumentationGraphState,
} from '@/lib/types/graph'
import {
  buildFramework,
  computeGroundedExtension,
  computePreferredExtensions,
  computeLabelling,
} from './dung'

// ─── Create ─────────────────────────────────────────────────

export function createGraphState(topic: string): ArgumentationGraphState {
  return {
    topic,
    arguments: [],
    attacks: [],
    validationResults: [],
    groundedExtension: new Set(),
    preferredExtensions: [],
    labelling: { labels: new Map() },
    round: 0,
  }
}

// ─── Add Arguments ──────────────────────────────────────────

export function addArguments(
  state: ArgumentationGraphState,
  args: Argument[],
): ArgumentationGraphState {
  return {
    ...state,
    arguments: [...state.arguments, ...args],
  }
}

// ─── Add Attacks ────────────────────────────────────────────

export function addAttacks(
  state: ArgumentationGraphState,
  attacks: Attack[],
  validations: ValidationResult[],
): ArgumentationGraphState {
  return {
    ...state,
    attacks: [...state.attacks, ...attacks],
    validationResults: [...state.validationResults, ...validations],
  }
}

// ─── Update Argument ────────────────────────────────────────

export function updateArgument(
  state: ArgumentationGraphState,
  id: string,
  updates: { claim?: string; assumptions?: string[]; premises?: string[]; evidence?: string[] },
): ArgumentationGraphState {
  return {
    ...state,
    arguments: state.arguments.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ),
  }
}

// ─── Remove Argument ────────────────────────────────────────

export function removeArgument(
  state: ArgumentationGraphState,
  argId: string,
): ArgumentationGraphState {
  const removedAttackIds = new Set(
    state.attacks
      .filter(atk => atk.fromArgId === argId || atk.toArgId === argId)
      .map(atk => atk.id)
  )
  return {
    ...state,
    arguments: state.arguments.filter(a => a.id !== argId),
    attacks: state.attacks.filter(atk => !removedAttackIds.has(atk.id)),
    validationResults: state.validationResults.filter(v => !removedAttackIds.has(v.attackId)),
  }
}

// ─── Remove Attack ──────────────────────────────────────────

export function removeAttack(
  state: ArgumentationGraphState,
  attackId: string,
): ArgumentationGraphState {
  return {
    ...state,
    attacks: state.attacks.filter(atk => atk.id !== attackId),
    validationResults: state.validationResults.filter(v => v.attackId !== attackId),
  }
}

// ─── Deduplicate Attacks ────────────────────────────────────

/**
 * Remove duplicate attacks targeting the same component of the same argument
 * with the same attack type. Keep the one with highest confidence.
 */
export function deduplicateAttacks(attacks: Attack[]): Attack[] {
  const seen = new Map<string, Attack>()

  for (const atk of attacks) {
    const key = `${atk.toArgId}:${atk.target.component}:${atk.target.index}:${atk.type}`
    const existing = seen.get(key)
    if (!existing || atk.confidence > existing.confidence) {
      seen.set(key, atk)
    }
  }

  return [...seen.values()]
}

// ─── Recompute Semantics ────────────────────────────────────

/**
 * Rebuild the Dung framework and recompute all semantic extensions.
 */
export function recomputeSemantics(
  state: ArgumentationGraphState,
): ArgumentationGraphState {
  const argIds = state.arguments.map(a => a.id)
  const fw = buildFramework(argIds, state.attacks, state.validationResults)
  const grounded = computeGroundedExtension(fw)
  const preferred = computePreferredExtensions(fw)
  const labelling = computeLabelling(fw)

  return {
    ...state,
    groundedExtension: grounded,
    preferredExtensions: preferred,
    labelling,
  }
}
