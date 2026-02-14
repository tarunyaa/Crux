import type { Argument, Attack, ValidationResult, ArgumentationGraphState } from '@/lib/types/graph'
import type { DialogueTurn, CrystallizationResult, Concession } from '@/lib/types/debate-engine'
import { completeJSON } from '@/lib/llm/client'
import { crystallizationPrompt } from './prompts'
import { addArguments, addAttacks, updateArgument, removeArgument, removeAttack, recomputeSemantics } from '@/lib/argumentation/graph-state'

// ─── Crystallize ───────────────────────────────────────────

/**
 * Read a cluster of recent dialogue turns and extract/update/remove
 * formal argument nodes in the graph. Returns the updated graph state
 * and the crystallization result.
 */
export async function crystallize(
  dialogueCluster: DialogueTurn[],
  state: ArgumentationGraphState,
  topic: string,
  argCounter: { value: number },
  attackCounter: { value: number },
): Promise<{ state: ArgumentationGraphState; result: CrystallizationResult; concessions: Concession[] }> {
  if (dialogueCluster.length === 0) {
    return {
      state,
      result: { newArgs: [], updatedArgs: [], removedArgIds: [], newAttacks: [], removedAttackIds: [] },
      concessions: [],
    }
  }

  const prompt = crystallizationPrompt(topic, dialogueCluster, state)

  const raw = await completeJSON<{
    newArgs: { speakerId: string; claim: string; premises: string[]; assumptions: string[]; evidence: string[] }[]
    updatedArgs: { id: string; claim?: string; assumptions?: string[] }[]
    removedArgIds: string[]
    newAttacks: {
      fromArgId: string; toArgId: string; type: string
      targetComponent: string; targetIndex: number
      counterProposition: string; rationale: string
    }[]
    removedAttackIds: string[]
  }>({
    messages: [{ role: 'user', content: prompt }],
    model: 'sonnet',
    maxTokens: 4096,
    temperature: 0.3,
  })

  let updated = state
  const concessions: Concession[] = []

  // Map from placeholder IDs (arg-NEW-0, etc.) to real IDs
  const idMap = new Map<string, string>()

  // 1. Remove arguments (concessions)
  const validArgIds = new Set(updated.arguments.map(a => a.id))
  const removedArgIds = (raw.removedArgIds ?? []).filter(id => validArgIds.has(id))

  for (const argId of removedArgIds) {
    const arg = updated.arguments.find(a => a.id === argId)
    if (arg) {
      // Find which dialogue turn triggered this concession
      const concedeTurn = dialogueCluster.find(t => t.move === 'CONCEDE' && t.personaId !== arg.speakerId)
        ?? dialogueCluster[dialogueCluster.length - 1]

      concessions.push({
        turnIndex: concedeTurn.turnIndex,
        personaId: arg.speakerId,
        type: 'full',
        concededClaim: arg.claim,
        effect: `Removed argument [${argId}]: "${arg.claim}"`,
        removedArgIds: [argId],
        updatedArgIds: [],
      })
    }
    updated = removeArgument(updated, argId)
  }

  // 2. Update arguments (narrowing, refinement)
  const updatedArgs = (raw.updatedArgs ?? []).filter(u => updated.arguments.some(a => a.id === u.id))

  for (const u of updatedArgs) {
    const updates: { claim?: string; assumptions?: string[] } = {}
    if (u.claim) updates.claim = u.claim
    if (u.assumptions) updates.assumptions = u.assumptions
    updated = updateArgument(updated, u.id, updates)

    // Track as partial concession if claim changed
    if (u.claim) {
      const original = state.arguments.find(a => a.id === u.id)
      if (original && original.claim !== u.claim) {
        const concedeTurn = dialogueCluster.find(t => t.move === 'CONCEDE' && t.personaId === original.speakerId)
          ?? dialogueCluster[dialogueCluster.length - 1]
        concessions.push({
          turnIndex: concedeTurn.turnIndex,
          personaId: original.speakerId,
          type: 'partial',
          concededClaim: original.claim,
          effect: `Narrowed [${u.id}] from "${original.claim}" to "${u.claim}"`,
          removedArgIds: [],
          updatedArgIds: [u.id],
        })
      }
    }
  }

  // 3. Add new arguments
  const newArgs: Argument[] = (raw.newArgs ?? []).map(a => {
    const realId = `arg-${argCounter.value++}`
    // Map any placeholder ID the LLM used
    const placeholderIdx = (raw.newArgs ?? []).indexOf(a)
    idMap.set(`arg-NEW-${placeholderIdx}`, realId)

    return {
      id: realId,
      speakerId: a.speakerId,
      claim: a.claim,
      premises: a.premises ?? [],
      assumptions: a.assumptions ?? [],
      evidence: a.evidence ?? [],
      round: 0, // v2 doesn't use rounds
    }
  })

  if (newArgs.length > 0) {
    updated = addArguments(updated, newArgs)
  }

  // 4. Remove attacks
  const validAttackIds = new Set(updated.attacks.map(a => a.id))
  const removedAttackIds = (raw.removedAttackIds ?? []).filter(id => validAttackIds.has(id))

  for (const atkId of removedAttackIds) {
    updated = removeAttack(updated, atkId)
  }

  // 5. Add new attacks
  const currentArgIds = new Set(updated.arguments.map(a => a.id))
  const newAttacks: Attack[] = []
  const newValidations: ValidationResult[] = []

  for (const atk of (raw.newAttacks ?? [])) {
    // Resolve placeholder IDs
    const fromId = idMap.get(atk.fromArgId) ?? atk.fromArgId
    const toId = idMap.get(atk.toArgId) ?? atk.toArgId

    if (!currentArgIds.has(fromId) || !currentArgIds.has(toId)) continue
    if (fromId === toId) continue

    const attackId = `atk-${attackCounter.value++}`
    const fromArg = updated.arguments.find(a => a.id === fromId)

    newAttacks.push({
      id: attackId,
      fromArgId: fromId,
      toArgId: toId,
      type: (atk.type as 'rebut' | 'undermine' | 'undercut') ?? 'rebut',
      target: {
        argId: toId,
        component: (atk.targetComponent as 'claim' | 'premise' | 'assumption') ?? 'claim',
        index: atk.targetIndex ?? 0,
      },
      counterProposition: atk.counterProposition ?? '',
      rationale: atk.rationale ?? '',
      evidence: [],
      confidence: 0.8,
      speakerId: fromArg?.speakerId ?? '',
      round: 0,
    })

    newValidations.push({
      attackId,
      valid: true,
      attackStrength: 0.8,
      corrections: null,
    })
  }

  if (newAttacks.length > 0) {
    updated = addAttacks(updated, newAttacks, newValidations)
  }

  // 6. Recompute semantics
  updated = recomputeSemantics(updated)

  const result: CrystallizationResult = {
    newArgs,
    updatedArgs,
    removedArgIds,
    newAttacks,
    removedAttackIds,
  }

  return { state: updated, result, concessions }
}
