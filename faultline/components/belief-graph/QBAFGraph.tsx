'use client'

// ─── QBAF Force-Directed Graph Visualization ─────────────────
// Features: D3-force layout, scroll-to-zoom, drag-to-pan, revised-edge highlighting

import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import * as d3Force from 'd3-force'
import type { PersonaQBAF, CommunityGraph } from '@/lib/belief-graph/types'

// ─── Internal Types ──────────────────────────────────────────

interface GraphNode {
  id: string
  label: string
  strength: number      // dialecticalStrength (σ)
  baseScore: number     // τ
  type: string          // 'root' | 'pro' | 'con' | 'evidence' or classification
  personaId?: string
  isCrux?: boolean
  isConsensus?: boolean
  isRevised?: boolean
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
  isRevised?: boolean
}

interface QBAFGraphProps {
  qbafs: Record<string, PersonaQBAF>
  communityGraph: CommunityGraph | null
  personaIds: string[]
  viewMode: string // persona ID or 'community'
  revisedNodeIds?: Set<string>
}

interface TooltipState {
  node: GraphNode
  x: number
  y: number
}

// ─── Constants ───────────────────────────────────────────────

const NODE_RADIUS = {
  root: 18,
  pro: 10,
  con: 10,
  evidence: 6,
}

// ─── Component ───────────────────────────────────────────────

