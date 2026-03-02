// ─── Stage 2: Topic-Scoped QBAF from Belief Graph ─────────────
// Given a persona's raw belief graph + a debate topic, filters to relevant
// triples and restructures into a QBAF tree with evidence-derived base scores.
//
// The belief graph is mostly causal pairs (degree 1), not a dense web.
// Strategy:
// 1. Decompose the topic into 4-6 aspects (economic, social, technical, etc.)
// 2. Filter belief graph edges per aspect — ensures comprehensive coverage
// 3. Merge and deduplicate, then classify as supporting/undermining root claim
// 4. Build QBAF tree with evidence-density base scores

import type { PersonaQBAF, QBAFNode, QBAFEdge } from './types'
import type { BeliefGraph, BeliefNode, BeliefEdge } from '@/lib/types'
import { completeJSON } from '@/lib/llm/client'
import { computeStrengths } from './df-quad'

interface TopicAspect {
  label: string
  description: string
}

interface AspectFilterResponse {
  selectedEdges: Array<{
    edgeIndex: number
    relevance: number  // 0-1
  }>
}

interface ClassificationResponse {
  rootClaim: string
  arguments: Array<{
    edgeIndex: number
    relation: 'supports' | 'undermines'
    strength: number
  }>
}

/**
 * Compute evidence-density base score τ for a belief edge.
 * Derived entirely from the belief graph data — no LLM involved.
 */
function computeBaseScore(
  edge: BeliefEdge,
  fromNode: BeliefNode,
  toNode: BeliefNode,
): number {
  // 1. Source chunk breadth — how many independent corpus chunks support this triple
  const allChunks = new Set<string>([
    ...edge.sourceChunks,
    ...fromNode.grounding,
    ...toNode.grounding,
  ])
  const sourceCount = allChunks.size
  const sourceBreadth = Math.min(sourceCount / 5, 1.0) // saturates at 5 sources

  // 2. Extraction confidence from the edge itself
  const edgeConfidence = edge.confidence

  // 3. Node type bonus
  const typeWeight: Record<string, number> = {
    core_value: 0.12,
    factual_claim: 0.08,
    inference: 0.0,
    assumption: -0.05,
  }
  const fromBonus = typeWeight[fromNode.type] ?? 0
  const toBonus = typeWeight[toNode.type] ?? 0
  const avgTypeBonus = (fromBonus + toBonus) / 2

  // Weighted: 40% confidence, 35% source breadth, 15% type, 10% baseline
  const raw = (edgeConfidence * 0.40) + (sourceBreadth * 0.35) + avgTypeBonus + 0.10
  return Math.max(0.05, Math.min(0.95, raw))
}

/**
 * Format a belief edge as a readable claim for the LLM.
 */
function edgeToClaim(
  edge: BeliefEdge,
  fromNode: BeliefNode,
  toNode: BeliefNode,
): string {
  const verb = edge.polarity === 1 ? 'causes/supports' : 'undermines/reduces'
  return `${fromNode.concept} ${verb} ${toNode.concept}`
}

/**
 * Decompose a debate topic into 4-6 distinct aspects.
 * This ensures the QBAF covers all dimensions of the topic, not just the dominant theme.
 */
async function decomposeTopicForBeliefGraph(topic: string): Promise<TopicAspect[]> {
  const result = await completeJSON<{ aspects: TopicAspect[] }>({
    system: 'You decompose debate topics into distinct analytical dimensions. Include dimensions that SUPPORT the topic, dimensions that UNDERMINE it, and structural/systemic dimensions.',
    messages: [{
      role: 'user',
      content: `Break this debate topic into 5 distinct analytical dimensions. Include:
- At least 1 dimension where the claim is likely TRUE
- At least 1 dimension where the claim is likely FALSE or has strong counterarguments
- At least 1 structural/systemic dimension (policy, institutions, feedback loops)

Topic: "${topic}"

Output JSON:
{
  "aspects": [
    { "label": "short label (3-5 words)", "description": "one sentence: what specific sub-question does this cover?" }
  ]
}`,
    }],
    model: 'haiku',
    maxTokens: 500,
    temperature: 0.3,
  })

  return result.aspects.slice(0, 6) // cap at 6
}

/**
 * Filter belief graph edges by relevance to a specific topic aspect.
 * Returns edge indices + relevance scores.
 */
