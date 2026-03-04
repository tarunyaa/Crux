// ─── Community Graph Construction ─────────────────────────────
// Merge N persona QBAFs into a single community graph.
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
  ClaimMapping,
  PairwiseDiff,
} from './types'
import type { AssumptionConflict } from './worldview-types'
import { completeJSON, complete } from '@/lib/llm/client'
import { counterfactualImpact, gradientSign } from './df-quad'

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
export async function batchCompareQBAFs(
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
 * Compute a pairwise structural diff between two QBAFs.
 * Wraps batchCompareQBAFs and identifies unmatched nodes.
 */
export async function structuralDiff(
  qbafA: PersonaQBAF,
  qbafB: PersonaQBAF,
): Promise<PairwiseDiff> {
  const mappings = await batchCompareQBAFs(qbafA, qbafB)

  const matchedA = new Set(mappings.map(m => m.nodeIdA))
  const matchedB = new Set(mappings.map(m => m.nodeIdB))

  const gaps: string[] = [
    ...qbafA.nodes.filter(n => !matchedA.has(n.id)).map(n => n.id),
    ...qbafB.nodes.filter(n => !matchedB.has(n.id)).map(n => n.id),
  ]

  return {
    personaA: qbafA.personaId,
    personaB: qbafB.personaId,
    contradictions: mappings.filter(m => m.relationship === 'opposition'),
    agreements: mappings.filter(m => m.relationship === 'agreement'),
    gaps,
  }
}

/**
 * Build community graph from N persona QBAFs.
 *
 * Approach:
 * 1. Run batchCompareQBAFs for all nC2 pairs
 * 2. Union-find merge: if A1↔B3 and B3↔C2, they become one community node
 * 3. Add unmatched nodes as persona-specific
 * 4. Classify by variance across all N personas' base scores
 */
export async function buildCommunityGraph(
  qbafs: PersonaQBAF[],
  cruxThreshold: number = 0.3,
  consensusThreshold: number = 0.1,
): Promise<CommunityGraph> {
  // Step 1: Pairwise comparisons for all nC2 pairs
  const allMappings: Array<{ mapping: ClaimMapping; pidA: string; pidB: string }> = []

  const pairs: Array<[number, number]> = []
  for (let i = 0; i < qbafs.length; i++) {
    for (let j = i + 1; j < qbafs.length; j++) {
      pairs.push([i, j])
    }
  }

  const pairResults = await Promise.all(
    pairs.map(([i, j]) => batchCompareQBAFs(qbafs[i], qbafs[j]))
  )

  for (let p = 0; p < pairs.length; p++) {
    const [i, j] = pairs[p]
    for (const mapping of pairResults[p]) {
      allMappings.push({
        mapping,
        pidA: qbafs[i].personaId,
        pidB: qbafs[j].personaId,
      })
    }
  }

  // Step 2: Union-find to merge equivalent nodes across personas
  const MAX_GROUP_SIZE = 5

  const parent = new Map<string, string>()
  const size = new Map<string, number>()

  function find(x: string): string {
    if (!parent.has(x)) {
      parent.set(x, x)
      size.set(x, 1)
    }
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression
    let curr = x
    while (curr !== root) {
      const next = parent.get(curr)!
      parent.set(curr, root)
      curr = next
    }
    return root
  }
  function groupSize(x: string): number {
    return size.get(find(x)) ?? 1
  }
  function union(a: string, b: string): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) {
      // Merge smaller into larger
      const sa = size.get(ra) ?? 1
      const sb = size.get(rb) ?? 1
      if (sa >= sb) {
        parent.set(rb, ra)
        size.set(ra, sa + sb)
      } else {
        parent.set(ra, rb)
        size.set(rb, sa + sb)
      }
    }
  }

  // Sort by confidence, process best matches first
  allMappings.sort((a, b) => b.mapping.confidence - a.mapping.confidence)

  // Build a depth lookup for root-guard during merging
  const nodeDepth = new Map<string, number>()
  for (const qbaf of qbafs) {
    for (const node of qbaf.nodes) {
      nodeDepth.set(node.id, node.depth)
    }
  }

  // Track relationships between merged groups
  const groupRelationships = new Map<string, 'agreement' | 'opposition' | 'related'>()
  // Track best sharedTopic per group root (highest confidence)
  const groupTopics = new Map<string, { topic: string; confidence: number }>()

  for (const { mapping } of allMappings) {
    // Never merge root nodes — they are the objects of comparison, not candidates for equivalence
    // Reference: arxiv 2510.24303 Algorithm 1 — layer-by-layer clustering exempts roots
    if (nodeDepth.get(mapping.nodeIdA) === 0 || nodeDepth.get(mapping.nodeIdB) === 0) continue

    // Cap group size to prevent mega-groups
    if (groupSize(mapping.nodeIdA) + groupSize(mapping.nodeIdB) > MAX_GROUP_SIZE) continue

    union(mapping.nodeIdA, mapping.nodeIdB)

    const groupKey = find(mapping.nodeIdA)
    // Keep the strongest relationship signal (opposition > related > agreement for crux detection)
    const existing = groupRelationships.get(groupKey)
    if (!existing || mapping.relationship === 'opposition') {
      groupRelationships.set(groupKey, mapping.relationship)
    }
    // Keep the highest-confidence sharedTopic
    if (mapping.sharedTopic) {
      const existingTopic = groupTopics.get(groupKey)
      if (!existingTopic || mapping.confidence > existingTopic.confidence) {
        groupTopics.set(groupKey, { topic: mapping.sharedTopic, confidence: mapping.confidence })
      }
    }
  }

  // Build all node IDs
  const allNodeIds = new Set<string>()
  const nodeById = new Map<string, { node: import('./types').QBAFNode; personaId: string }>()
  for (const qbaf of qbafs) {
    for (const node of qbaf.nodes) {
      allNodeIds.add(node.id)
      nodeById.set(node.id, { node, personaId: qbaf.personaId })
    }
  }

  // Ensure all nodes are in the union-find
  for (const nodeId of allNodeIds) find(nodeId)

  // Group by root
  const groups = new Map<string, string[]>()
  for (const nodeId of allNodeIds) {
    const root = find(nodeId)
    const group = groups.get(root) ?? []
    group.push(nodeId)
    groups.set(root, group)
  }

  // Build community nodes
  const communityNodes: CommunityNode[] = []
  const sourceToComm = new Map<string, string>()

  let idx = 0
  for (const [groupRoot, memberIds] of groups) {
    const communityId = `c-${idx++}`
    for (const id of memberIds) sourceToComm.set(id, communityId)

    // Gather base scores per persona
    const baseScores: Record<string, number> = {}
    const claims: string[] = []
    for (const id of memberIds) {
      const entry = nodeById.get(id)
      if (entry) {
        baseScores[entry.personaId] = entry.node.baseScore
        claims.push(entry.node.claim)
      }
    }

    const scores = Object.values(baseScores)
    const variance = scores.length >= 2 ? computeVariance(scores) : 0
    const relationship = groupRelationships.get(groupRoot)
    const topicEntry = groupTopics.get(groupRoot)

    // Build claim text — prefer sharedTopic for multi-member groups
    let claim: string
    if (memberIds.length === 1) {
      claim = claims[0]
    } else if (relationship === 'agreement') {
      claim = claims[0]
    } else if (topicEntry) {
      // Use the best sharedTopic as the primary claim text
      claim = topicEntry.topic
    } else {
      // No sharedTopic available — use at most 2 claims
      const uniqueClaims = [...new Set(claims)]
      claim = uniqueClaims.slice(0, 2).join(' vs. ')
    }

    // Classify
    const scoreValues = Object.values(baseScores)
    const baseScoreSpread = scoreValues.length >= 2
      ? Math.max(...scoreValues) - Math.min(...scoreValues)
      : 0

    let classification: 'consensus' | 'crux' | 'neutral' = 'neutral'
    if (Object.keys(baseScores).length >= 2) {
      if (relationship === 'opposition') {
        classification = 'crux'
      } else if (relationship === 'agreement') {
        classification = variance < consensusThreshold ? 'consensus' : 'neutral'
      } else {
        // For 'related' nodes, also flag as crux when base scores diverge meaningfully
        if (variance > cruxThreshold || baseScoreSpread > 0.3) classification = 'crux'
        else if (variance < consensusThreshold) classification = 'consensus'
      }
    }

    communityNodes.push({
      id: communityId,
      claim,
      mergedFrom: memberIds,
      baseScores,
      communityStrength: 0,
      variance,
      classification,
    })
  }

  // Remap edges
  const allEdges: QBAFEdge[] = []
  for (const qbaf of qbafs) allEdges.push(...qbaf.edges)

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

  const cruxNodes = communityNodes.filter(n => n.classification === 'crux').map(n => n.id)
  const consensusNodes = communityNodes.filter(n => n.classification === 'consensus').map(n => n.id)

  return {
    topic: qbafs[0].topic,
    personas: qbafs.map(q => q.personaId),
    nodes: communityNodes,
    edges: communityEdges,
    cruxNodes,
    consensusNodes,
  }
}

