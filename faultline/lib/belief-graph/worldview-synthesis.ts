// ─── Worldview Synthesis ──────────────────────────────────────
// Stage 1.5: Synthesize cross-corpus worldview from raw belief graphs.
//
// 1. Cluster belief nodes by semantic overlap (no LLM)
// 2. Extract positions + implicit assumptions (1 Sonnet call per persona)
// 3. Diff assumptions across personas (1 Haiku call per pair)

import type { BeliefGraph, BeliefNode, BeliefEdge } from '@/lib/types'
import type {
  BeliefCluster,
  WorldviewPosition,
  PersonaWorldview,
  AssumptionConflict,
} from './worldview-types'
import { completeJSON } from '@/lib/llm/client'

// ─── Step 1: Cluster Belief Nodes ─────────────────────────────

/**
 * Tokenize a concept string into meaningful words.
 * Strips short/common words, lowercases.
 */
function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'has', 'have',
    'its', 'are', 'was', 'were', 'been', 'being', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'not', 'but', 'also', 'more', 'than',
    'into', 'over', 'about', 'between', 'through', 'during', 'before',
    'after', 'above', 'below', 'all', 'each', 'every', 'both', 'few',
    'most', 'other', 'some', 'such', 'only', 'very', 'just', 'because',
    'driven', 'limited', 'despite', 'due', 'based', 'related',
  ])

  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  )
}

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Cluster belief nodes using agglomerative approach based on:
 * 1. Concept text similarity (Jaccard on tokens)
 * 2. Edge connectivity (nodes connected by edges cluster together)
 *
 * No LLM calls — pure algorithmic clustering.
 */
