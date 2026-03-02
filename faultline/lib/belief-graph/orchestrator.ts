// ─── Belief Graph Experiment Orchestrator ─────────────────────
// Async generator that yields SSE events throughout the experiment pipeline.
//
// Phase 1: Extract QBAFs from belief graphs (Stage 2)
// Phase 2: Debate rounds (attack/support + CE-QArg revision)
// Phase 3: Community graph + crux identification
// Phase 4: Benchmarks (CIG-compatible)

import type {
  ExperimentConfig,
  ExperimentResult,
  BeliefGraphEvent,
  PersonaQBAF,
  RoundSnapshot,
} from './types'
import type { PersonaContract } from '@/lib/types'
import { loadContract, getPersona, loadBeliefGraph } from '@/lib/personas/loader'
import { extractQBAFFromBeliefGraph } from './extract-qbaf-from-beliefs'
import { runDebateRound } from './debate-round'
import { determineTargetStrength, reviseBeliefs, applyRevision } from './belief-revision'
import { buildCommunityGraph, identifyCruxes } from './community-graph'
import { computeBenchmarks } from './benchmarks'
import { counterfactualImpact } from './df-quad'

const DEFAULT_CONFIG: Partial<ExperimentConfig> = {
  maxRounds: 5,
  convergenceThreshold: 0.02,
  cruxVarianceThreshold: 0.3,
  consensusVarianceThreshold: 0.1,
}

