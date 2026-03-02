'use client'

// ─── QBAF Force-Directed Graph Visualization ─────────────────

import { useEffect, useRef, useMemo } from 'react'
import * as d3Force from 'd3-force'
import type { PersonaQBAF, CommunityGraph, QBAFNode, QBAFEdge, CommunityNode } from '@/lib/belief-graph/types'

type ViewMode = 'persona-a' | 'persona-b' | 'community' | 'diff'

interface GraphNode {
  id: string
  label: string
  strength: number
  baseScore: number
  type: string
  personaId?: string
  isCrux?: boolean
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphEdge {
  source: string
  target: string
  type: 'attack' | 'support'
  weight: number
}

interface QBAFGraphProps {
  qbafs: Record<string, PersonaQBAF>
  communityGraph: CommunityGraph | null
  personaIds: [string, string]
  viewMode: ViewMode
  selectedRound?: number
}

export function QBAFGraph({ qbafs, communityGraph, personaIds, viewMode, selectedRound }: QBAFGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pidA, pidB] = personaIds

  const { nodes, edges } = useMemo(() => {
    if (viewMode === 'community' && communityGraph) {
      return buildCommunityGraphData(communityGraph, pidA)
    }

    const targetQbaf = viewMode === 'persona-b' ? qbafs[pidB] : qbafs[pidA]
    if (!targetQbaf) return { nodes: [], edges: [] }

    return buildPersonaGraphData(targetQbaf, communityGraph)
  }, [qbafs, communityGraph, viewMode, pidA, pidB])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = svgRef.current
    const width = svg.clientWidth || 600
    const height = svg.clientHeight || 400

    // Clear previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // Create D3 force simulation
    const simNodes = nodes.map(n => ({ ...n }))
    const simEdges = edges.map(e => ({ ...e }))

    const simulation = d3Force.forceSimulation(simNodes as d3Force.SimulationNodeDatum[])
      .force('link', d3Force.forceLink(simEdges as d3Force.SimulationLinkDatum<d3Force.SimulationNodeDatum>[])
        .id((d: unknown) => (d as GraphNode).id)
        .distance(80))
      .force('charge', d3Force.forceManyBody().strength(-200))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collision', d3Force.forceCollide().radius(30))

    // Draw after simulation settles
    const ns = 'http://www.w3.org/2000/svg'

    // Defs for arrowheads
    const defs = document.createElementNS(ns, 'defs')
    const attackMarker = createMarker(ns, 'arrow-attack', '#dc2626')
    const supportMarker = createMarker(ns, 'arrow-support', 'currentColor')
    defs.appendChild(attackMarker)
    defs.appendChild(supportMarker)
    svg.appendChild(defs)

    // Edge group
    const edgeGroup = document.createElementNS(ns, 'g')
    svg.appendChild(edgeGroup)

    // Node group
    const nodeGroup = document.createElementNS(ns, 'g')
    svg.appendChild(nodeGroup)