export function clusterBeliefNodes(graph: BeliefGraph): BeliefCluster[] {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

  // Build adjacency from edges
  const adjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set())
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set())
    adjacency.get(edge.from)!.add(edge.to)
    adjacency.get(edge.to)!.add(edge.from)
  }

  // Tokenize all nodes
  const nodeTokens = new Map<string, Set<string>>()
  for (const node of graph.nodes) {
    nodeTokens.set(node.id, tokenize(node.concept))
  }

  // Union-find for clustering
  const parent = new Map<string, string>()

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let curr = x
    while (curr !== root) {
      const next = parent.get(curr)!
      parent.set(curr, root)
      curr = next
    }
    return root
  }

  function union(a: string, b: string): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  // Pass 1: Merge nodes connected by edges (same-chunk co-occurrence)
  for (const edge of graph.edges) {
    union(edge.from, edge.to)
  }

  // Pass 1.5: Merge nodes that share source chunks (corpus co-occurrence)
  // This is a stronger signal than word overlap — nodes from the same tweet/essay
  // are topically related even if they use different terminology
  const chunkToNodes = new Map<string, string[]>()
  for (const node of graph.nodes) {
    for (const chunk of node.grounding) {
      if (!chunkToNodes.has(chunk)) chunkToNodes.set(chunk, [])
      chunkToNodes.get(chunk)!.push(node.id)
    }
  }
  for (const [, nodeIds] of chunkToNodes) {
    if (nodeIds.length >= 2) {
      for (let i = 1; i < nodeIds.length; i++) {
        union(nodeIds[0], nodeIds[i])
      }
    }
  }

  // Pass 2: Merge clusters with high token similarity (cross-chunk synthesis)
  const clusterRoots = [...new Set(graph.nodes.map(n => find(n.id)))]
  const clusterMembers = new Map<string, string[]>()
  for (const node of graph.nodes) {
    const root = find(node.id)
    if (!clusterMembers.has(root)) clusterMembers.set(root, [])
    clusterMembers.get(root)!.push(node.id)
  }

  // Compute cluster-level token sets
  const clusterTokenSets = new Map<string, Set<string>>()
  for (const [root, members] of clusterMembers) {
    const combined = new Set<string>()
    for (const memberId of members) {
      const tokens = nodeTokens.get(memberId)
      if (tokens) for (const t of tokens) combined.add(t)
    }
    clusterTokenSets.set(root, combined)
  }

  // Merge clusters with Jaccard > 0.3
  const MERGE_THRESHOLD = 0.3
  const roots = [...clusterTokenSets.keys()]
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const ri = find(roots[i])
      const rj = find(roots[j])
      if (ri === rj) continue

      const tokensI = clusterTokenSets.get(roots[i])!
      const tokensJ = clusterTokenSets.get(roots[j])!
      if (jaccardSimilarity(tokensI, tokensJ) > MERGE_THRESHOLD) {
        union(ri, rj)
      }
    }
  }

  // Rebuild clusters after merging
  const finalClusters = new Map<string, string[]>()
  for (const node of graph.nodes) {
    const root = find(node.id)
    if (!finalClusters.has(root)) finalClusters.set(root, [])
    finalClusters.get(root)!.push(node.id)
  }

  // Build BeliefCluster objects
  const edgeIndex = new Map<string, BeliefEdge[]>()
  for (const edge of graph.edges) {
    const fromRoot = find(edge.from)
    const toRoot = find(edge.to)
    // Edge belongs to a cluster if both endpoints are in it
    const clusterRoot = fromRoot === toRoot ? fromRoot : null
    if (clusterRoot) {
      if (!edgeIndex.has(clusterRoot)) edgeIndex.set(clusterRoot, [])
      edgeIndex.get(clusterRoot)!.push(edge)
    }
  }

  const clusters: BeliefCluster[] = []
  let clusterIdx = 0

  for (const [root, memberIds] of finalClusters) {
    if (memberIds.length === 0) continue

    const clusterEdges = edgeIndex.get(root) ?? []
    const sourceChunks = new Set<string>()
    for (const id of memberIds) {
      const node = nodeMap.get(id)
      if (node) for (const g of node.grounding) sourceChunks.add(g)
    }
    for (const edge of clusterEdges) {
      for (const sc of edge.sourceChunks) sourceChunks.add(sc)
    }

    // Pick representative claims: edges with highest confidence
    const sortedEdges = [...clusterEdges].sort((a, b) => b.confidence - a.confidence)
    const representativeClaims = sortedEdges.slice(0, 5).map(e => {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (!from || !to) return ''
      return e.polarity === 1
        ? `${from.concept} → ${to.concept}`
        : `${from.concept} ⊣ ${to.concept}`
    }).filter(Boolean)

    // Generate theme from most common tokens
    const allTokens = new Map<string, number>()
    for (const id of memberIds) {
      const tokens = nodeTokens.get(id)
      if (tokens) for (const t of tokens) allTokens.set(t, (allTokens.get(t) ?? 0) + 1)
    }
    const topTokens = [...allTokens.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t)
    const theme = topTokens.join(' / ') || `cluster-${clusterIdx}`

    clusters.push({
      id: `cluster-${clusterIdx++}`,
      theme,
      nodeIds: memberIds,
      edgeIds: clusterEdges.map(e => `${e.from}->${e.to}`),
      sourceChunks: [...sourceChunks],
      representativeClaims,
      claimCount: clusterEdges.length,
    })
  }

  // Sort by claim count descending — most grounded clusters first
  clusters.sort((a, b) => b.claimCount - a.claimCount)

  return clusters
}

// ─── Step 2: Position Extraction ──────────────────────────────

interface PositionExtractionResponse {
  positions: Array<{
    claim: string
    confidence: number
    type: 'thesis' | 'concern' | 'assumption' | 'value_judgment'
    groundingClusterIds: string[]
    implicitAssumptions: string[]
  }>
}

/**
 * Extract structured positions + implicit assumptions from clusters.
 * Uses one Sonnet call per persona for high-quality synthesis.
 */
