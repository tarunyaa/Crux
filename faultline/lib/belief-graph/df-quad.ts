// ─── DF-QuAD Semantics Engine ─────────────────────────────────
// Pure math, zero LLM calls.
// Reference: Rago et al. 2016, "Dialectical Strength Semantics for QBAFs"

import type { PersonaQBAF, QBAFNode, QBAFEdge } from './types'

/**
 * Independence-based aggregation: "at least one effective"
 * agg(s₁,...,sₙ) = 1 - Π(1 - sᵢ)
 */
export function aggregate(strengths: number[]): number {
  if (strengths.length === 0) return 0
  return 1 - strengths.reduce((prod, s) => prod * (1 - s), 1)
}

/**
 * DF-QuAD combination function.
 * Given base score τ, aggregated attack strength a, and aggregated support strength s:
 * - If a ≈ s: σ = τ
 * - If a > s: σ = τ - τ(a - s)       (attacks pull toward 0)
 * - If s > a: σ = τ + (1-τ)(s - a)   (supports pull toward 1)
 */
export function combine(baseScore: number, attackAgg: number, supportAgg: number): number {
  const diff = attackAgg - supportAgg
  if (Math.abs(diff) < 1e-9) return baseScore
  if (diff > 0) return baseScore - baseScore * diff
  return baseScore + (1 - baseScore) * (-diff)
}

/**
 * Bottom-up pass for tree-structured QBAF.
 * Computes dialectical strength σ for every node via topological sort (leaves first).
 * Returns a new PersonaQBAF with updated dialecticalStrength values.
 */
export function computeStrengths(qbaf: PersonaQBAF): PersonaQBAF {
  const nodeMap = new Map<string, QBAFNode>()
  for (const node of qbaf.nodes) {
    nodeMap.set(node.id, { ...node })
  }

  // Build adjacency: for each node, which edges target it?
  const incomingEdges = new Map<string, QBAFEdge[]>()
  for (const edge of qbaf.edges) {
    const existing = incomingEdges.get(edge.to) ?? []
    existing.push(edge)
    incomingEdges.set(edge.to, existing)
  }

  // Build children map: for each node, which nodes have edges targeting it?
  // (i.e., from → to means "from" is an attacker/supporter of "to")
  const childrenOf = new Map<string, string[]>()
  for (const edge of qbaf.edges) {
    const existing = childrenOf.get(edge.to) ?? []
    existing.push(edge.from)
    childrenOf.set(edge.to, existing)
  }

  // Topological sort: process leaves first, then parents
  const sorted = topologicalSort(qbaf.nodes.map(n => n.id), qbaf.edges)

  // Process in order (leaves first)
  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId)!
    const incoming = incomingEdges.get(nodeId) ?? []

    if (incoming.length === 0) {
      // Leaf node: σ = τ
      node.dialecticalStrength = node.baseScore
      continue
    }

    // Separate attacks and supports
    const attackStrengths: number[] = []
    const supportStrengths: number[] = []

    for (const edge of incoming) {
      const sourceNode = nodeMap.get(edge.from)!
      const effectiveStrength = sourceNode.dialecticalStrength * edge.weight
      if (edge.type === 'attack') {
        attackStrengths.push(effectiveStrength)
      } else {
        supportStrengths.push(effectiveStrength)
      }
    }

    const attackAgg = aggregate(attackStrengths)
    const supportAgg = aggregate(supportStrengths)
    node.dialecticalStrength = combine(node.baseScore, attackAgg, supportAgg)
  }

  return {
    ...qbaf,
    nodes: qbaf.nodes.map(n => nodeMap.get(n.id)!),
  }
}

/**
 * Counterfactual impact: how much does removing a node change the root's strength?
 * Returns Δσ = |σ(root_with_node) - σ(root_without_node)|
 */
export function counterfactualImpact(qbaf: PersonaQBAF, nodeId: string, rootId: string): number {
  // Compute with node
  const withNode = computeStrengths(qbaf)
  const rootWith = withNode.nodes.find(n => n.id === rootId)!.dialecticalStrength

  // Compute without node (remove node and all its edges)
  const withoutQbaf: PersonaQBAF = {
    ...qbaf,
    nodes: qbaf.nodes.filter(n => n.id !== nodeId),
    edges: qbaf.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
  }
  const withoutNode = computeStrengths(withoutQbaf)
  const rootWithout = withoutNode.nodes.find(n => n.id === rootId)?.dialecticalStrength ?? 0

  return Math.abs(rootWith - rootWithout)
}

/**
 * Topological sort for tree-structured QBAF.
 * Returns nodes ordered leaves-first (so parents are processed after children).
 */
function topologicalSort(nodeIds: string[], edges: QBAFEdge[]): string[] {
  // In our QBAF, edges go from → to (attacker/supporter → target).
  // A "leaf" has no incoming edges from other nodes (nothing attacks/supports it).
  // We want to process attackers/supporters before their targets.

  // Build in-degree based on "from" edges (how many nodes does this node attack/support?)
  // Actually, we need to process sources before targets.
  // from → to means "from" must be computed before "to"
  const outgoing = new Map<string, string[]>() // from → [to]
  const inDegree = new Map<string, number>()

  for (const id of nodeIds) {
    outgoing.set(id, [])
    inDegree.set(id, 0)
  }

  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  // BFS from nodes with 0 in-degree (leaves / pure attackers)
  const queue: string[] = []
  for (const id of nodeIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id)
    }
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)
    for (const neighbor of outgoing.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) {
        queue.push(neighbor)
      }
    }
  }

  return sorted
}
