// ─── Belief Graph Experiment Orchestrator ─────────────────────
// Async generator that yields SSE events throughout the experiment pipeline.
//
// Phase 1: Extract QBAFs for all N personas (parallel)
// Phase 2: Pairwise structural diffs (nC2 pairs, parallel)
// Phase 3: Belief revision — each persona sees all discovered contradictions, revises once
// Phase 4: Community graph from all N QBAFs
// Phase 5: Crux identification
// Phase 6: Benchmarks

import type {
  ExperimentConfig,
  ExperimentResult,
  BeliefGraphEvent,
  PersonaQBAF,
  RevisionSnapshot,
  PairwiseDiff,
} from './types'
import type { PersonaContract } from '@/lib/types'
import type { AssumptionConflict } from './worldview-types'
import { loadContract, getPersona, loadBeliefGraph, loadWorldview } from '@/lib/personas/loader'
import { extractQBAFFromBeliefGraph } from './extract-qbaf-from-beliefs'
import { determineTargetStrength, reviseBeliefs, applyRevision } from './belief-revision'
import { structuralDiff, buildCommunityGraph, identifyCruxes } from './community-graph'
import { computeBenchmarks } from './benchmarks'

const DEFAULT_CONFIG: Partial<ExperimentConfig> = {
  revisionEnabled: true,
  convergenceThreshold: 0.02,
  cruxVarianceThreshold: 0.3,
  consensusVarianceThreshold: 0.1,
}