export async function extractPositions(
  personaName: string,
  clusters: BeliefCluster[],
  contract: { personality?: string; bias?: string; stakes?: string; epistemology?: string; flipConditions?: string } | null,
): Promise<WorldviewPosition[]> {
  // Only send clusters with actual claims (skip noise clusters)
  const meaningfulClusters = clusters.filter(c => c.claimCount >= 1)

  // Format clusters for the prompt
  const clusterBlock = meaningfulClusters.slice(0, 25).map(c => {
    const claims = c.representativeClaims.slice(0, 3).map(cl => `    - ${cl}`).join('\n')
    return `[${c.id}] "${c.theme}" (${c.claimCount} claims, ${c.sourceChunks.length} sources)\n${claims}`
  }).join('\n\n')

  // Include contract context if available
  // flipConditions is the contrapositive of implicit assumptions — "what would make them change
  // their mind" directly encodes "what they currently take for granted"
  const flipBlock = contract?.flipConditions
    ? `\n- Flip conditions (what would change their mind — use as hints for implicit assumptions):\n${contract.flipConditions.slice(0, 600)}`
    : ''
  const contractBlock = contract
    ? `\nPersona context:
- Bias: ${contract.bias?.slice(0, 200) ?? 'unknown'}
- Stakes: ${contract.stakes?.slice(0, 200) ?? 'unknown'}
- Epistemology: ${contract.epistemology?.slice(0, 200) ?? 'unknown'}${flipBlock}`
    : ''

  const result = await completeJSON<PositionExtractionResponse>({
    system: `You synthesize a person's worldview from clusters of their public statements. Your goal is to identify their POSITIONS (what they believe) and the IMPLICIT ASSUMPTIONS those positions rest on (what they take for granted but don't state).

CRITICAL: Implicit assumptions must be things the person does NOT explicitly say, but which their stated positions REQUIRE to be true. These are the hidden premises. If they say "HBM demand is strong", an implicit assumption might be "AI training compute scales faster than memory production capacity" — something they never state but their position depends on.

Do NOT invent positions they haven't expressed. Every position must be traceable to the cluster data.
Do NOT hallucinate assumptions from general knowledge. Each assumption must be LOGICALLY REQUIRED by the specific claims in the clusters — not just something a typical analyst might assume. If you can't trace the assumption back to at least one cluster's claims, don't include it.`,
    messages: [{
      role: 'user',
      content: `Analyze ${personaName}'s worldview from these belief clusters:

${clusterBlock}
${contractBlock}

Synthesize 8-12 positions. For each:
1. State it as a specific, falsifiable claim (not vague like "AI is important")
2. Rate confidence (0-1) based on frequency and intensity in their writing
3. Classify: thesis (core argument), concern (risk they acknowledge), assumption (taken for granted), value_judgment (priority/preference)
4. List which cluster IDs ground this position
5. List 2-3 IMPLICIT ASSUMPTIONS — things they take for granted that:
   - Are falsifiable (could be proven wrong)
   - Are non-obvious (not just restating the position)
   - Are differentiating (another analyst might assume the opposite)

Output JSON:
{
  "positions": [
    {
      "claim": "...",
      "confidence": 0.85,
      "type": "thesis",
      "groundingClusterIds": ["cluster-0", "cluster-3"],
      "implicitAssumptions": ["...", "...", "..."]
    }
  ]
}`,
    }],
    model: 'sonnet',
    temperature: 0.3,
    maxTokens: 4096,
  })

  return (result.positions || []).map((p, i) => ({
    id: `pos-${i}`,
    claim: p.claim,
    confidence: p.confidence,
    type: p.type,
    groundingClusters: p.groundingClusterIds || [],
    implicitAssumptions: p.implicitAssumptions || [],
  }))
}

// ─── Step 3: Cross-Persona Assumption Diff ────────────────────