/**
 * Identify structural cruxes from the community graph.
 * Uses counterfactual impact across all N personas.
 * When assumption conflicts are available, uses them for richer crux descriptions.
 */
export async function identifyCruxes(
  communityGraph: CommunityGraph,
  qbafs: PersonaQBAF[],
  topK: number = 5,
  assumptionConflicts?: AssumptionConflict[],
): Promise<StructuralCrux[]> {
  const cruxCandidates: StructuralCrux[] = []
  const qbafMap = new Map(qbafs.map(q => [q.personaId, q]))

  for (const node of communityGraph.nodes) {
    if (node.classification !== 'crux') continue

    // Compute counterfactual impact on each persona's root
    const impacts: Record<string, number> = {}
    const gradients: Record<string, number> = {} // gradient sign per persona
    for (const qbaf of qbafs) {
      impacts[qbaf.personaId] = computePersonaImpact(qbaf, node.mergedFrom)
      gradients[qbaf.personaId] = computePersonaGradient(qbaf, node.mergedFrom)
    }

    const impactValues = Object.values(impacts)
    const maxImpact = Math.max(...impactValues)
    const minImpact = Math.min(...impactValues)

    // Gradient sign disagreement: if personas have opposite structural sensitivity
    // to this node, it's the strongest crux signal (arxiv 2401.08879)
    const gradientValues = Object.values(gradients)
    const hasOppositeGradients = gradientValues.some(g => g > 0) && gradientValues.some(g => g < 0)
    const gradientBonus = hasOppositeGradients ? 0.3 : 0

    const cruxScore = Math.abs(maxImpact - minImpact) + (node.mergedFrom.length >= 2 ? 0.1 : 0) + gradientBonus

    const scores = Object.values(node.baseScores)
    const hasBaseScoreDiff = scores.length >= 2 && computeVariance(scores) > 0.05
    const hasEdgeDiff = Math.abs(maxImpact - minImpact) > 0.01 || hasOppositeGradients
    const disagreementType: 'base_score' | 'edge_structure' | 'both' =
      hasBaseScoreDiff && hasEdgeDiff ? 'both' :
      hasBaseScoreDiff ? 'base_score' : 'edge_structure'

    const personaPositions: Record<string, PersonaCruxPosition> = {}
    for (const personaId of communityGraph.personas) {
      const qbaf = qbafMap.get(personaId)
      personaPositions[personaId] = {
        baseScore: node.baseScores[personaId] ?? 0.5,
        dialecticalStrength: qbaf ? findNodeStrength(qbaf, node.mergedFrom) : 0,
        contribution: impacts[personaId] ?? 0,
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

  // Look up actual per-persona claims for each crux node
  const nodeClaimLookup = new Map<string, { claim: string; personaId: string }>()
  for (const qbaf of qbafs) {
    for (const node of qbaf.nodes) {
      nodeClaimLookup.set(node.id, { claim: node.claim, personaId: qbaf.personaId })
    }
  }

  // Generate crux descriptions and settling questions via LLM
  for (const crux of topCruxes) {
    const positions = Object.entries(crux.personaPositions)

    // Gather the actual underlying claims from each persona for this community node
    const communityNode = communityGraph.nodes.find(n => n.id === crux.nodeId)
    const underlyingClaims: Array<{ personaId: string; claim: string }> = []
    if (communityNode) {
      for (const sourceNodeId of communityNode.mergedFrom) {
        const entry = nodeClaimLookup.get(sourceNodeId)
        if (entry) underlyingClaims.push(entry)
      }
    }

    // Gather the actual underlying claims (no scores — those are shown separately in the UI)
    const claimLines = underlyingClaims.length > 0
      ? underlyingClaims.map(c => `- ${c.personaId}: "${c.claim}"`).join('\n')
      : `- Topic area: "${crux.claim}"`

    // Check if we have matching assumption conflicts for the personas in this crux
    const cruxPersonaIds = new Set(underlyingClaims.map(c => c.personaId))
    const relevantConflicts = (assumptionConflicts ?? []).filter(
      ac => cruxPersonaIds.has(ac.personaA) && cruxPersonaIds.has(ac.personaB)
    )

    if (relevantConflicts.length > 0) {
      // Use assumption conflicts for a deeper crux description
      const bestConflict = relevantConflicts.sort((a, b) => b.relevance - a.relevance)[0]

      const cruxResponse = await complete({
        system: `State the buried assumption that separates these positions. Not what they disagree ABOUT — but what they each take for granted that the other would challenge. Be specific and falsifiable. Do NOT include numbers, percentages, or persona names. Example: "Whether hyperscaler HBM orders represent real pull-through demand or speculative double-booking."`,
        messages: [{
          role: 'user',
          content: `These debaters hold opposing views. Their claims:

${claimLines}

The buried assumption conflict:
- One side assumes: "${bestConflict.assumptionA}"
- The other assumes: "${bestConflict.assumptionB}"
- Conflict type: ${bestConflict.conflictType}

State the crux — the specific buried assumption that separates these positions — in one sentence.`
        }],
        model: 'haiku',
        temperature: 0.3,
        maxTokens: 80,
      })

      crux.claim = cruxResponse.trim().replace(/^["']|["']$/g, '')
      crux.settlingQuestion = bestConflict.settlingQuestion
    } else {
      // Fallback: generate crux description without assumption data
      const cruxResponse = await complete({
        system: `State the buried assumption that separates these positions. Not what they disagree ABOUT — but what they each take for granted that the other would challenge. Be specific and falsifiable. Do NOT include numbers, percentages, or persona names. Example: "Whether hyperscaler HBM orders represent real pull-through demand or speculative double-booking."`,
        messages: [{
          role: 'user',
          content: `These debaters hold opposing views on a specific point. Their claims:

${claimLines}

State the crux — the specific buried assumption that separates these positions — in one sentence.`
        }],
        model: 'haiku',
        temperature: 0.3,
        maxTokens: 80,
      })

      crux.claim = cruxResponse.trim().replace(/^["']|["']$/g, '')

      // Generate a concise settling question
      const questionResponse = await complete({
        system: `Write one short question (under 25 words) that, if answered with evidence, would resolve this disagreement. Be concrete and testable. Do not use jargon. Respond with just the question.`,
        messages: [{
          role: 'user',
          content: `Crux: "${crux.claim}"

Underlying claims:
${claimLines}

What single question would settle this?`
        }],
        model: 'haiku',
        temperature: 0.3,
        maxTokens: 80,
      })

      crux.settlingQuestion = questionResponse.trim()
    }

    // Build human-readable counterfactual: who relies on this claim and how
    const highImpact = positions
      .filter(([, pos]) => pos.contribution > 0.01)
      .sort((a, b) => b[1].contribution - a[1].contribution)
    const lowImpact = positions.filter(([, pos]) => pos.contribution <= 0.01)

    crux.counterfactual = highImpact.length > 0
      ? `Removing this claim would most affect ${highImpact.map(([pid]) => pid).join(', ')}. ${lowImpact.length > 0 ? `${lowImpact.map(([pid]) => pid).join(', ')} would be unaffected.` : ''}`
      : 'This claim has minimal structural impact on any persona.'
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

function computePersonaGradient(qbaf: PersonaQBAF, nodeIds: string[]): number {
  let totalGradient = 0
  for (const nodeId of nodeIds) {
    if (qbaf.nodes.some(n => n.id === nodeId)) {
      totalGradient += gradientSign(qbaf, nodeId, qbaf.rootClaim)
    }
  }
  return totalGradient
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