    simulation.on('tick', () => {
      // Clear and redraw edges
      while (edgeGroup.firstChild) edgeGroup.removeChild(edgeGroup.firstChild)
      for (const edge of simEdges) {
        const src = edge.source as unknown as GraphNode
        const tgt = edge.target as unknown as GraphNode
        if (!src.x || !src.y || !tgt.x || !tgt.y) continue

        const line = document.createElementNS(ns, 'line')
        line.setAttribute('x1', String(src.x))
        line.setAttribute('y1', String(src.y))
        line.setAttribute('x2', String(tgt.x))
        line.setAttribute('y2', String(tgt.y))
        line.setAttribute('stroke', edge.type === 'attack' ? '#dc2626' : 'rgba(255,255,255,0.4)')
        line.setAttribute('stroke-width', String(1 + edge.weight * 2))
        if (edge.type === 'attack') {
          line.setAttribute('stroke-dasharray', '6,3')
        }
        line.setAttribute('marker-end', `url(#arrow-${edge.type})`)
        edgeGroup.appendChild(line)
      }

      // Clear and redraw nodes
      while (nodeGroup.firstChild) nodeGroup.removeChild(nodeGroup.firstChild)
      for (const node of simNodes as GraphNode[]) {
        if (!node.x || !node.y) continue

        const g = document.createElementNS(ns, 'g')
        g.setAttribute('transform', `translate(${node.x},${node.y})`)

        const radius = 8 + node.strength * 16
        const circle = document.createElementNS(ns, 'circle')
        circle.setAttribute('r', String(radius))
        circle.setAttribute('fill', getNodeFill(node, pidA, pidB))
        circle.setAttribute('stroke', node.isCrux ? '#dc2626' : 'rgba(255,255,255,0.3)')
        circle.setAttribute('stroke-width', node.isCrux ? '3' : '1')
        if (node.baseScore < 0.3) {
          circle.setAttribute('stroke-dasharray', '4,2')
        }
        g.appendChild(circle)

        // Label
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('y', String(radius + 12))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('fill', 'rgba(255,255,255,0.7)')
        text.setAttribute('font-size', '10')
        text.textContent = node.label.length > 25 ? node.label.slice(0, 25) + '...' : node.label
        g.appendChild(text)

        nodeGroup.appendChild(g)
      }
    })

    return () => { simulation.stop() }
  }, [nodes, edges, pidA, pidB])

  return (
    <div className="w-full h-full min-h-[400px] bg-background rounded-lg border border-card-border">
      <svg ref={svgRef} className="w-full h-full" style={{ minHeight: 400 }} />
    </div>
  )
}

function buildPersonaGraphData(
  qbaf: PersonaQBAF,
  communityGraph: CommunityGraph | null,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const cruxNodeIds = new Set<string>()
  if (communityGraph) {
    for (const cNode of communityGraph.nodes) {
      if (cNode.classification === 'crux') {
        for (const id of cNode.mergedFrom) cruxNodeIds.add(id)
      }
    }
  }

  const nodes: GraphNode[] = qbaf.nodes.map(n => ({
    id: n.id,
    label: n.claim,
    strength: n.dialecticalStrength,
    baseScore: n.baseScore,
    type: n.type,
    personaId: n.personaId,
    isCrux: cruxNodeIds.has(n.id),
  }))

  const edges: GraphEdge[] = qbaf.edges.map(e => ({
    source: e.from,
    target: e.to,
    type: e.type,
    weight: e.weight,
  }))

  return { nodes, edges }
}

function buildCommunityGraphData(
  graph: CommunityGraph,
  pidA: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = graph.nodes.map(n => ({
    id: n.id,
    label: n.claim,
    strength: n.communityStrength,
    baseScore: Object.values(n.baseScores).reduce((s, v) => s + v, 0) / Math.max(Object.values(n.baseScores).length, 1),
    type: n.classification,
    personaId: Object.keys(n.baseScores).length === 1 ? Object.keys(n.baseScores)[0] : undefined,
    isCrux: n.classification === 'crux',
  }))

  const edges: GraphEdge[] = graph.edges.map(e => ({
    source: e.from,
    target: e.to,
    type: e.type,
    weight: e.weight,
  }))

  return { nodes, edges }
}

function getNodeFill(node: GraphNode, pidA: string, pidB: string): string {
  if (!node.personaId) return 'rgba(120,120,120,0.8)' // merged
  if (node.personaId === pidA) return '#dc2626'
  if (node.personaId === pidB) return 'rgba(255,255,255,0.9)'
  return 'rgba(120,120,120,0.8)'
}

function createMarker(ns: string, id: string, color: string): SVGMarkerElement {
  const marker = document.createElementNS(ns, 'marker') as SVGMarkerElement
  marker.setAttribute('id', id)
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '10')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerWidth', '6')
  marker.setAttribute('markerHeight', '6')
  marker.setAttribute('orient', 'auto-start-reverse')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
  path.setAttribute('fill', color)
  marker.appendChild(path)
  return marker
}