interface ConflictResponse {
  conflicts: Array<{
    assumptionA: string
    assumptionB: string
    conflictType: 'empirical' | 'causal' | 'temporal' | 'value' | 'boundary'
    settlingQuestion: string
    relevance: number
  }>
}

/**
 * Diff implicit assumptions between two personas.
 * One Haiku call per pair — finds assumption conflicts.
 */
export async function diffAssumptions(
  worldviewA: PersonaWorldview,
  worldviewB: PersonaWorldview,
  topic: string,
): Promise<AssumptionConflict[]> {
  // Collect all assumptions per persona
  const assumptionsA = worldviewA.positions.flatMap(p =>
    p.implicitAssumptions.map(a => ({ assumption: a, position: p.claim, confidence: p.confidence }))
  )
  const assumptionsB = worldviewB.positions.flatMap(p =>
    p.implicitAssumptions.map(a => ({ assumption: a, position: p.claim, confidence: p.confidence }))
  )

  if (assumptionsA.length === 0 || assumptionsB.length === 0) return []

  const blockA = assumptionsA.slice(0, 20).map((a, i) =>
    `A[${i}] "${a.assumption}" (supports: "${a.position}")`
  ).join('\n')

  const blockB = assumptionsB.slice(0, 20).map((a, i) =>
    `B[${i}] "${a.assumption}" (supports: "${a.position}")`
  ).join('\n')

  const result = await completeJSON<ConflictResponse>({
    system: `You identify assumption conflicts between two analysts. A conflict exists when one analyst takes something for granted that the other would explicitly disagree with. Focus on assumptions that are specific, falsifiable, and central to each analyst's thesis.`,
    messages: [{
      role: 'user',
      content: `Topic: "${topic}"

${worldviewA.personaName}'s implicit assumptions:
${blockA}

${worldviewB.personaName}'s implicit assumptions:
${blockB}

Find 3-5 assumption CONFLICTS. For each:
- State the specific assumption from each side that conflicts
- Classify: empirical (measurable fact), causal (which mechanism dominates), temporal (timeframe), value (priorities), boundary (scope)
- State what single piece of evidence would resolve it
- Rate relevance (0-1): how central is this to their disagreement?

Output JSON:
{
  "conflicts": [
    {
      "assumptionA": "...",
      "assumptionB": "...",
      "conflictType": "empirical",
      "settlingQuestion": "...",
      "relevance": 0.85
    }
  ]
}`,
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 2048,
  })

  return (result.conflicts || []).map((c, i) => ({
    id: `conflict-${worldviewA.personaId}-${worldviewB.personaId}-${i}`,
    assumptionA: c.assumptionA,
    assumptionB: c.assumptionB,
    personaA: worldviewA.personaId,
    personaB: worldviewB.personaId,
    conflictType: c.conflictType,
    settlingQuestion: c.settlingQuestion,
    relevance: c.relevance,
  }))
}

// ─── Full Pipeline ────────────────────────────────────────────

/**
 * Synthesize a persona's worldview from their belief graph.
 * Returns clusters + positions with implicit assumptions.
 */
export async function synthesizeWorldview(
  personaId: string,
  personaName: string,
  beliefGraph: BeliefGraph,
  contract: { personality?: string; bias?: string; stakes?: string; epistemology?: string; flipConditions?: string } | null,
): Promise<PersonaWorldview> {
  // Step 1: Cluster (no LLM)
  const clusters = clusterBeliefNodes(beliefGraph)
  console.log(`  [${personaId}] Clustered ${beliefGraph.nodes.length} nodes into ${clusters.length} clusters`)

  // Step 2: Extract positions (1 Sonnet call)
  const positions = await extractPositions(personaName, clusters, contract)
  console.log(`  [${personaId}] Extracted ${positions.length} positions with ${positions.reduce((s, p) => s + p.implicitAssumptions.length, 0)} implicit assumptions`)

  return {
    personaId,
    personaName,
    positions,
    clusters,
    synthesizedAt: new Date().toISOString(),
  }
}
