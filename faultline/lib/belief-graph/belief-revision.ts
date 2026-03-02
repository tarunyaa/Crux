// ─── CE-QArg Belief Revision (Stage 7: Persona-Modulated) ────
// Minimal base score adjustment to account for new attacks/supports.
// Reference: arXiv:2407.08497 (KR 2024)
//
// Stage 7 addition: revision resistance R derived from persona contract.
// σ_target = σ_current + (1 - R) × (σ_raw - σ_current)
// R modulates how much a persona actually revises in response to attacks.

import type { PersonaQBAF, RevisionResult } from './types'
import type { PersonaContract } from '@/lib/types'
import { completeJSON } from '@/lib/llm/client'
import { computeStrengths } from './df-quad'

/**
 * Analyze polarity: does increasing node's τ raise or lower the root's σ?
 * Traces paths from node to root, counting attack edges.
 * Even number of attacks = positive polarity, odd = negative.
 */
export function analyzePolarity(
  qbaf: PersonaQBAF,
  nodeId: string,
  rootId: string,
): 'positive' | 'negative' | 'neutral' {
  const paths = findPaths(qbaf, nodeId, rootId)
  if (paths.length === 0) return 'neutral'

  let positiveCount = 0
  let negativeCount = 0

  for (const path of paths) {
    let attackCount = 0
    for (const edgeId of path) {
      const edge = qbaf.edges.find(e => e.id === edgeId)
      if (edge?.type === 'attack') attackCount++
    }
    if (attackCount % 2 === 0) positiveCount++
    else negativeCount++
  }

  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

/**
 * Find all paths from sourceId to targetId through the edge graph.
 * Returns arrays of edge IDs.
 */
function findPaths(qbaf: PersonaQBAF, sourceId: string, targetId: string): string[][] {
  const results: string[][] = []
  const visited = new Set<string>()

  const adj = new Map<string, { edgeId: string; to: string }[]>()
  for (const edge of qbaf.edges) {
    const existing = adj.get(edge.from) ?? []
    existing.push({ edgeId: edge.id, to: edge.to })
    adj.set(edge.from, existing)
  }

  function dfs(current: string, path: string[]): void {
    if (current === targetId) {
      results.push([...path])
      return
    }
    if (visited.has(current)) return
    visited.add(current)

    for (const neighbor of adj.get(current) ?? []) {
      dfs(neighbor.to, [...path, neighbor.edgeId])
    }

    visited.delete(current)
  }

  dfs(sourceId, [])
  return results
}

/**
 * Compute priority for a node: closer to root = higher priority.
 * Priority = 1 / (distance_to_root + 1)
 */
export function computePriority(
  qbaf: PersonaQBAF,
  nodeId: string,
  rootId: string,
): number {
  const node = qbaf.nodes.find(n => n.id === nodeId)
  if (!node) return 0
  if (nodeId === rootId) return 1.0
  return 1 / (node.depth + 1)
}

// ─── Revision Resistance (Stage 7) ──────────────────────────

/**
 * Compute revision resistance R ∈ [0, 1] from persona contract.
 *
 * R = 0: fully open to revision (instantly accepts opponent's arguments)
 * R = 1: completely resistant (never revises)
 *
 * Components:
 * - Epistemic openness (from epistemology text): lower R if empiricist/open
 * - Stakes intensity (from stakes text): higher R if high stakes
 * - Flip conditions (from flipConditions): lower R if conditions are concrete
 */
export async function computeRevisionResistance(
  contract: PersonaContract,
  newAttacks: string[],
): Promise<{ R: number; reasoning: string }> {
  const response = await completeJSON<{
    epistemicOpenness: number  // 0-1: how open to changing mind
    stakesRigidity: number    // 0-1: how much stakes prevent revision
    flipTriggered: boolean    // did any attack trigger a flip condition?
    R: number                 // final resistance 0-1
    reasoning: string
  }>({
    system: `You assess how resistant a debate persona would be to revising their beliefs based on their psychological profile. Output JSON only.`,
    messages: [{
      role: 'user',
      content: `PERSONA PROFILE:

Epistemology: ${contract.epistemology.slice(0, 800)}

Stakes: ${contract.stakes.slice(0, 800)}

Flip Conditions: ${contract.flipConditions.slice(0, 800)}

ATTACKS RECEIVED:
${newAttacks.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Assess this persona's revision resistance:

1. "epistemicOpenness" (0-1): Based on their epistemology, how open are they to changing their mind?
   - 0 = dogmatic, never changes mind
   - 1 = fully empiricist, follows evidence wherever it leads

2. "stakesRigidity" (0-1): How much do their stakes (financial, reputational) prevent genuine revision?
   - 0 = no stakes pressure, can freely revise
   - 1 = enormous stakes, revision would be career-ending

3. "flipTriggered" (true/false): Do any of the attacks directly address one of their stated flip conditions?

4. "R" (0-1): Final revision resistance.
   - Formula guidance: R = (1 - epistemicOpenness) * 0.5 + stakesRigidity * 0.3 + 0.2
   - If flipTriggered: R = min(R, 0.2) — flip conditions override resistance
   - Typical range: 0.3-0.7 for most personas

5. "reasoning": 1-2 sentences explaining the assessment.

Output JSON: {"epistemicOpenness": N, "stakesRigidity": N, "flipTriggered": bool, "R": N, "reasoning": "..."}`
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 512,
  })

  const R = Math.max(0, Math.min(1, response.R))
  return { R, reasoning: response.reasoning }
}

/**
 * Determine target root strength after receiving new attacks.
 * Stage 7: Applies revision resistance to dampen the shift.
 *
 * σ_target = σ_current + (1 - R) × (σ_raw - σ_current)
 * where σ_raw is the "context-free" target from Haiku.
 */
export async function determineTargetStrength(
  qbaf: PersonaQBAF,
  newAttacks: string[],
  personaName: string,
  contract?: PersonaContract,
): Promise<{ target: number; R: number; rawTarget: number; reasoning: string }> {
  const currentStrength = qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0.5

  // Step 1: Get raw (context-free) target from Haiku
  const response = await completeJSON<{ targetStrength: number }>({
    system: `You evaluate confidence shifts after counter-arguments. Respond ONLY with JSON. No reasoning.`,
    messages: [{
      role: 'user',
      content: `${personaName}'s thesis: "${qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.claim}"
Current strength: ${currentStrength.toFixed(3)}

Counter-arguments received:
${newAttacks.map((a, i) => `${i + 1}. ${a}`).join('\n')}

What should the updated confidence be? Most counter-arguments cause small shifts (0.02-0.10). Only devastating arguments cause shifts > 0.15.

Respond ONLY: {"targetStrength": <number between 0 and 1>}`
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 64,
  })

  const rawTarget = Math.max(0, Math.min(1, response.targetStrength))

  // Step 2: Apply revision resistance if contract provided
  if (contract) {
    const { R, reasoning } = await computeRevisionResistance(contract, newAttacks)

    // σ_target = σ_current + (1 - R) × (σ_raw - σ_current)
    const modulatedTarget = currentStrength + (1 - R) * (rawTarget - currentStrength)

    // Clamp: don't allow target to deviate more than 0.2 from current per round
    const maxShift = 0.2
    const clampedTarget = Math.max(
      currentStrength - maxShift,
      Math.min(currentStrength + maxShift, modulatedTarget),
    )

    return { target: clampedTarget, R, rawTarget, reasoning }
  }

  // Fallback: no contract → original behavior (no resistance)
  const maxShift = 0.2
  const clampedTarget = Math.max(
    currentStrength - maxShift,
    Math.min(currentStrength + maxShift, rawTarget),
  )
  return { target: clampedTarget, R: 0, rawTarget, reasoning: 'No contract provided' }
}

/**
 * CE-QArg belief revision: minimally adjust base scores so root strength
 * approaches the target value.
 */
export function reviseBeliefs(
  qbaf: PersonaQBAF,
  targetStrength: number,
  epsilon: number = 0.01,
  maxIterations: number = 50,
): RevisionResult {
  const rootId = qbaf.rootClaim
  let current = { ...qbaf, nodes: qbaf.nodes.map(n => ({ ...n })) }
  const originalScores = new Map(qbaf.nodes.map(n => [n.id, n.baseScore]))

  const adjustableNodes = current.nodes
    .filter(n => n.id !== rootId)
    .map(n => ({
      id: n.id,
      polarity: analyzePolarity(current, n.id, rootId),
      priority: computePriority(current, n.id, rootId),
    }))
    .filter(n => n.polarity !== 'neutral')
    .sort((a, b) => b.priority - a.priority)

  const polarityMap: Record<string, 'positive' | 'negative' | 'neutral'> = {}
  for (const n of adjustableNodes) {
    polarityMap[n.id] = n.polarity
  }
  for (const n of current.nodes) {
    if (!(n.id in polarityMap)) {
      polarityMap[n.id] = analyzePolarity(current, n.id, rootId)
    }
  }

  const stepSize = 0.02

  for (let iter = 0; iter < maxIterations; iter++) {
    const computed = computeStrengths(current)
    const currentRootStrength = computed.nodes.find(n => n.id === rootId)!.dialecticalStrength
    const gap = targetStrength - currentRootStrength

    if (Math.abs(gap) < epsilon) break

    for (const adjustable of adjustableNodes) {
      const node = current.nodes.find(n => n.id === adjustable.id)!
      let delta = stepSize * adjustable.priority

      if (adjustable.polarity === 'positive') {
        delta = gap > 0 ? delta : -delta
      } else {
        delta = gap > 0 ? -delta : delta
      }

      node.baseScore = Math.max(0, Math.min(1, node.baseScore + delta))
    }
  }

  let totalShift = 0
  const adjustedScores: Record<string, number> = {}
  for (const node of current.nodes) {
    const original = originalScores.get(node.id) ?? node.baseScore
    const shift = Math.abs(node.baseScore - original)
    totalShift += shift
    if (shift > 0.001) {
      adjustedScores[node.id] = node.baseScore
    }
  }

  return { adjustedScores, totalShift, polarityMap }
}

/**
 * Apply revision results back to a QBAF and recompute strengths.
 */
export function applyRevision(qbaf: PersonaQBAF, revision: RevisionResult): PersonaQBAF {
  const updatedNodes = qbaf.nodes.map(n => {
    const newScore = revision.adjustedScores[n.id]
    if (newScore !== undefined) {
      return { ...n, baseScore: newScore }
    }
    return n
  })
  return computeStrengths({ ...qbaf, nodes: updatedNodes })
}
