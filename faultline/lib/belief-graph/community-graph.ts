// ─── Community Graph Construction ─────────────────────────────
// Merge two persona QBAFs into a single community graph.
// Identifies: semantic overlaps, opposing claims, and structural cruxes.
//
// Key insight: cruxes aren't just nodes with high base score variance.
// The real disagreement is often structural — personas argue about the
// same phenomena but with opposite conclusions. We detect both.

import type {
  PersonaQBAF,
  QBAFEdge,
  CommunityNode,
  CommunityGraph,
  StructuralCrux,
  PersonaCruxPosition,
} from './types'
import { completeJSON, complete } from '@/lib/llm/client'
import { counterfactualImpact } from './df-quad'

interface ClaimMapping {
  nodeIdA: string
  nodeIdB: string
  relationship: 'agreement' | 'opposition' | 'related'
  confidence: number
  sharedTopic: string  // what phenomena both claims are about
}

interface BatchComparisonResponse {
  mappings: Array<{
    indexA: number
    indexB: number
    relationship: 'agreement' | 'opposition' | 'related'
    confidence: number
    sharedTopic: string
  }>
}

/**
 * Batch comparison: send all claims from both QBAFs to a single Haiku call.
 * Returns pairs that are semantically related — including opposing claims.
 */
async function batchCompareQBAFs(
  qbafA: PersonaQBAF,
  qbafB: PersonaQBAF,
): Promise<ClaimMapping[]> {
  const claimsA = qbafA.nodes.map((n, i) => `A[${i}] "${n.claim}"`).join('\n')
  const claimsB = qbafB.nodes.map((n, i) => `B[${i}] "${n.claim}"`).join('\n')

  const response = await completeJSON<BatchComparisonResponse>({
    system: `You identify relationships between claims from two debate positions. Find pairs that discuss the same topic — whether they agree, oppose each other, or are related. Be thorough — most debate positions will have multiple points of contact.`,
    messages: [{
      role: 'user',
      content: `Persona A's claims:
${claimsA}

Persona B's claims:
${claimsB}

Find ALL pairs where a claim from A and a claim from B discuss the same phenomenon, even if they reach opposite conclusions. Classify each pair:
- "agreement": both claims say roughly the same thing
- "opposition": both discuss the same topic but reach opposite conclusions or make contradictory claims
- "related": both discuss the same general area but make different (non-contradictory) points

Return pairs with confidence > 0.5 only.

Respond in JSON:
{
  "mappings": [
    { "indexA": 0, "indexB": 0, "relationship": "opposition", "confidence": 0.9, "sharedTopic": "what they're both talking about" }
  ]
}`
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 4096,
  })

  return response.mappings
    .filter(m => m.indexA < qbafA.nodes.length && m.indexB < qbafB.nodes.length)
    .map(m => ({
      nodeIdA: qbafA.nodes[m.indexA].id,
      nodeIdB: qbafB.nodes[m.indexB].id,
      relationship: m.relationship,
      confidence: m.confidence,
      sharedTopic: m.sharedTopic,
    }))
}

/**
 * Build community graph from two persona QBAFs.
 *
 * Approach:
 * 1. Batch-compare all claims to find agreements, oppositions, and related pairs
 * 2. Merge agreements into single community nodes
 * 3. Mark oppositions as crux candidates (high disagreement signal)
 * 4. Classify by structural role + disagreement type
 */
export async function buildCommunityGraph(
  qbafA: PersonaQBAF,
  qbafB: PersonaQBAF,
  cruxThreshold: number = 0.3,
  consensusThreshold: number = 0.1,
): Promise<CommunityGraph> {
  // Step 1: Batch comparison
  const mappings = await batchCompareQBAFs(qbafA, qbafB)

  const merges: Array<{
    communityId: string
    sourceIds: string[]
    claim: string
    baseScores: Record<string, number>
    relationship: 'agreement' | 'opposition' | 'related'
    sharedTopic: string
    confidence: number
  }> = []

  const matchedA = new Set<string>()
  const matchedB = new Set<string>()

  const nodeMapA = new Map(qbafA.nodes.map(n => [n.id, n]))
  const nodeMapB = new Map(qbafB.nodes.map(n => [n.id, n]))

  // Sort by confidence, process best matches first
  mappings.sort((a, b) => b.confidence - a.confidence)

  for (const mapping of mappings) {
    if (matchedA.has(mapping.nodeIdA) || matchedB.has(mapping.nodeIdB)) continue

    const nodeA = nodeMapA.get(mapping.nodeIdA)
    const nodeB = nodeMapB.get(mapping.nodeIdB)
    if (!nodeA || !nodeB) continue

    const communityId = `c-${merges.length}`

    // For agreements, merge into one node
    // For oppositions/related, still merge but mark the relationship
    merges.push({
      communityId,
      sourceIds: [nodeA.id, nodeB.id],
      claim: mapping.relationship === 'agreement'
        ? nodeA.claim
        : `[${mapping.sharedTopic}] ${nodeA.claim} vs. ${nodeB.claim}`,
      baseScores: {
        [qbafA.personaId]: nodeA.baseScore,
        [qbafB.personaId]: nodeB.baseScore,
      },
      relationship: mapping.relationship,
      sharedTopic: mapping.sharedTopic,
      confidence: mapping.confidence,
    })

    matchedA.add(mapping.nodeIdA)
    matchedB.add(mapping.nodeIdB)
  }

  // Add unmatched nodes as persona-specific
  for (const nodeA of qbafA.nodes) {
    if (matchedA.has(nodeA.id)) continue
    merges.push({
      communityId: `c-${merges.length}`,
      sourceIds: [nodeA.id],
      claim: nodeA.claim,
      baseScores: { [qbafA.personaId]: nodeA.baseScore },
      relationship: 'related',
      sharedTopic: '',
      confidence: 0,
    })
  }

  for (const nodeB of qbafB.nodes) {
    if (matchedB.has(nodeB.id)) continue
    merges.push({
      communityId: `c-${merges.length}`,
      sourceIds: [nodeB.id],
      claim: nodeB.claim,
      baseScores: { [qbafB.personaId]: nodeB.baseScore },
      relationship: 'related',
      sharedTopic: '',
      confidence: 0,
    })
  }

  // Build node ID remapping
  const sourceToComm = new Map<string, string>()
  for (const merge of merges) {
    for (const sourceId of merge.sourceIds) {
      sourceToComm.set(sourceId, merge.communityId)
    }
  }

  // Remap edges
  const allEdges = [...qbafA.edges, ...qbafB.edges]
  const seenEdges = new Set<string>()
  const communityEdges: QBAFEdge[] = []

  for (const edge of allEdges) {
    const fromComm = sourceToComm.get(edge.from)
    const toComm = sourceToComm.get(edge.to)
    if (!fromComm || !toComm) continue
    if (fromComm === toComm) continue

    const edgeKey = `${fromComm}->${toComm}-${edge.type}`
    if (seenEdges.has(edgeKey)) continue
    seenEdges.add(edgeKey)

    communityEdges.push({
      id: `ce-${communityEdges.length}`,
      from: fromComm,
      to: toComm,
      type: edge.type,
      weight: edge.weight,
    })
  }

  // Classify nodes
  const communityNodes: CommunityNode[] = merges.map(merge => {
    const scores = Object.values(merge.baseScores)
    const variance = scores.length >= 2 ? computeVariance(scores) : 0

    let classification: 'consensus' | 'crux' | 'neutral' = 'neutral'
    if (merge.sourceIds.length >= 2) {
      if (merge.relationship === 'opposition') {
        // Opposing claims are always crux candidates
        classification = 'crux'
      } else if (merge.relationship === 'agreement') {
        classification = variance < consensusThreshold ? 'consensus' : 'neutral'
      } else {
        // Related: use variance threshold
        if (variance > cruxThreshold) classification = 'crux'
        else if (variance < consensusThreshold) classification = 'consensus'
      }
    }

    return {
      id: merge.communityId,
      claim: merge.claim,
      mergedFrom: merge.sourceIds,
      baseScores: merge.baseScores,
      communityStrength: 0,
      variance,
      classification,
    }
  })

  const cruxNodes = communityNodes.filter(n => n.classification === 'crux').map(n => n.id)
  const consensusNodes = communityNodes.filter(n => n.classification === 'consensus').map(n => n.id)

  return {
    topic: qbafA.topic,
    personas: [qbafA.personaId, qbafB.personaId],
    nodes: communityNodes,
    edges: communityEdges,
    cruxNodes,
    consensusNodes,
  }
}

/**
 * Identify structural cruxes from the community graph.
 * Uses counterfactual impact + opposition detection.
 */
export async function identifyCruxes(
  communityGraph: CommunityGraph,
  qbafA: PersonaQBAF,
  qbafB: PersonaQBAF,
  topK: number = 5,
): Promise<StructuralCrux[]> {
  const cruxCandidates: StructuralCrux[] = []

  for (const node of communityGraph.nodes) {
    if (node.classification !== 'crux') continue

    // Compute counterfactual impact on each persona's root
    const impactA = computePersonaImpact(qbafA, node.mergedFrom)
    const impactB = computePersonaImpact(qbafB, node.mergedFrom)
    const cruxScore = Math.abs(impactA - impactB) + (node.mergedFrom.length >= 2 ? 0.1 : 0)

    const scores = Object.values(node.baseScores)
    const hasBaseScoreDiff = scores.length >= 2 && computeVariance(scores) > 0.05
    const hasEdgeDiff = Math.abs(impactA - impactB) > 0.01
    const disagreementType: 'base_score' | 'edge_structure' | 'both' =
      hasBaseScoreDiff && hasEdgeDiff ? 'both' :
      hasBaseScoreDiff ? 'base_score' : 'edge_structure'

    const personaPositions: Record<string, PersonaCruxPosition> = {}
    for (const personaId of communityGraph.personas) {
      const qbaf = personaId === qbafA.personaId ? qbafA : qbafB
      const impact = personaId === qbafA.personaId ? impactA : impactB
      personaPositions[personaId] = {
        baseScore: node.baseScores[personaId] ?? 0.5,
        dialecticalStrength: findNodeStrength(qbaf, node.mergedFrom),
        contribution: impact,
      }
    }

    cruxCandidates.push({
      id: `crux-${node.id}`,
      nodeId: node.id,
      claim: node.claim,
      cruxScore,
      disagreementType,
      personaPositions,
      counterfactual: '',
      settlingQuestion: '',
    })
  }

  // Sort by crux score and take top K
  cruxCandidates.sort((a, b) => b.cruxScore - a.cruxScore)
  const topCruxes = cruxCandidates.slice(0, topK)

  // Generate settling questions via LLM
  for (const crux of topCruxes) {
    const positions = Object.entries(crux.personaPositions)
    const [pA, posA] = positions[0]
    const [pB, posB] = positions[1] ?? [null, null]

    crux.counterfactual = posB
      ? `${pA} (σ=${posA.dialecticalStrength.toFixed(2)}, impact=${posA.contribution.toFixed(3)}) vs ${pB} (σ=${posB.dialecticalStrength.toFixed(2)}, impact=${posB.contribution.toFixed(3)})`
      : `Removing this node changes ${pA}'s root by ${posA.contribution.toFixed(3)}`

    const questionResponse = await complete({
      system: 'Generate a precise, evidence-answerable question that would resolve this disagreement. Respond with just the question.',
      messages: [{
        role: 'user',
        content: `Two debaters disagree about: "${crux.claim}"

${positions.map(([pid, pos]) => `${pid}: base score ${pos.baseScore.toFixed(2)}, dialectical strength ${pos.dialecticalStrength.toFixed(2)}`).join('\n')}

What specific question would settle this?`
      }],
      model: 'haiku',
      temperature: 0.3,
      maxTokens: 256,
    })

    crux.settlingQuestion = questionResponse.trim()
  }

  return topCruxes
}

function computePersonaImpact(qbaf: PersonaQBAF, nodeIds: string[]): number {
  let totalImpact = 0
  for (const nodeId of nodeIds) {
    if (qbaf.nodes.some(n => n.id === nodeId)) {
      totalImpact += counterfactualImpact(qbaf, nodeId, qbaf.rootClaim)
    }
  }
  return totalImpact
}

function findNodeStrength(qbaf: PersonaQBAF, nodeIds: string[]): number {
  for (const nodeId of nodeIds) {
    const node = qbaf.nodes.find(n => n.id === nodeId)
    if (node) return node.dialecticalStrength
  }
  return 0
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
}