export async function* runBeliefGraphExperiment(
  config: ExperimentConfig,
): AsyncGenerator<BeliefGraphEvent> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config } as Required<ExperimentConfig>
  const personaIds = fullConfig.personaIds

  yield { type: 'experiment_start', topic: fullConfig.topic, personas: personaIds }

  // Load persona data
  const personas = await Promise.all(personaIds.map(id => getPersona(id)))
  const contracts = await Promise.all(personaIds.map(id => loadContract(id)))

  const missingPersonas = personaIds.filter((_, i) => !personas[i])
  if (missingPersonas.length > 0) {
    yield { type: 'error', error: `Could not load personas: ${missingPersonas.join(', ')}` }
    return
  }

  // Load belief graphs (Stage 1 output)
  const beliefGraphs = await Promise.all(personaIds.map(id => loadBeliefGraph(id)))
  const missingGraphs = personaIds.filter((_, i) => !beliefGraphs[i])
  if (missingGraphs.length > 0) {
    yield { type: 'error', error: `Missing belief graphs for: ${missingGraphs.join(', ')}. Run Stage 1 first: npx tsx scripts/extract-beliefs.ts` }
    return
  }

  // Load worldview data (Stage 1.5 output, optional)
  const worldviews = await Promise.all(personaIds.map(id => loadWorldview(id)))
  const worldviewCount = worldviews.filter(w => w !== null).length
  if (worldviewCount > 0) {
    console.log(`  Loaded worldview data for ${worldviewCount}/${personaIds.length} personas`)
  }

  // Load assumption conflicts if available
  let assumptionConflicts: AssumptionConflict[] = []
  try {
    const fsModule = await import('fs/promises')
    const pathModule = await import('path')
    const conflictsPath = pathModule.join(process.cwd(), 'data', 'seed', 'worldviews', '_conflicts.json')
    const raw = await fsModule.readFile(conflictsPath, 'utf-8')
    assumptionConflicts = JSON.parse(raw)
    console.log(`  Loaded ${assumptionConflicts.length} assumption conflicts`)
  } catch {
    // No conflicts file — that's fine, will fall back to surface-level crux descriptions
  }

  // ─── Phase 1: Extract QBAFs from Belief Graphs (parallel) ──

  const qbafs: Record<string, PersonaQBAF> = {}
  for (const pid of personaIds) {
    yield { type: 'extraction_start', personaId: pid }
  }

  const extractedQBAFs = await Promise.all(
    personaIds.map((pid, i) => extractQBAFFromBeliefGraph(pid, beliefGraphs[i]!, fullConfig.topic, worldviews[i]))
  )

  for (let i = 0; i < personaIds.length; i++) {
    qbafs[personaIds[i]] = extractedQBAFs[i]
    yield { type: 'extraction_complete', personaId: personaIds[i], qbaf: extractedQBAFs[i] }
  }

  // Store initial state
  const initialSnapshots: Record<string, PersonaQBAF> = {}
  for (const pid of personaIds) {
    initialSnapshots[pid] = deepCopyQBAF(qbafs[pid])
  }

  // ─── Phase 2: Pairwise Structural Diffs (nC2 pairs) ────────

  const pairs: Array<[string, string]> = []
  for (let i = 0; i < personaIds.length; i++) {
    for (let j = i + 1; j < personaIds.length; j++) {
      pairs.push([personaIds[i], personaIds[j]])
    }
  }

  for (const [pidA, pidB] of pairs) {
    yield { type: 'diff_start', personaA: pidA, personaB: pidB }
  }

  const diffs: PairwiseDiff[] = await Promise.all(
    pairs.map(([pidA, pidB]) => structuralDiff(qbafs[pidA], qbafs[pidB]))
  )

  for (const diff of diffs) {
    yield { type: 'diff_complete', diff }
  }

  // ─── Phase 3: Belief Revision ──────────────────────────────

  const revisions: RevisionSnapshot[] = []

  if (fullConfig.revisionEnabled) {
    for (let i = 0; i < personaIds.length; i++) {
      const pid = personaIds[i]
      const contract = contracts[i]

      // Collect all contradictions from diffs involving this persona
      const contradictionClaims: string[] = []
      for (const diff of diffs) {
        if (diff.personaA === pid) {
          // This persona's claims were compared — contradictions come from personaB's perspective
          for (const c of diff.contradictions) {
            const opponentNode = qbafs[diff.personaB]?.nodes.find(n => n.id === c.nodeIdB)
            if (opponentNode) contradictionClaims.push(opponentNode.claim)
          }
        } else if (diff.personaB === pid) {
          for (const c of diff.contradictions) {
            const opponentNode = qbafs[diff.personaA]?.nodes.find(n => n.id === c.nodeIdA)
            if (opponentNode) contradictionClaims.push(opponentNode.claim)
          }
        }
      }

      if (contradictionClaims.length === 0) {
        revisions.push({
          personaId: pid,
          preRootStrength: getRootStrength(qbafs[pid]),
          postRootStrength: getRootStrength(qbafs[pid]),
          cost: 0,
          R: 0,
          reasoning: 'No contradictions discovered',
        })
        yield {
          type: 'revision_complete',
          personaId: pid,
          rootStrength: getRootStrength(qbafs[pid]),
          revisionCost: 0,
          R: 0,
          reasoning: 'No contradictions discovered',
        }
        continue
      }

      const preStrength = getRootStrength(qbafs[pid])
      const personaName = personas[i]!.name
      const { target, R, reasoning } = await determineTargetStrength(
        qbafs[pid], contradictionClaims, personaName, contract,
      )
      const revision = reviseBeliefs(qbafs[pid], target)
      qbafs[pid] = applyRevision(qbafs[pid], revision)
      const postStrength = getRootStrength(qbafs[pid])

      revisions.push({
        personaId: pid,
        preRootStrength: preStrength,
        postRootStrength: postStrength,
        cost: revision.totalShift,
        R,
        reasoning,
      })

      yield {
        type: 'revision_complete',
        personaId: pid,
        rootStrength: postStrength,
        revisionCost: revision.totalShift,
        R,
        reasoning,
        adjustedScores: revision.adjustedScores,
      }
    }
  }

  // ─── Phase 4: Community Graph ──────────────────────────────

  const qbafArray = personaIds.map(pid => qbafs[pid])
  const communityGraph = await buildCommunityGraph(
    qbafArray,
    fullConfig.cruxVarianceThreshold,
    fullConfig.consensusVarianceThreshold,
  )
  yield { type: 'community_graph_built', graph: communityGraph }

  // ─── Phase 5: Crux Identification ─────────────────────────

  const cruxes = await identifyCruxes(communityGraph, qbafArray, 5, assumptionConflicts)
  yield { type: 'cruxes_identified', cruxes }

  // ─── Phase 6: Benchmarks ──────────────────────────────────

  const finalSnapshots: Record<string, PersonaQBAF> = {}
  for (const pid of personaIds) {
    finalSnapshots[pid] = qbafs[pid]
  }
  const benchmarks = await computeBenchmarks(initialSnapshots, finalSnapshots, revisions, communityGraph, cruxes)
  yield { type: 'benchmarks_computed', benchmarks }

  // ─── Final Result ──────────────────────────────────────────

  const result: ExperimentResult = {
    config: fullConfig,
    diffs,
    revisions,
    communityGraph,
    cruxes,
    benchmarks,
    timestamp: new Date().toISOString(),
  }

  yield { type: 'experiment_complete', result }
}

function getRootStrength(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0
}

function deepCopyQBAF(qbaf: PersonaQBAF): PersonaQBAF {
  return JSON.parse(JSON.stringify(qbaf))
}