export async function* runBeliefGraphExperiment(
  config: ExperimentConfig,
): AsyncGenerator<BeliefGraphEvent> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config } as Required<ExperimentConfig>
  const [pidA, pidB] = fullConfig.personaIds

  yield { type: 'experiment_start', topic: fullConfig.topic, personas: fullConfig.personaIds }

  // Load persona data
  const [personaA, personaB] = await Promise.all([getPersona(pidA), getPersona(pidB)])
  const [contractA, contractB] = await Promise.all([loadContract(pidA), loadContract(pidB)])

  if (!personaA || !personaB) {
    yield { type: 'error', error: `Could not load personas: ${pidA}, ${pidB}` }
    return
  }

  // Load belief graphs (Stage 1 output)
  const [bgA, bgB] = await Promise.all([loadBeliefGraph(pidA), loadBeliefGraph(pidB)])

  if (!bgA || !bgB) {
    yield { type: 'error', error: `Missing belief graphs. Run Stage 1 first: npx tsx scripts/extract-beliefs.ts` }
    return
  }

  // ─── Phase 1: Extract QBAFs from Belief Graphs ───────────

  yield { type: 'extraction_start', personaId: pidA }
  let qbafA = await extractQBAFFromBeliefGraph(pidA, bgA, fullConfig.topic)
  yield { type: 'extraction_complete', personaId: pidA, qbaf: qbafA }

  yield { type: 'extraction_start', personaId: pidB }
  let qbafB = await extractQBAFFromBeliefGraph(pidB, bgB, fullConfig.topic)
  yield { type: 'extraction_complete', personaId: pidB, qbaf: qbafB }

  // Store initial state
  const initialA = deepCopyQBAF(qbafA)
  const initialB = deepCopyQBAF(qbafB)
  const initialSnapshots: Record<string, PersonaQBAF> = { [pidA]: initialA, [pidB]: initialB }

  const rounds: RoundSnapshot[] = []
  let converged = false

  // Initial snapshot (round 0)
  rounds.push({
    round: 0,
    qbafs: { [pidA]: deepCopyQBAF(qbafA), [pidB]: deepCopyQBAF(qbafB) },
    rootStrengths: {
      [pidA]: getRootStrength(qbafA),
      [pidB]: getRootStrength(qbafB),
    },
    revisionCosts: { [pidA]: 0, [pidB]: 0 },
  })

  // ─── Phase 2: Debate Rounds ────────────────────────────────

  for (let round = 1; round <= fullConfig.maxRounds; round++) {
    yield { type: 'round_start', round }

    const prevRootA = getRootStrength(qbafA)
    const prevRootB = getRootStrength(qbafB)

    // Run debate round: personas generate attacks/supports on opponent's graph
    const roundResult = await runDebateRound(
      qbafA, qbafB, personaA, personaB, contractA, contractB, round,
    )

    qbafA = roundResult.qbafA
    qbafB = roundResult.qbafB

    yield { type: 'debate_moves', round, personaId: pidA, newNodes: roundResult.newNodesA, newEdges: roundResult.newNodesA }
    yield { type: 'debate_moves', round, personaId: pidB, newNodes: roundResult.newNodesB, newEdges: roundResult.newNodesB }

    // Belief revision for both personas (Stage 7: persona-modulated)
    const [revisionA, revisionB] = await Promise.all([
      runRevision(qbafA, personaA.name, contractA),
      runRevision(qbafB, personaB.name, contractB),
    ])

    qbafA = revisionA.qbaf
    qbafB = revisionB.qbaf

    yield { type: 'revision_complete', round, personaId: pidA, rootStrength: getRootStrength(qbafA), revisionCost: revisionA.cost, R: revisionA.R, reasoning: revisionA.reasoning }
    yield { type: 'revision_complete', round, personaId: pidB, rootStrength: getRootStrength(qbafB), revisionCost: revisionB.cost, R: revisionB.R, reasoning: revisionB.reasoning }

    const snapshot: RoundSnapshot = {
      round,
      qbafs: { [pidA]: deepCopyQBAF(qbafA), [pidB]: deepCopyQBAF(qbafB) },
      rootStrengths: { [pidA]: getRootStrength(qbafA), [pidB]: getRootStrength(qbafB) },
      revisionCosts: { [pidA]: revisionA.cost, [pidB]: revisionB.cost },
    }
    rounds.push(snapshot)

    yield { type: 'round_complete', round, snapshot }

    // Convergence check
    const deltaA = Math.abs(getRootStrength(qbafA) - prevRootA)
    const deltaB = Math.abs(getRootStrength(qbafB) - prevRootB)
    const deltas = { [pidA]: deltaA, [pidB]: deltaB }
    converged = deltaA < fullConfig.convergenceThreshold && deltaB < fullConfig.convergenceThreshold

    yield { type: 'convergence_check', round, converged, deltas }

    if (converged) break
  }

  // ─── Phase 3: Community Graph ──────────────────────────────

  const communityGraph = await buildCommunityGraph(
    qbafA, qbafB,
    fullConfig.cruxVarianceThreshold,
    fullConfig.consensusVarianceThreshold,
  )
  yield { type: 'community_graph_built', graph: communityGraph }

  // ─── Phase 4: Crux Identification ─────────────────────────

  const cruxes = await identifyCruxes(communityGraph, qbafA, qbafB)
  yield { type: 'cruxes_identified', cruxes }

  // ─── Phase 5: Benchmarks ──────────────────────────────────

  const finalSnapshots: Record<string, PersonaQBAF> = { [pidA]: qbafA, [pidB]: qbafB }
  const benchmarks = await computeBenchmarks(initialSnapshots, finalSnapshots, rounds, communityGraph, cruxes)
  yield { type: 'benchmarks_computed', benchmarks }

  // ─── Final Result ──────────────────────────────────────────

  const result: ExperimentResult = {
    config: fullConfig,
    rounds,
    communityGraph,
    cruxes,
    benchmarks,
    totalRounds: rounds.length - 1, // exclude initial snapshot
    converged,
    timestamp: new Date().toISOString(),
  }

  yield { type: 'experiment_complete', result }
}

async function runRevision(
  qbaf: PersonaQBAF,
  personaName: string,
  contract: PersonaContract,
): Promise<{ qbaf: PersonaQBAF; cost: number; R: number; reasoning: string }> {
  // Find new attacks this round (nodes from opponent)
  const opponentNodes = qbaf.nodes.filter(n => n.personaId !== qbaf.personaId)
  const newAttackClaims = opponentNodes.map(n => n.claim)

  if (newAttackClaims.length === 0) {
    return { qbaf, cost: 0, R: 0, reasoning: 'No attacks received' }
  }

  const { target, R, reasoning } = await determineTargetStrength(qbaf, newAttackClaims, personaName, contract)
  const revision = reviseBeliefs(qbaf, target)
  const revised = applyRevision(qbaf, revision)

  return { qbaf: revised, cost: revision.totalShift, R, reasoning }
}

function getRootStrength(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0
}

function deepCopyQBAF(qbaf: PersonaQBAF): PersonaQBAF {
  return JSON.parse(JSON.stringify(qbaf))
}
