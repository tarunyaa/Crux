// ─── QBAF Extraction from Persona Contract + Corpus ──────────
// Given a persona's contract + a debate topic, produces a QBAF tree
// rooted at the persona's stance on the topic.

import type { PersonaQBAF, QBAFNode, QBAFEdge } from './types'
import type { PersonaContract, Persona, CorpusExcerpt } from '@/lib/types'
import { buildConsolidatedPrompt } from '@/lib/personas/loader'
import { completeJSON } from '@/lib/llm/client'
import { computeStrengths } from './df-quad'

interface RootClaimResponse {
  claim: string
  grounding: string[]
}

interface DepthOneResponse {
  arguments: {
    claim: string
    type: 'pro' | 'con'
    grounding: string[]
  }[]
}

interface DepthTwoResponse {
  subArguments: {
    claim: string
    type: 'pro' | 'con'
    grounding: string[]
  }[]
}

interface BaseScoresResponse {
  scores: Record<string, number>  // nodeId → τ
}

interface RelevanceFilterResponse {
  selectedIds: string[]
}

/**
 * Filter corpus entries by topic relevance using a cheap Haiku call.
 * Returns the top ~10-15 most relevant entries.
 */
async function filterCorpusByTopic(
  corpus: CorpusExcerpt[],
  topic: string,
): Promise<CorpusExcerpt[]> {
  if (corpus.length === 0) return []
  if (corpus.length <= 15) return corpus

  // Send IDs + truncated content for cheap relevance scoring
  const summaries = corpus.map(e => {
    const truncated = e.content.length > 200 ? e.content.slice(0, 200) + '...' : e.content
    return `[${e.id}] ${truncated}`
  }).join('\n')

  const response = await completeJSON<RelevanceFilterResponse>({
    system: 'You select corpus entries most relevant to a given topic. Return only the IDs of the 10-15 most relevant entries.',
    messages: [{
      role: 'user',
      content: `Topic: "${topic}"

Select the 10-15 entries most relevant to this topic. Prefer entries with substantive claims, analysis, or data over short replies or jokes.

Entries:
${summaries}

Respond in JSON:
{
  "selectedIds": ["id1", "id2", ...]
}`
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 1024,
  })

  const selectedSet = new Set(response.selectedIds)
  const filtered = corpus.filter(e => selectedSet.has(e.id))

  // Fallback: if filtering returned too few, return first 15
  if (filtered.length < 5) return corpus.slice(0, 15)
  return filtered
}

/**
 * Format filtered corpus entries into a prompt block.
 */
function buildSourceMaterialBlock(corpus: CorpusExcerpt[]): string {
  if (corpus.length === 0) return ''

  const entries = corpus.map(e => {
    const truncated = e.content.length > 500 ? e.content.slice(0, 500) + '...' : e.content
    return `[${e.id}] "${truncated}" — ${e.platform}`
  }).join('\n')

  return `## Source Material
Use ONLY these IDs in your grounding field. Cite the specific entries that support your claim.

${entries}`
}

/**
 * Extract a topic-scoped QBAF for a persona.
 * Pipeline: filter corpus → root claim → depth-1 args → depth-2 sub-args → base scores → DF-QuAD
 */
export async function extractQBAF(
  persona: Persona,
  contract: PersonaContract,
  topic: string,
  corpus: CorpusExcerpt[] = [],
): Promise<PersonaQBAF> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  // Step 0: Filter corpus by topic relevance
  const filteredCorpus = await filterCorpusByTopic(corpus, topic)
  const sourceMaterial = buildSourceMaterialBlock(filteredCorpus)
  const groundingInstruction = filteredCorpus.length > 0
    ? 'IDs from the Source Material above that support this stance'
    : 'reference IDs from your background that support this stance'
  const groundingInstructionArgs = filteredCorpus.length > 0
    ? 'IDs from the Source Material above'
    : 'reference IDs'

  // Step 1: Generate root claim
  const rootResponse = await completeJSON<RootClaimResponse>({
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Given the topic: "${topic}"

State your core thesis as a single, specific, falsifiable claim. This is your root belief about this topic.

${sourceMaterial}

Respond in JSON:
{
  "claim": "your core thesis as one sentence",
  "grounding": ["${groundingInstruction}"]
}`
    }],
    model: 'sonnet',
    temperature: 0.7,
    maxTokens: 1024,
  })

  const rootId = `${persona.id}-root`
  const rootNode: QBAFNode = {
    id: rootId,
    claim: rootResponse.claim,
    type: 'root',
    baseScore: 0.5, // placeholder, scored later
    dialecticalStrength: 0,
    grounding: rootResponse.grounding ?? [],
    personaId: persona.id,
    depth: 0,
  }

  // Step 2: Generate depth-1 arguments (width=3)
  const depthOneResponse = await completeJSON<DepthOneResponse>({
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Your core thesis on "${topic}" is: "${rootResponse.claim}"

Generate exactly 3 arguments — a mix of supporting (pro) and opposing (con) considerations that are relevant to this thesis. Include at least 1 pro and 1 con.

Each argument should be a specific, substantive claim — not a vague category.

${sourceMaterial}

Respond in JSON:
{
  "arguments": [
    { "claim": "specific argument", "type": "pro" or "con", "grounding": ["${groundingInstructionArgs}"] }
  ]
}`
    }],
    model: 'sonnet',
    temperature: 0.7,
    maxTokens: 2048,
  })

  const depthOneNodes: QBAFNode[] = []
  const depthOneEdges: QBAFEdge[] = []

  for (let i = 0; i < depthOneResponse.arguments.length; i++) {
    const arg = depthOneResponse.arguments[i]
    const nodeId = `${persona.id}-d1-${i}`
    depthOneNodes.push({
      id: nodeId,
      claim: arg.claim,
      type: arg.type,
      baseScore: 0.5,
      dialecticalStrength: 0,
      grounding: arg.grounding ?? [],
      personaId: persona.id,
      depth: 1,
    })
    depthOneEdges.push({
      id: `${nodeId}->${rootId}`,
      from: nodeId,
      to: rootId,
      type: arg.type === 'pro' ? 'support' : 'attack',
      weight: 1.0,
    })
  }

  // Step 3: Generate depth-2 sub-arguments (width=2 per depth-1 node)
  const depthTwoNodes: QBAFNode[] = []
  const depthTwoEdges: QBAFEdge[] = []

  for (const parentNode of depthOneNodes) {
    const depthTwoResponse = await completeJSON<DepthTwoResponse>({
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `In a debate about "${topic}", one argument is: "${parentNode.claim}" (${parentNode.type === 'pro' ? 'supporting' : 'opposing'} the thesis).

Generate exactly 2 sub-arguments that either support or attack this specific argument. These should be concrete evidence, data points, or logical reasoning.

${sourceMaterial}

Respond in JSON:
{
  "subArguments": [
    { "claim": "specific sub-argument", "type": "pro" or "con", "grounding": ["${groundingInstructionArgs}"] }
  ]
}`
      }],
      model: 'sonnet',
      temperature: 0.7,
      maxTokens: 2048,
    })

    for (let j = 0; j < depthTwoResponse.subArguments.length; j++) {
      const subArg = depthTwoResponse.subArguments[j]
      const nodeId = `${parentNode.id}-d2-${j}`
      depthTwoNodes.push({
        id: nodeId,
        claim: subArg.claim,
        type: subArg.type,
        baseScore: 0.5,
        dialecticalStrength: 0,
        grounding: subArg.grounding ?? [],
        personaId: persona.id,
        depth: 2,
      })
      depthTwoEdges.push({
        id: `${nodeId}->${parentNode.id}`,
        from: nodeId,
        to: parentNode.id,
        type: subArg.type === 'pro' ? 'support' : 'attack',
        weight: 1.0,
      })
    }
  }

  // Step 4: Assign base scores via Haiku
  const allNodes = [rootNode, ...depthOneNodes, ...depthTwoNodes]
  const nodeList = allNodes.map(n => `${n.id}: "${n.claim}" (${n.type})`).join('\n')

  const scoresResponse = await completeJSON<BaseScoresResponse>({
    system: `You are scoring the intrinsic plausibility of arguments in a debate about "${topic}". Rate how plausible each claim is on its own merits, independent of the argument structure. Use the full [0,1] range.`,
    messages: [{
      role: 'user',
      content: `Rate the intrinsic plausibility (τ) of each argument on a scale of 0.0 to 1.0, where 0 = obviously false/implausible, 0.5 = uncertain, 1.0 = obviously true/well-established.

Arguments:
${nodeList}

Respond in JSON:
{
  "scores": { "nodeId": score, ... }
}`
    }],
    model: 'haiku',
    temperature: 0.2,
    maxTokens: 2048,
  })

  // Apply base scores
  for (const node of allNodes) {
    const score = scoresResponse.scores[node.id]
    if (score !== undefined) {
      node.baseScore = Math.max(0, Math.min(1, score))
    } else {
      node.baseScore = 0.5 // fallback
    }
  }

  // Step 5: Build QBAF and compute strengths via DF-QuAD
  const rawQbaf: PersonaQBAF = {
    personaId: persona.id,
    topic,
    rootClaim: rootId,
    nodes: allNodes,
    edges: [...depthOneEdges, ...depthTwoEdges],
    round: 0,
  }

  return computeStrengths(rawQbaf)
}