async function filterEdgesByAspect(
  edgeDescriptions: string[],
  aspect: TopicAspect,
  topic: string,
): Promise<Array<{ edgeIndex: number; relevance: number }>> {
  const maxEdgesPerCall = 100
  const results: Array<{ edgeIndex: number; relevance: number }> = []

  for (let offset = 0; offset < edgeDescriptions.length; offset += maxEdgesPerCall) {
    const chunk = edgeDescriptions.slice(offset, offset + maxEdgesPerCall)

    const response = await completeJSON<AspectFilterResponse>({
      system: 'You select belief graph edges relevant to a specific aspect of a debate topic. Be selective — only include edges with clear relevance to THIS aspect.',
      messages: [{
        role: 'user',
        content: `Topic: "${topic}"
Aspect: "${aspect.label}" — ${aspect.description}

Select edges relevant to this specific aspect. Only include edges that directly relate to "${aspect.label}".

Edges:
${chunk.join('\n')}

Respond in JSON:
{
  "selectedEdges": [
    { "edgeIndex": 0, "relevance": 0.0-1.0 }
  ]
}`,
      }],
      model: 'haiku',
      temperature: 0.2,
      maxTokens: 2048,
    })

    for (const e of response.selectedEdges) {
      results.push({ edgeIndex: e.edgeIndex + offset, relevance: e.relevance })
    }
  }

  return results
}

/**
 * Use aspect-based decomposition to select belief graph edges, then classify
 * as supporting or undermining the persona's root claim.
 *
 * This replaces the single-pass filter with a multi-aspect approach:
 * 1. Decompose topic into 4-6 aspects
 * 2. Filter edges per aspect (ensures coverage of counterpoints)
 * 3. Merge + deduplicate, keeping the best relevance score per edge
 * 4. Classify merged edges as supports/undermines
 */