export function QBAFGraph({ qbafs, communityGraph, personaIds, viewMode, revisedNodeIds }: QBAFGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const simulationRef = useRef<d3Force.Simulation<d3Force.SimulationNodeDatum, undefined> | null>(null)
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startTx: number; startTy: number } | null>(null)

  const isCommunity = viewMode === 'community'

  const { nodes, edges } = useMemo(() => {
    if (isCommunity && communityGraph) {
      return buildCommunityGraphData(communityGraph)
    }
    const targetQbaf = qbafs[viewMode]
    if (!targetQbaf) return { nodes: [], edges: [] }
    return buildPersonaGraphData(targetQbaf, communityGraph, revisedNodeIds)
  }, [qbafs, communityGraph, viewMode, isCommunity, revisedNodeIds])

  const handleNodeHover = useCallback((node: GraphNode | null, clientX?: number, clientY?: number) => {
    if (!node || clientX === undefined || clientY === undefined) {
      setTooltip(null)
      return
    }
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setTooltip({
      node,
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
  }, [])

  // Reset zoom when viewMode changes
  useEffect(() => {
    transformRef.current = { x: 0, y: 0, k: 1 }
  }, [viewMode])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = svgRef.current
    const width = svg.clientWidth || 600
    const height = svg.clientHeight || 400

    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const simNodes = nodes.map(n => ({ ...n }))
    const simEdges = edges.map(e => ({ ...e }))

    if (simulationRef.current) simulationRef.current.stop()

    const simulation = d3Force.forceSimulation(simNodes as d3Force.SimulationNodeDatum[])
      .force('link', d3Force.forceLink(simEdges as d3Force.SimulationLinkDatum<d3Force.SimulationNodeDatum>[])
        .id((d: unknown) => (d as GraphNode).id)
        .distance(100))
      .force('charge', d3Force.forceManyBody().strength(-250))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collision', d3Force.forceCollide().radius(35))

    simulationRef.current = simulation

    const ns = 'http://www.w3.org/2000/svg'

    const defs = document.createElementNS(ns, 'defs')
    defs.appendChild(createMarker(ns, 'arrow-attack', '#dc2626'))
    defs.appendChild(createMarker(ns, 'arrow-support', 'rgba(255,255,255,0.6)'))
    defs.appendChild(createMarker(ns, 'arrow-revised', '#f59e0b'))
    defs.appendChild(createGlowFilter(ns))
    svg.appendChild(defs)

    // Zoom/pan container group
    const worldGroup = document.createElementNS(ns, 'g')
    svg.appendChild(worldGroup)

    const edgeGroup = document.createElementNS(ns, 'g')
    worldGroup.appendChild(edgeGroup)

    const nodeGroup = document.createElementNS(ns, 'g')
    worldGroup.appendChild(nodeGroup)

    // Apply transform
    function applyTransform() {
      const t = transformRef.current
      worldGroup.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`)
    }
    applyTransform()

    // Wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const t = transformRef.current
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newK = Math.max(0.2, Math.min(5, t.k * factor))

      // Zoom toward cursor position
      t.x = mx - (mx - t.x) * (newK / t.k)
      t.y = my - (my - t.y) * (newK / t.k)
      t.k = newK
      applyTransform()
    }
    svg.addEventListener('wheel', onWheel, { passive: false })

    // Pan via mouse drag
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      panRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startTx: transformRef.current.x,
        startTy: transformRef.current.y,
      }
      svg.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      const pan = panRef.current
      if (!pan?.active) return
      transformRef.current.x = pan.startTx + (e.clientX - pan.startX)
      transformRef.current.y = pan.startTy + (e.clientY - pan.startY)
      applyTransform()
    }
    const onMouseUp = () => {
      if (panRef.current) panRef.current.active = false
      svg.style.cursor = 'grab'
    }
    svg.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    svg.style.cursor = 'grab'

    simulation.on('tick', () => {
      // ── Draw edges ──
      while (edgeGroup.firstChild) edgeGroup.removeChild(edgeGroup.firstChild)
      for (const edge of simEdges) {
        const src = edge.source as unknown as GraphNode
        const tgt = edge.target as unknown as GraphNode
        if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue

        const line = document.createElementNS(ns, 'line')
        line.setAttribute('x1', String(src.x))
        line.setAttribute('y1', String(src.y))
        line.setAttribute('x2', String(tgt.x))
        line.setAttribute('y2', String(tgt.y))

        if ((edge as GraphEdge).isRevised) {
          // Revised edge: amber/gold, thicker, glowing
          line.setAttribute('stroke', '#f59e0b')
          line.setAttribute('stroke-width', String(2.5 + edge.weight * 1.5))
          line.setAttribute('stroke-opacity', '0.9')
          line.setAttribute('marker-end', 'url(#arrow-revised)')
          if (edge.type === 'attack') {
            line.setAttribute('stroke-dasharray', '6,3')
          }
        } else if (edge.type === 'attack') {
          line.setAttribute('stroke', '#dc2626')
          line.setAttribute('stroke-dasharray', '6,3')
          line.setAttribute('stroke-width', String(1 + edge.weight * 1.5))
          line.setAttribute('marker-end', 'url(#arrow-attack)')
        } else {
          line.setAttribute('stroke', 'rgba(255,255,255,0.35)')
          line.setAttribute('stroke-width', String(1 + edge.weight * 1.5))
          line.setAttribute('marker-end', 'url(#arrow-support)')
        }
        edgeGroup.appendChild(line)
      }

      // ── Draw nodes ──
      while (nodeGroup.firstChild) nodeGroup.removeChild(nodeGroup.firstChild)
      for (const node of simNodes as GraphNode[]) {
        if (node.x == null || node.y == null) continue

        const g = document.createElementNS(ns, 'g')
        g.setAttribute('transform', `translate(${node.x},${node.y})`)
        g.style.cursor = 'pointer'

        const isRoot = node.type === 'root'
        const isCon = node.type === 'con'
        const isEvidence = node.type === 'evidence'
        const radius = getNodeRadius(node)
        const fill = getNodeFill(node, isCommunity)
        const strokeColor = node.isRevised ? '#f59e0b' : getNodeStroke(node, isCommunity)
        const strokeWidth = node.isRevised ? 2.5 : (node.isCrux ? 2.5 : (isRoot ? 2 : 1))

        if (node.isCrux && isCommunity) {
          g.setAttribute('filter', 'url(#crux-glow)')
        }

        if (isEvidence) {
          const size = radius * 1.3
          const diamond = document.createElementNS(ns, 'polygon')
          diamond.setAttribute('points', `0,${-size} ${size},0 0,${size} ${-size},0`)
          diamond.setAttribute('fill', fill)
          diamond.setAttribute('stroke', strokeColor)
          diamond.setAttribute('stroke-width', String(strokeWidth))
          g.appendChild(diamond)
        } else {
          const circle = document.createElementNS(ns, 'circle')
          circle.setAttribute('r', String(radius))
          circle.setAttribute('fill', fill)
          circle.setAttribute('stroke', strokeColor)
          circle.setAttribute('stroke-width', String(strokeWidth))
          if (isCon && !node.isRevised) {
            circle.setAttribute('stroke-dasharray', '3,2')
          }
          g.appendChild(circle)

          if (isRoot) {
            const outerRing = document.createElementNS(ns, 'circle')
            outerRing.setAttribute('r', String(radius + 4))
            outerRing.setAttribute('fill', 'none')
            outerRing.setAttribute('stroke', strokeColor)
            outerRing.setAttribute('stroke-width', '1')
            outerRing.setAttribute('opacity', '0.6')
            g.appendChild(outerRing)
          }
        }

        if (isRoot) {
          const text = document.createElementNS(ns, 'text')
          text.setAttribute('y', String(radius + 16))
          text.setAttribute('text-anchor', 'middle')
          text.setAttribute('fill', 'rgba(255,255,255,0.8)')
          text.setAttribute('font-size', '11')
          text.setAttribute('font-weight', '500')
          const maxLen = 30
          text.textContent = node.label.length > maxLen
            ? node.label.slice(0, maxLen) + '\u2026'
            : node.label
          g.appendChild(text)
        }

        const hitArea = document.createElementNS(ns, 'circle')
        hitArea.setAttribute('r', String(Math.max(radius + 6, 14)))
        hitArea.setAttribute('fill', 'transparent')
        hitArea.setAttribute('stroke', 'none')
        g.appendChild(hitArea)

        const capturedNode = { ...node }
        g.addEventListener('mouseenter', (e: MouseEvent) => {
          handleNodeHover(capturedNode, e.clientX, e.clientY)
        })
        g.addEventListener('mousemove', (e: MouseEvent) => {
          handleNodeHover(capturedNode, e.clientX, e.clientY)
        })
        g.addEventListener('mouseleave', () => {
          handleNodeHover(null)
        })

        nodeGroup.appendChild(g)
      }
    })

    return () => {
      simulation.stop()
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [nodes, edges, isCommunity, handleNodeHover])

  return (
    <div ref={containerRef} className="relative w-full bg-background rounded-lg border border-card-border flex-1 min-h-0">
      <svg ref={svgRef} className="w-full h-full" />

      {tooltip && (
        <NodeTooltip tooltip={tooltip} isCommunity={isCommunity} />
      )}

      <EdgeLegend hasRevised={edges.some(e => e.isRevised)} />
    </div>
  )
}

// ─── Tooltip Component ───────────────────────────────────────

function NodeTooltip({ tooltip, isCommunity }: { tooltip: TooltipState; isCommunity: boolean }) {
  const { node, x, y } = tooltip
  const left = x + 12
  const top = y - 10

  const typeLabel = isCommunity
    ? node.type
    : node.type

  return (
    <div
      className="absolute z-50 pointer-events-none max-w-[280px] px-3 py-2 rounded border border-card-border bg-card-bg shadow-lg"
      style={{ left, top }}
    >
      <p className="text-xs text-foreground font-medium leading-snug mb-1.5">
        {node.label}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted font-mono">
        <span>
          type: <span className="text-foreground">{typeLabel}</span>
        </span>
        <span>
          {'\u03C4'}: <span className="text-foreground">{node.baseScore.toFixed(2)}</span>
        </span>
        <span>
          {'\u03C3'}: <span className="text-foreground">{node.strength.toFixed(2)}</span>
        </span>
      </div>
      {node.isCrux && (
        <span className="inline-block mt-1 text-[10px] font-mono text-accent">crux</span>
      )}
      {node.isRevised && (
        <span className="inline-block mt-1 ml-2 text-[10px] font-mono text-amber-400">revised</span>
      )}
    </div>
  )
}

// ─── Edge Legend ──────────────────────────────────────────────

function EdgeLegend({ hasRevised }: { hasRevised: boolean }) {
  return (
    <div className="absolute bottom-3 left-3 px-3 py-2 rounded border border-card-border bg-card-bg/90 backdrop-blur-sm">
      <div className="flex flex-col gap-1.5 text-[10px] text-muted">
        <div className="flex items-center gap-2">
          <svg width="28" height="6">
            <line x1="0" y1="3" x2="28" y2="3" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          </svg>
          <span>support</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="28" height="6">
            <line x1="0" y1="3" x2="28" y2="3" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="6,3" />
          </svg>
          <span>attack</span>
        </div>
        {hasRevised && (
          <div className="flex items-center gap-2">
            <svg width="28" height="6">
              <line x1="0" y1="3" x2="28" y2="3" stroke="#f59e0b" strokeWidth="2.5" />
            </svg>
            <span className="text-amber-400">revised</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Data Builders ───────────────────────────────────────────

function buildPersonaGraphData(
  qbaf: PersonaQBAF,
  communityGraph: CommunityGraph | null,
  revisedNodeIds?: Set<string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const cruxNodeIds = new Set<string>()
  if (communityGraph) {
    for (const cNode of communityGraph.nodes) {
      if (cNode.classification === 'crux') {
        for (const id of cNode.mergedFrom) cruxNodeIds.add(id)
      }
    }
  }

  const revisedSet = revisedNodeIds ?? new Set<string>()

  const nodes: GraphNode[] = qbaf.nodes.map(n => ({
    id: n.id,
    label: n.claim,
    strength: n.dialecticalStrength,
    baseScore: n.baseScore,
    type: n.type,
    personaId: n.personaId,
    isCrux: cruxNodeIds.has(n.id),
    isConsensus: false,
    isRevised: revisedSet.has(n.id),
  }))

  const edges: GraphEdge[] = qbaf.edges.map(e => ({
    source: e.from,
    target: e.to,
    type: e.type,
    weight: e.weight,
    // Edge is revised if either endpoint was revised
    isRevised: revisedSet.has(e.from) || revisedSet.has(e.to),
  }))

  return { nodes, edges }
}

function buildCommunityGraphData(
  graph: CommunityGraph,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = graph.nodes.map(n => ({
    id: n.id,
    label: n.claim,
    strength: n.communityStrength,
    baseScore: Object.values(n.baseScores).reduce((s, v) => s + v, 0) / Math.max(Object.values(n.baseScores).length, 1),
    type: n.classification,
    personaId: Object.keys(n.baseScores).length === 1 ? Object.keys(n.baseScores)[0] : undefined,
    isCrux: n.classification === 'crux',
    isConsensus: n.classification === 'consensus',
  }))

  const edges: GraphEdge[] = graph.edges.map(e => ({
    source: e.from,
    target: e.to,
    type: e.type,
    weight: e.weight,
  }))

  return { nodes, edges }
}

// ─── Visual Helpers ──────────────────────────────────────────

function getNodeRadius(node: GraphNode): number {
  const baseType = node.type as keyof typeof NODE_RADIUS
  return NODE_RADIUS[baseType] ?? 10
}

function getNodeFill(node: GraphNode, isCommunity: boolean): string {
  if (isCommunity) {
    if (node.isCrux) return 'rgba(220, 38, 38, 0.15)'
    if (node.isConsensus) return 'rgba(255, 255, 255, 0.9)'
    return 'rgba(255, 255, 255, 0.25)'
  }

  if (node.type === 'con') return 'transparent'
  if (node.type === 'evidence') return 'rgba(255, 255, 255, 0.5)'
  return 'rgba(255, 255, 255, 0.85)'
}

function getNodeStroke(node: GraphNode, isCommunity: boolean): string {
  if (isCommunity && node.isCrux) return '#dc2626'
  if (node.type === 'con') return 'rgba(255, 255, 255, 0.6)'
  return 'rgba(255, 255, 255, 0.4)'
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

function createGlowFilter(ns: string): SVGFilterElement {
  const filter = document.createElementNS(ns, 'filter') as SVGFilterElement
  filter.setAttribute('id', 'crux-glow')
  filter.setAttribute('x', '-50%')
  filter.setAttribute('y', '-50%')
  filter.setAttribute('width', '200%')
  filter.setAttribute('height', '200%')

  const blur = document.createElementNS(ns, 'feGaussianBlur')
  blur.setAttribute('in', 'SourceGraphic')
  blur.setAttribute('stdDeviation', '4')
  blur.setAttribute('result', 'blur')
  filter.appendChild(blur)

  const colorMatrix = document.createElementNS(ns, 'feColorMatrix')
  colorMatrix.setAttribute('in', 'blur')
  colorMatrix.setAttribute('type', 'matrix')
  colorMatrix.setAttribute('values', '1 0 0 0 0.86  0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0.6 0')
  colorMatrix.setAttribute('result', 'glow')
  filter.appendChild(colorMatrix)

  const merge = document.createElementNS(ns, 'feMerge')
  const mergeGlow = document.createElementNS(ns, 'feMergeNode')
  mergeGlow.setAttribute('in', 'glow')
  merge.appendChild(mergeGlow)
  const mergeSource = document.createElementNS(ns, 'feMergeNode')
  mergeSource.setAttribute('in', 'SourceGraphic')
  merge.appendChild(mergeSource)
  filter.appendChild(merge)

  return filter
}
