'use client'

// ─── Belief Graph Visualization for Persona Cards ───────────
// Canvas-based force-directed graph with zoom/pan.
// Edges are the primary visual: directed arrows colored by polarity.
// Nodes are neutral dots sized by connectivity.

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3Force from 'd3-force'
import type { BeliefGraph } from '@/lib/types'

interface SimNode {
  id: string
  concept: string
  type: string
  groundingCount: number
  degree: number
  x: number
  y: number
  vx: number
  vy: number
}

interface SimEdge {
  source: SimNode | string
  target: SimNode | string
  polarity: 1 | -1
  confidence: number
}

interface BeliefGraphMiniProps {
  graph: BeliefGraph
}

// Edge colors by polarity — these are the primary visual signal
const EDGE_SUPPORT = 'rgba(255, 255, 255, 0.35)'    // white = supports/causes
const EDGE_UNDERMINE = 'rgba(220, 38, 38, 0.55)'     // red = undermines/contradicts

const MAX_VISIBLE_NODES = 150

export function BeliefGraphMini({ graph }: BeliefGraphMiniProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [showAll, setShowAll] = useState(false)
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const simRef = useRef<d3Force.Simulation<d3Force.SimulationNodeDatum, undefined> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startTx: number; startTy: number }>({
    active: false, startX: 0, startY: 0, startTx: 0, startTy: 0
  })

  const needsTruncation = graph.nodes.length > MAX_VISIBLE_NODES
  const shouldTruncate = needsTruncation && !showAll

  // Draw arrowhead at the end of an edge (pointing from source → target)
  const drawArrow = useCallback((
    ctx: CanvasRenderingContext2D,
    fromX: number, fromY: number,
    toX: number, toY: number,
    nodeRadius: number,
    k: number,
    color: string,
  ) => {
    const dx = toX - fromX
    const dy = toY - fromY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) return

    // Unit vector
    const ux = dx / len
    const uy = dy / len

    // Arrow tip stops at node edge
    const tipX = toX - ux * nodeRadius
    const tipY = toY - uy * nodeRadius

    const arrowLen = Math.max(5, 8 / Math.sqrt(k))
    const arrowWidth = arrowLen * 0.5

    // Base of arrowhead
    const baseX = tipX - ux * arrowLen
    const baseY = tipY - uy * arrowLen

    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(baseX - uy * arrowWidth, baseY + ux * arrowWidth)
    ctx.lineTo(baseX + uy * arrowWidth, baseY - ux * arrowWidth)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { x: tx, y: ty, k } = transformRef.current

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(k, k)

    // Build a quick lookup for node radius (need it for arrow placement)
    const nodeRadiusMap = new Map<string, number>()
    for (const node of nodesRef.current) {
      const r = (2.5 + Math.min(node.degree, 10) * 0.5) / Math.sqrt(k)
      nodeRadiusMap.set(node.id, r)
    }

    // Draw edges with directional arrows
    for (const edge of edgesRef.current) {
      const src = edge.source as SimNode
      const tgt = edge.target as SimNode
      if (src.x == null || tgt.x == null) continue

      const color = edge.polarity === -1 ? EDGE_UNDERMINE : EDGE_SUPPORT
      const lineWidth = (0.5 + edge.confidence * 1.5) / k

      // Line
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      if (edge.polarity === -1) {
        ctx.setLineDash([4 / k, 2 / k])
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Arrowhead (source → target = cause → effect)
      const tgtRadius = nodeRadiusMap.get(tgt.id) || 4
      drawArrow(ctx, src.x, src.y, tgt.x, tgt.y, tgtRadius, k, color)
    }

    // Draw nodes — neutral white dots, sized by degree
    for (const node of nodesRef.current) {
      if (node.x == null) continue
      const radius = nodeRadiusMap.get(node.id) || 3
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 0.5 / k
      ctx.stroke()
    }

    ctx.restore()
  }, [drawArrow])

  useEffect(() => {
    if (!canvasRef.current || graph.nodes.length === 0) return

    const canvas = canvasRef.current
    const width = canvas.clientWidth || 600
    const height = canvas.clientHeight || 500

    // Compute degree for each node
    const degreeMap = new Map<string, number>()
    for (const e of graph.edges) {
      degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1)
      degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1)
    }

    // Select nodes: if truncating, pick top by degree
    let selectedIds: Set<string>
    if (shouldTruncate) {
      const sorted = [...graph.nodes].sort((a, b) =>
        (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0)
      )
      selectedIds = new Set<string>()
      for (const n of sorted) {
        if (selectedIds.size >= MAX_VISIBLE_NODES) break
        selectedIds.add(n.id)
      }
    } else {
      selectedIds = new Set(graph.nodes.map(n => n.id))
    }

    const simNodes: SimNode[] = graph.nodes
      .filter(n => selectedIds.has(n.id))
      .map(n => ({
        id: n.id,
        concept: n.concept,
        type: n.type,
        groundingCount: n.grounding.length,
        degree: degreeMap.get(n.id) || 0,
        x: width / 2 + (Math.random() - 0.5) * width * 0.6,
        y: height / 2 + (Math.random() - 0.5) * height * 0.6,
        vx: 0,
        vy: 0,
      }))

    const nodeIdSet = new Set(simNodes.map(n => n.id))
    const simEdges: SimEdge[] = graph.edges
      .filter(e => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
      .map(e => ({
        source: e.from,
        target: e.to,
        polarity: e.polarity,
        confidence: e.confidence,
      }))

    nodesRef.current = simNodes
    edgesRef.current = simEdges

    // Scale force parameters by graph size
    const n = simNodes.length
    const chargeStrength = n > 300 ? -15 : n > 100 ? -30 : -60
    const linkDist = n > 300 ? 20 : n > 100 ? 35 : 50

    // Reset transform — zoom to fit
    const initialK = n > 300 ? 0.4 : n > 100 ? 0.6 : 0.9
    transformRef.current = {
      x: width * (1 - initialK) / 2,
      y: height * (1 - initialK) / 2,
      k: initialK
    }

    const simulation = d3Force.forceSimulation(simNodes as unknown as d3Force.SimulationNodeDatum[])
      .force('link', d3Force.forceLink(simEdges as unknown as d3Force.SimulationLinkDatum<d3Force.SimulationNodeDatum>[])
        .id((d: unknown) => (d as SimNode).id)
        .distance(linkDist))
      .force('charge', d3Force.forceManyBody().strength(chargeStrength))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collision', d3Force.forceCollide().radius(n > 200 ? 4 : 8))
      .alphaDecay(n > 300 ? 0.03 : 0.02)

    simRef.current = simulation

    simulation.on('tick', draw)

    return () => { simulation.stop() }
  }, [graph, showAll, shouldTruncate, draw])

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const t = transformRef.current
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newK = Math.max(0.1, Math.min(5, t.k * factor))

    t.x = mouseX - (mouseX - t.x) * (newK / t.k)
    t.y = mouseY - (mouseY - t.y) * (newK / t.k)
    t.k = newK

    draw()
  }, [draw])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTx: transformRef.current.x,
      startTy: transformRef.current.y,
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const d = dragRef.current
    if (d.active) {
      transformRef.current.x = d.startTx + (e.clientX - d.startX)
      transformRef.current.y = d.startTy + (e.clientY - d.startY)
      draw()
      return
    }

    // Hit test for hover tooltip
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const t = transformRef.current

    const gx = (mouseX - t.x) / t.k
    const gy = (mouseY - t.y) / t.k

    let closest: SimNode | null = null
    let closestDist = 12 / t.k

    for (const node of nodesRef.current) {
      if (node.x == null) continue
      const dx = node.x - gx
      const dy = node.y - gy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist) {
        closestDist = dist
        closest = node
      }
    }

    setHoveredNode(closest)
    if (closest) {
      setTooltipPos({ x: mouseX, y: mouseY })
    }
  }, [draw])

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false
  }, [])

  // Count edge types for legend stats
  const supportCount = graph.edges.filter(e => e.polarity === 1).length
  const undermineCount = graph.edges.filter(e => e.polarity === -1).length

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-card-border bg-background"
        style={{ height: 500, cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setHoveredNode(null) }}
      />

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="absolute pointer-events-none bg-card-bg border border-card-border rounded px-3 py-2 text-xs max-w-[280px] z-10"
          style={{
            left: Math.min(tooltipPos.x + 14, (canvasRef.current?.clientWidth || 600) - 290),
            top: Math.max(tooltipPos.y - 50, 4),
          }}
        >
          <div className="text-foreground font-medium leading-snug">{hoveredNode.concept}</div>
          <div className="text-muted mt-0.5">
            {hoveredNode.type.replace('_', ' ')} · {hoveredNode.groundingCount} source{hoveredNode.groundingCount !== 1 ? 's' : ''} · {hoveredNode.degree} connections
          </div>
        </div>
      )}

      {/* Legend + controls */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <svg width="20" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" /><polygon points="14,1 20,4 14,7" fill="rgba(255,255,255,0.5)" /></svg>
            Supports ({supportCount})
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <svg width="20" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3,1.5" /><polygon points="14,1 20,4 14,7" fill="#dc2626" /></svg>
            Undermines ({undermineCount})
          </div>
        </div>

        {needsTruncation && (
          <button
            onClick={() => setShowAll(prev => !prev)}
            className="text-[10px] text-muted hover:text-foreground transition-colors"
          >
            {showAll ? `Show top ${MAX_VISIBLE_NODES}` : `Show all ${graph.nodes.length}`}
          </button>
        )}
      </div>

      <p className="text-[10px] text-muted text-center mt-1">
        Arrows show cause → effect · Scroll to zoom · Drag to pan · Hover nodes for details
      </p>
    </div>
  )
}