async function filterAndClassifyEdges(
  graph: BeliefGraph,
  topic: string,
): Promise<{
  rootClaim: string
  aspects: TopicAspect[]
  classified: Array<{
    edge: BeliefEdge
    fromNode: BeliefNode
    toNode: BeliefNode
    relation: 'supports' | 'undermines'
    strength: number
    aspect: string
  }>
}> {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

  // Format edges for the LLM
  const edgeDescriptions = graph.edges.map((e, i) => {
    const from = nodeMap.get(e.from)
    const to = nodeMap.get(e.to)
    if (!from || !to) return null
    const verb = e.polarity === 1 ? '→(+)' : '→(-)'
    return `[${i}] "${from.concept}" ${verb} "${to.concept}" (conf=${e.confidence.toFixed(2)}, sources=${e.sourceChunks.length})`
  }).filter(Boolean) as string[]

  // Step 1: Decompose topic into aspects
  const aspects = await decomposeTopicForBeliefGraph(topic)

  // Step 2: Filter edges per aspect in parallel
  const aspectResults = await Promise.all(
    aspects.map(aspect => filterEdgesByAspect(edgeDescriptions, aspect, topic))
  )

  // Step 3: Merge — keep best relevance per edge, track which aspect found it
  const edgeBest = new Map<number, { relevance: number; aspect: string }>()
  for (let i = 0; i < aspects.length; i++) {
    for (const { edgeIndex, relevance } of aspectResults[i]) {
      const existing = edgeBest.get(edgeIndex)
      if (!existing || relevance > existing.relevance) {
        edgeBest.set(edgeIndex, { relevance, aspect: aspects[i].label })
      }
    }
  }

  // Ensure each aspect contributes at least 2 edges (if available)
  for (let i = 0; i < aspects.length; i++) {
    const aspectEdges = aspectResults[i]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3) // top 3 per aspect
    for (const { edgeIndex, relevance } of aspectEdges) {
      if (!edgeBest.has(edgeIndex)) {
        edgeBest.set(edgeIndex, { relevance, aspect: aspects[i].label })
      }
    }
  }

  // Sort by relevance, take top 15
  const mergedEdges = [...edgeBest.entries()]
    .sort((a, b) => b[1].relevance - a[1].relevance)
    .slice(0, 15)

  // Step 4: Synthesize root claim and classify all selected edges
  const selectedDescriptions = mergedEdges.map(([idx, { aspect }]) => {
    return `[${idx}] ${edgeDescriptions[idx]} (aspect: ${aspect})`
  })

  const classification = await completeJSON<ClassificationResponse>({
    system: 'You synthesize a root claim for a persona and classify belief edges as supporting or undermining that claim.',
    messages: [{
      role: 'user',
      content: `Topic: "${topic}"
Persona: ${graph.personaName}

These edges were selected from the persona's belief graph across multiple topic aspects:
${selectedDescriptions.join('\n')}

1. Synthesize a root claim that captures this persona's core stance on the topic.
2. For each edge, classify whether it "supports" or "undermines" the root claim.

IMPORTANT: A persona may hold beliefs that UNDERMINE their own position — these represent acknowledged risks, counterarguments they've engaged with, or nuances in their thinking. Classify honestly based on the relationship to the root claim.

Respond in JSON:
{
  "rootClaim": "the persona's core stance as one sentence",
  "arguments": [
    { "edgeIndex": 42, "relation": "supports" or "undermines", "strength": 0.0-1.0 }
  ]
}`,
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 4096,
  })

  const rootClaim = classification.rootClaim || `${graph.personaName}'s position on: ${topic}`

  // Build classified array with aspect tracking
  const classified = classification.arguments
    .map(arg => {
      const edge = graph.edges[arg.edgeIndex]
      if (!edge) return null
      const fromNode = nodeMap.get(edge.from)
      const toNode = nodeMap.get(edge.to)
      if (!fromNode || !toNode) return null
      const aspectInfo = edgeBest.get(arg.edgeIndex)
      return {
        edge,
        fromNode,
        toNode,
        relation: arg.relation,
        strength: arg.strength,
        aspect: aspectInfo?.aspect ?? 'unknown',
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return { rootClaim, aspects, classified }
}

/**
 * Build a QBAF tree from classified belief edges.
 *
 * Structure:
 * - Root: synthesized stance on the topic
 * - Depth-1: top 3-5 most relevant belief edges, as direct arguments
 * - Depth-2: remaining belief edges grouped under the depth-1 node they best relate to
 *
 * Every node traces back to a real belief edge extracted from the persona's corpus.
 */
function buildQBAFTree(
  personaId: string,
  topic: string,
  rootClaim: string,
  classified: Array<{
    edge: BeliefEdge
    fromNode: BeliefNode
    toNode: BeliefNode
    relation: 'supports' | 'undermines'
    strength: number
    aspect: string
  }>,
): PersonaQBAF {
  if (classified.length === 0) {
    // Degenerate case: no relevant edges found
    return {
      personaId,
      topic,
      rootClaim: `${personaId}-root`,
      nodes: [{
        id: `${personaId}-root`,
        claim: rootClaim,
        type: 'root',
        baseScore: 0.5,
        dialecticalStrength: 0.5,
        grounding: [],
        personaId,
        depth: 0,
      }],
      edges: [],
      round: 0,
    }
  }

  const qbafNodes: QBAFNode[] = []
  const qbafEdges: QBAFEdge[] = []

  // Root node — base score is average of all classified edge base scores
  const rootBaseScores = classified.map(c => computeBaseScore(c.edge, c.fromNode, c.toNode))
  const rootBaseScore = rootBaseScores.reduce((s, v) => s + v, 0) / rootBaseScores.length

  // Collect all grounding from classified edges
  const rootGrounding = new Set<string>()
  for (const c of classified) {
    for (const g of c.fromNode.grounding) rootGrounding.add(g)
    for (const g of c.toNode.grounding) rootGrounding.add(g)
    for (const g of c.edge.sourceChunks) rootGrounding.add(g)
  }

  const rootId = `${personaId}-root`
  qbafNodes.push({
    id: rootId,
    claim: rootClaim,
    type: 'root',
    baseScore: rootBaseScore,
    dialecticalStrength: 0,
    grounding: [...rootGrounding].slice(0, 10), // cap for readability
    personaId,
    depth: 0,
  })

  // Split into depth-1 (top 5) and depth-2 (rest)
  const depth1Count = Math.min(5, classified.length)
  const depth1Items = classified.slice(0, depth1Count)
  const depth2Items = classified.slice(depth1Count)

  // Depth-1 nodes
  for (let i = 0; i < depth1Items.length; i++) {
    const item = depth1Items[i]
    const nodeId = `${personaId}-d1-${i}`
    const claim = edgeToClaim(item.edge, item.fromNode, item.toNode)
    const baseScore = computeBaseScore(item.edge, item.fromNode, item.toNode)
    const edgeType: 'attack' | 'support' = item.relation === 'undermines' ? 'attack' : 'support'

    const grounding = [
      ...item.fromNode.grounding,
      ...item.toNode.grounding,
      ...item.edge.sourceChunks,
    ]

    qbafNodes.push({
      id: nodeId,
      claim,
      type: edgeType === 'support' ? 'pro' : 'con',
      baseScore,
      dialecticalStrength: 0,
      grounding: [...new Set(grounding)],
      personaId,
      depth: 1,
    })

    qbafEdges.push({
      id: `${nodeId}->${rootId}`,
      from: nodeId,
      to: rootId,
      type: edgeType,
      weight: item.strength,
    })
  }

  // Depth-2: assign remaining edges to the depth-1 node they're most semantically related to
  // Simple heuristic: match by shared concepts (node IDs that overlap)
  for (let j = 0; j < depth2Items.length; j++) {
    const item = depth2Items[j]
    const nodeId = `${personaId}-d2-${j}`

    // Find best depth-1 parent by concept overlap
    let bestParentIdx = 0
    let bestOverlap = -1
    const itemConcepts = new Set([
      item.fromNode.concept.toLowerCase(),
      item.toNode.concept.toLowerCase(),
    ])

    for (let i = 0; i < depth1Items.length; i++) {
      const d1 = depth1Items[i]
      const d1Concepts = [
        d1.fromNode.concept.toLowerCase(),
        d1.toNode.concept.toLowerCase(),
      ]
      // Count word overlap
      const itemWords = new Set(
        [...itemConcepts].join(' ').split(/\s+/)
      )
      let overlap = 0
      for (const word of d1Concepts.join(' ').split(/\s+/)) {
        if (itemWords.has(word) && word.length > 3) overlap++
      }
      // Also prefer same relation type
      if (item.relation === depth1Items[i].relation) overlap += 0.5
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestParentIdx = i
      }
    }

    const parentId = `${personaId}-d1-${bestParentIdx}`
    const claim = edgeToClaim(item.edge, item.fromNode, item.toNode)
    const baseScore = computeBaseScore(item.edge, item.fromNode, item.toNode)
    const edgeType: 'attack' | 'support' = item.relation === 'undermines' ? 'attack' : 'support'

    const grounding = [
      ...item.fromNode.grounding,
      ...item.toNode.grounding,
      ...item.edge.sourceChunks,
    ]

    qbafNodes.push({
      id: nodeId,
      claim,
      type: edgeType === 'support' ? 'pro' : 'con',
      baseScore,
      dialecticalStrength: 0,
      grounding: [...new Set(grounding)],
      personaId,
      depth: 2,
    })

    qbafEdges.push({
      id: `${nodeId}->${parentId}`,
      from: nodeId,
      to: parentId,
      type: edgeType,
      weight: item.strength,
    })
  }

  return {
    personaId,
    topic,
    rootClaim: rootId,
    nodes: qbafNodes,
    edges: qbafEdges,
    round: 0,
  }
}

/**
 * Extract a topic-scoped QBAF from a persona's raw belief graph.
 *
 * Stage 2 of the staged pipeline. Every QBAF node maps to a real belief edge
 * extracted from the persona's corpus. Base scores are evidence-density derived.
 *
 * Pipeline:
 * 1. Decompose topic into 4-6 aspects (economic, social, technical, etc.)
 * 2. Filter belief graph edges per aspect — ensures comprehensive coverage
 * 3. Classify as supports/undermines the persona's root claim
 * 4. Build QBAF tree with evidence-density base scores
 * 5. Compute dialectical strengths via DF-QuAD
 *
 * LLM calls: Haiku for decomposition, filtering, and classification.
 * No argument generation — all claims come from the belief graph.
 */
export async function extractQBAFFromBeliefGraph(
  personaId: string,
  beliefGraph: BeliefGraph,
  topic: string,
): Promise<PersonaQBAF> {
  // Step 1: Aspect-based filtering + classification
  const { rootClaim, aspects, classified } = await filterAndClassifyEdges(beliefGraph, topic)

  const supports = classified.filter(c => c.relation === 'supports').length
  const undermines = classified.filter(c => c.relation === 'undermines').length
  const aspectsCovered = new Set(classified.map(c => c.aspect)).size
  console.log(`  [${personaId}] ${classified.length} edges selected (${supports} support, ${undermines} undermine) across ${aspectsCovered}/${aspects.length} aspects`)

  // Step 2: Build QBAF tree with evidence-density base scores
  const rawQbaf = buildQBAFTree(personaId, topic, rootClaim, classified)

  // Step 3: Compute dialectical strengths via DF-QuAD
  return computeStrengths(rawQbaf)
}
