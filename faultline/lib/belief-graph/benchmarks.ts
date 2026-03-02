// ─── Belief Graph Experiment Benchmarks ───────────────────────
// Graph-native metrics + CIG-compatible metrics adapted for belief graphs.
//
// Graph-native: RSD, BRC, CLR, GGR, CS (purely structural)
// CIG-adapted: ΔSD, DFS (uses Haiku judge on crux counterfactuals)

import type {
  BenchmarkMetrics,
  PersonaQBAF,
  RoundSnapshot,
  CommunityGraph,
  StructuralCrux,
} from './types'
import { counterfactualImpact } from './df-quad'
import { scoreDFS } from '@/lib/benchmark/cig-scoring'

/**
 * Compute all benchmark metrics from experiment data.
 */
export async function computeBenchmarks(
  initialSnapshots: Record<string, PersonaQBAF>,
  finalSnapshots: Record<string, PersonaQBAF>,
  rounds: RoundSnapshot[],
  communityGraph: CommunityGraph,
  cruxes: StructuralCrux[],
): Promise<BenchmarkMetrics> {
  const personaIds = Object.keys(initialSnapshots)

  // 1. Root Strength Delta: |σ_final(root) - σ_initial(root)|
  const rootStrengthDelta: Record<string, number> = {}
  for (const pid of personaIds) {
    const initial = initialSnapshots[pid]
    const final_ = finalSnapshots[pid]
    const σ_initial = initial.nodes.find(n => n.id === initial.rootClaim)?.dialecticalStrength ?? 0
    const σ_final = final_.nodes.find(n => n.id === final_.rootClaim)?.dialecticalStrength ?? 0
    rootStrengthDelta[pid] = Math.abs(σ_final - σ_initial)
  }

  // 2. Stance Divergence (ΔSD): change in |σA - σB|
  const initialRootStrengths = personaIds.map(pid => {
    const q = initialSnapshots[pid]
    return q.nodes.find(n => n.id === q.rootClaim)?.dialecticalStrength ?? 0
  })
  const finalRootStrengths = personaIds.map(pid => {
    const q = finalSnapshots[pid]
    return q.nodes.find(n => n.id === q.rootClaim)?.dialecticalStrength ?? 0
  })
  const stanceDivergence = stdDev(finalRootStrengths) - stdDev(initialRootStrengths)

  // 3. Belief Revision Cost: total Σ|Δτ| / |nodes| per persona
  const beliefRevisionCost: Record<string, number> = {}
  for (const pid of personaIds) {
    const totalCost = rounds.reduce((sum, r) => sum + (r.revisionCosts[pid] ?? 0), 0)
    const nodeCount = finalSnapshots[pid].nodes.length
    beliefRevisionCost[pid] = nodeCount > 0 ? totalCost / nodeCount : 0
  }

  // 4. Crux Localization Rate: % of community nodes classified as crux
  const totalCommunityNodes = communityGraph.nodes.length
  const cruxNodeCount = communityGraph.cruxNodes.length
  const cruxLocalizationRate = totalCommunityNodes > 0
    ? cruxNodeCount / totalCommunityNodes
    : 0

  // 5. Argument Coverage: |community_nodes| / (2 × avg |initial_nodes|)
  const initialNodeCounts = personaIds.map(pid => initialSnapshots[pid].nodes.length)
  const avgInitial = initialNodeCounts.reduce((s, c) => s + c, 0) / initialNodeCounts.length
  const argumentCoverage = avgInitial > 0
    ? communityGraph.nodes.length / (2 * avgInitial)
    : 0

  // 6. Graph Growth Rate: |final_nodes| / |initial_nodes| per persona
  const graphGrowthRate: Record<string, number> = {}
  for (const pid of personaIds) {
    const initialCount = initialSnapshots[pid].nodes.length
    const finalCount = finalSnapshots[pid].nodes.length
    graphGrowthRate[pid] = initialCount > 0 ? finalCount / initialCount : 1
  }

  // 7. Counterfactual Sensitivity: for top crux, |Δσ(root)| when crux node removed
  let counterfactualSensitivity = 0
  if (cruxes.length > 0) {
    const topCrux = cruxes[0]
    for (const pid of personaIds) {
      const qbaf = finalSnapshots[pid]
      const commNode = communityGraph.nodes.find(n => n.id === topCrux.nodeId)
      if (!commNode) continue
      for (const sourceId of commNode.mergedFrom) {
        if (qbaf.nodes.some(n => n.id === sourceId)) {
          const impact = counterfactualImpact(qbaf, sourceId, qbaf.rootClaim)
          counterfactualSensitivity = Math.max(counterfactualSensitivity, impact)
        }
      }
    }
  }

  // 8. Decision Flip Score (CIG): does flipping the top crux change conclusions?
  let decisionFlipScore: { flipped: boolean; explanation: string } | null = null
  if (cruxes.length > 0) {
    const topCrux = cruxes[0]
    // Build a summary of the debate positions for DFS
    const positionSummary = personaIds.map(pid => {
      const qbaf = finalSnapshots[pid]
      const root = qbaf.nodes.find(n => n.id === qbaf.rootClaim)
      return `${pid}: "${root?.claim}" (σ = ${root?.dialecticalStrength.toFixed(3)})`
    }).join('\n')
    decisionFlipScore = await scoreDFS(positionSummary, topCrux.claim)
  }

  // 9. Convergence rate: rounds until Δσ < threshold (or max)
  let convergenceRound: number | null = null
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1]
    const curr = rounds[i]
    const allSmall = personaIds.every(pid =>
      Math.abs((curr.rootStrengths[pid] ?? 0) - (prev.rootStrengths[pid] ?? 0)) < 0.02
    )
    if (allSmall) {
      convergenceRound = curr.round
      break
    }
  }

  return {
    rootStrengthDelta,
    stanceDivergence,
    beliefRevisionCost,
    cruxLocalizationRate,
    argumentCoverage,
    graphGrowthRate,
    counterfactualSensitivity,
    decisionFlipScore,
    convergenceRound,
  }
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}
