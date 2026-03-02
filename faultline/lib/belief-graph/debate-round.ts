// ─── Debate Round: Graph-Level Argumentation ─────────────────
// Each round, personas examine each other's QBAF and generate
// new attack/support nodes targeting opponent arguments.

import type { PersonaQBAF, QBAFNode, QBAFEdge } from './types'
import type { PersonaContract, Persona } from '@/lib/types'
import { buildConsolidatedPrompt } from '@/lib/personas/loader'
import { completeJSON } from '@/lib/llm/client'
import { computeStrengths } from './df-quad'

interface DebateMovesResponse {
  moves: {
    targetNodeId: string
    claim: string
    type: 'attack' | 'support'
    weight: number
    grounding: string[]
  }[]
}

/**
 * Serialize a QBAF to structured text for LLM consumption.
 */
function serializeQBAF(qbaf: PersonaQBAF): string {
  const lines: string[] = []
  const nodeMap = new Map(qbaf.nodes.map(n => [n.id, n]))

  // Build tree structure from root
  function printNode(nodeId: string, indent: number): void {
    const node = nodeMap.get(nodeId)
    if (!node) return
    const prefix = '  '.repeat(indent)
    const scoreStr = `τ=${node.baseScore.toFixed(2)} σ=${node.dialecticalStrength.toFixed(2)}`
    lines.push(`${prefix}[${node.id}] (${node.type}) ${scoreStr}`)
    lines.push(`${prefix}  "${node.claim}"`)

    // Find children (nodes that have edges targeting this node)
    const children = qbaf.edges
      .filter(e => e.to === nodeId)
      .map(e => ({
        edge: e,
        node: nodeMap.get(e.from),
      }))
      .filter(c => c.node !== undefined)

    for (const child of children) {
      const rel = child.edge.type === 'attack' ? '⚔ ATTACKS' : '✓ SUPPORTS'
      lines.push(`${prefix}  ${rel} (weight=${child.edge.weight.toFixed(2)}):`)
      printNode(child.node!.id, indent + 2)
    }
  }

  printNode(qbaf.rootClaim, 0)
  return lines.join('\n')
}

/**
 * Run a single debate round between two personas.
 * Each persona reads the opponent's QBAF and generates 1-3 new nodes.
 * Returns updated QBAFs for both personas.
 */
export async function runDebateRound(
  qbafA: PersonaQBAF,
  qbafB: PersonaQBAF,
  personaA: Persona,
  personaB: Persona,
  contractA: PersonaContract,
  contractB: PersonaContract,
  round: number,
): Promise<{ qbafA: PersonaQBAF; qbafB: PersonaQBAF; newNodesA: number; newNodesB: number }> {
  // A reads B's graph and generates attacks/supports on B's nodes
  const [movesFromA, movesFromB] = await Promise.all([
    generateMoves(personaA, contractA, qbafA, qbafB, round),
    generateMoves(personaB, contractB, qbafB, qbafA, round),
  ])

  // Apply A's moves to B's QBAF (A attacks/supports B's arguments)
  const updatedQbafB = applyMoves(qbafB, movesFromA, personaA.id, round)
  // Apply B's moves to A's QBAF
  const updatedQbafA = applyMoves(qbafA, movesFromB, personaB.id, round)

  // Recompute strengths
  const finalA = computeStrengths(updatedQbafA)
  const finalB = computeStrengths(updatedQbafB)

  return {
    qbafA: { ...finalA, round },
    qbafB: { ...finalB, round },
    newNodesA: movesFromB.length,
    newNodesB: movesFromA.length,
  }
}

async function generateMoves(
  persona: Persona,
  contract: PersonaContract,
  myQbaf: PersonaQBAF,
  opponentQbaf: PersonaQBAF,
  round: number,
): Promise<DebateMovesResponse['moves']> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)
  const opponentText = serializeQBAF(opponentQbaf)
  const myText = serializeQBAF(myQbaf)

  // Get valid target node IDs for the opponent
  const validTargets = opponentQbaf.nodes.map(n => n.id)

  const response = await completeJSON<DebateMovesResponse>({
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `You are in round ${round} of a structured belief graph debate about "${opponentQbaf.topic}".

YOUR CURRENT BELIEF GRAPH:
${myText}

YOUR OPPONENT'S BELIEF GRAPH:
${opponentText}

Generate 1-3 targeted responses to your opponent's arguments. For each response:
- Pick a specific node in their graph to attack or support
- State your counter-argument or supporting evidence as a concrete claim
- Assign a weight (0.0-1.0) indicating how strong this attack/support is

Valid target node IDs: ${validTargets.join(', ')}

Respond in JSON:
{
  "moves": [
    {
      "targetNodeId": "opponent-node-id",
      "claim": "your specific counter-argument or supporting point",
      "type": "attack" or "support",
      "weight": 0.0-1.0,
      "grounding": ["reference IDs"]
    }
  ]
}`
    }],
    model: 'sonnet',
    temperature: 0.75,
    maxTokens: 4096,
  })

  // Validate target IDs exist in opponent's graph
  return response.moves.filter(m =>
    validTargets.includes(m.targetNodeId) &&
    (m.type === 'attack' || m.type === 'support')
  )
}

function applyMoves(
  qbaf: PersonaQBAF,
  moves: DebateMovesResponse['moves'],
  sourcePersonaId: string,
  round: number,
): PersonaQBAF {
  const newNodes: QBAFNode[] = []
  const newEdges: QBAFEdge[] = []

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]
    const nodeId = `${sourcePersonaId}-r${round}-${i}`
    newNodes.push({
      id: nodeId,
      claim: move.claim,
      type: move.type === 'attack' ? 'con' : 'pro',
      baseScore: 0.5, // will be scored in belief revision
      dialecticalStrength: 0,
      grounding: move.grounding ?? [],
      personaId: sourcePersonaId,
      depth: (qbaf.nodes.find(n => n.id === move.targetNodeId)?.depth ?? 0) + 1,
    })
    newEdges.push({
      id: `${nodeId}->${move.targetNodeId}`,
      from: nodeId,
      to: move.targetNodeId,
      type: move.type,
      weight: Math.max(0, Math.min(1, move.weight)),
    })
  }

  return {
    ...qbaf,
    nodes: [...qbaf.nodes, ...newNodes],
    edges: [...qbaf.edges, ...newEdges],
  }
}
