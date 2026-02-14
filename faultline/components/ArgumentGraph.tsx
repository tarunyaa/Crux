'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import type { Argument, Attack, ValidationResult, Labelling, Label } from '@/lib/types/graph'

// ─── Types ──────────────────────────────────────────────────

interface PersonaMeta {
  id: string
  name: string
  picture: string
}

interface ArgumentGraphProps {
  arguments: Argument[]
  attacks: Attack[]
  validationResults: ValidationResult[]
  labelling: Labelling | null
  personaMetas: PersonaMeta[]
}

interface ArgNode extends SimulationNodeDatum {
  id: string
  speakerId: string
  claim: string
  premises: string[]
  assumptions: string[]
  evidence: string[]
  round: number
  label: Label
}

interface AttackLink extends SimulationLinkDatum<ArgNode> {
  id: string
  type: 'rebut' | 'undermine' | 'undercut'
  counterProposition: string
  rationale: string
  confidence: number
  speakerId: string
  round: number
  valid: boolean
  attackStrength: number
  targetComponent: string
  targetIndex: number
}

// ─── Constants ──────────────────────────────────────────────

const SPEAKER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

const LABEL_FILLS: Record<Label, string> = {
  IN: '#166534',   // green-900
  OUT: '#7f1d1d',  // red-900
  UNDEC: '#78350f', // amber-900
}

const LABEL_STROKES: Record<Label, string> = {
  IN: '#22c55e',   // green-500
  OUT: '#ef4444',  // red-500
  UNDEC: '#f59e0b', // amber-500
}

const ATTACK_DASH: Record<string, string> = {
  rebut: '',           // solid
  undermine: '6,3',    // dashed
  undercut: '2,3',     // dotted
}

const ATTACK_COLORS: Record<string, string> = {
  rebut: '#ef4444',
  undermine: '#f59e0b',
  undercut: '#a855f7',
}

const NODE_RADIUS_INITIAL = 22
const NODE_RADIUS_COUNTER = 16

// ─── Helpers ────────────────────────────────────────────────

function getLabelMap(labelling: Labelling | null): Map<string, Label> {
  if (!labelling) return new Map()
  if (labelling.labels instanceof Map) return labelling.labels as Map<string, Label>
  return new Map(Object.entries(labelling.labels as Record<string, string>)) as Map<string, Label>
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
}

// ─── Component ──────────────────────────────────────────────

export default function ArgumentGraph({
  arguments: args,
  attacks,
  validationResults,
  labelling,
  personaMetas,
}: ArgumentGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [nodes, setNodes] = useState<ArgNode[]>([])
  const [links, setLinks] = useState<AttackLink[]>([])
  const simulationRef = useRef<ReturnType<typeof forceSimulation<ArgNode>> | null>(null)

  const metaMap = useMemo(() => new Map(personaMetas.map(p => [p.id, p])), [personaMetas])
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const uniqueSpeakers = [...new Set(args.map(a => a.speakerId))]
    uniqueSpeakers.forEach((sid, i) => map.set(sid, SPEAKER_COLORS[i % SPEAKER_COLORS.length]))
    return map
  }, [args])

  const validationMap = useMemo(
    () => new Map(validationResults.map(v => [v.attackId, v])),
    [validationResults],
  )
  const labelMap = useMemo(() => getLabelMap(labelling), [labelling])

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: Math.max(400, entry.contentRect.width),
          height: Math.max(350, entry.contentRect.height),
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Build / update simulation ──
  useEffect(() => {
    const { width, height } = dimensions

    // Build nodes — reuse positions from previous nodes if they exist
    const prevNodeMap = new Map(nodes.map(n => [n.id, n]))
    const newNodes: ArgNode[] = args.map(a => {
      const prev = prevNodeMap.get(a.id)
      return {
        id: a.id,
        speakerId: a.speakerId,
        claim: a.claim,
        premises: a.premises,
        assumptions: a.assumptions,
        evidence: a.evidence,
        round: a.round,
        label: labelMap.get(a.id) ?? 'UNDEC',
        x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
      }
    })

    const nodeIdSet = new Set(newNodes.map(n => n.id))

    // Build links
    const newLinks: AttackLink[] = attacks
      .filter(atk => nodeIdSet.has(atk.fromArgId) && nodeIdSet.has(atk.toArgId))
      .map(atk => {
        const val = validationMap.get(atk.id)
        return {
          id: atk.id,
          source: atk.fromArgId,
          target: atk.toArgId,
          type: atk.type,
          counterProposition: atk.counterProposition,
          rationale: atk.rationale,
          confidence: atk.confidence,
          speakerId: atk.speakerId,
          round: atk.round,
          valid: val?.valid ?? true,
          attackStrength: val?.attackStrength ?? 0.5,
          targetComponent: atk.target.component,
          targetIndex: atk.target.index,
        }
      })

    // Group speakers for clustering
    const speakerIds = [...new Set(args.map(a => a.speakerId))]
    const speakerAngle = new Map<string, number>()
    speakerIds.forEach((sid, i) => {
      speakerAngle.set(sid, (i / speakerIds.length) * 2 * Math.PI)
    })

    // Stop previous simulation
    if (simulationRef.current) simulationRef.current.stop()

    const sim = forceSimulation<ArgNode>(newNodes)
      .force('link', forceLink<ArgNode, AttackLink>(newLinks)
        .id(d => d.id)
        .distance(120)
        .strength(0.3),
      )
      .force('charge', forceManyBody().strength(-250))
      .force('center', forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', forceCollide<ArgNode>(d => d.round === 0 ? NODE_RADIUS_INITIAL + 4 : NODE_RADIUS_COUNTER + 4))
      // Cluster by speaker
      .force('clusterX', forceX<ArgNode>(d => {
        const angle = speakerAngle.get(d.speakerId) ?? 0
        return width / 2 + Math.cos(angle) * (width * 0.2)
      }).strength(0.15))
      .force('clusterY', forceY<ArgNode>(d => {
        const angle = speakerAngle.get(d.speakerId) ?? 0
        return height / 2 + Math.sin(angle) * (height * 0.2)
      }).strength(0.15))
      .alphaDecay(0.03)
      .on('tick', () => {
        // Clamp nodes within bounds
        for (const n of newNodes) {
          const r = n.round === 0 ? NODE_RADIUS_INITIAL : NODE_RADIUS_COUNTER
          n.x = Math.max(r + 4, Math.min(width - r - 4, n.x ?? width / 2))
          n.y = Math.max(r + 4, Math.min(height - r - 4, n.y ?? height / 2))
        }
        setNodes([...newNodes])
        setLinks([...newLinks])
      })

    simulationRef.current = sim

    return () => { sim.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args, attacks, validationResults, labelling, dimensions])

  // ── Hover handlers ──
  const handleNodeEnter = useCallback((nodeId: string, e: React.MouseEvent) => {
    setHoveredNode(nodeId)
    setHoveredEdge(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleEdgeEnter = useCallback((edgeId: string, e: React.MouseEvent) => {
    setHoveredEdge(edgeId)
    setHoveredNode(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoveredNode || hoveredEdge) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [hoveredNode, hoveredEdge])

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null)
    setHoveredEdge(null)
    setTooltipPos(null)
  }, [])

  // ── Derived: connected set for hover highlighting ──
  const connectedSet = useMemo(() => {
    const set = new Set<string>()
    if (hoveredNode) {
      set.add(hoveredNode)
      for (const link of links) {
        const srcId = typeof link.source === 'string' ? link.source : (link.source as ArgNode).id
        const tgtId = typeof link.target === 'string' ? link.target : (link.target as ArgNode).id
        if (srcId === hoveredNode || tgtId === hoveredNode) {
          set.add(srcId)
          set.add(tgtId)
          set.add(link.id)
        }
      }
    }
    if (hoveredEdge) {
      set.add(hoveredEdge)
      const link = links.find(l => l.id === hoveredEdge)
      if (link) {
        const srcId = typeof link.source === 'string' ? link.source : (link.source as ArgNode).id
        const tgtId = typeof link.target === 'string' ? link.target : (link.target as ArgNode).id
        set.add(srcId)
        set.add(tgtId)
      }
    }
    return set
  }, [hoveredNode, hoveredEdge, links])

  const isHighlighting = hoveredNode !== null || hoveredEdge !== null

  // ── Tooltip content ──
  const tooltipContent = useMemo(() => {
    if (hoveredNode) {
      const node = nodes.find(n => n.id === hoveredNode)
      if (!node) return null
      const meta = metaMap.get(node.speakerId)
      return {
        kind: 'node' as const,
        label: node.label,
        speaker: meta?.name ?? node.speakerId,
        speakerColor: speakerColorMap.get(node.speakerId) ?? '#888',
        claim: node.claim,
        premises: node.premises,
        assumptions: node.assumptions,
        evidence: node.evidence,
        round: node.round,
        id: node.id,
      }
    }
    if (hoveredEdge) {
      const link = links.find(l => l.id === hoveredEdge)
      if (!link) return null
      const meta = metaMap.get(link.speakerId)
      return {
        kind: 'edge' as const,
        type: link.type,
        speaker: meta?.name ?? link.speakerId,
        speakerColor: speakerColorMap.get(link.speakerId) ?? '#888',
        counterProposition: link.counterProposition,
        rationale: link.rationale,
        confidence: link.confidence,
        valid: link.valid,
        attackStrength: link.attackStrength,
        targetComponent: link.targetComponent,
        targetIndex: link.targetIndex,
        round: link.round,
        id: link.id,
      }
    }
    return null
  }, [hoveredNode, hoveredEdge, nodes, links, metaMap, speakerColorMap])

  // ── Render ──
  const { width, height } = dimensions

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl border border-card-border bg-card-bg overflow-hidden"
      style={{ minHeight: 400, height: '100%' }}
      onMouseMove={handleMouseMove}
    >
      {/* Empty state */}
      {args.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
          Waiting for arguments...
        </div>
      )}

      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block"
      >
        {/* Arrow markers */}
        <defs>
          {['rebut', 'undermine', 'undercut'].map(type => (
            <marker
              key={type}
              id={`arrow-${type}`}
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,3 L0,6 Z" fill={ATTACK_COLORS[type]} />
            </marker>
          ))}
          {/* Dimmed variants for non-highlighted */}
          {['rebut', 'undermine', 'undercut'].map(type => (
            <marker
              key={`${type}-dim`}
              id={`arrow-${type}-dim`}
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,3 L0,6 Z" fill={ATTACK_COLORS[type]} opacity={0.15} />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {links.map(link => {
          const src = typeof link.source === 'string' ? nodes.find(n => n.id === link.source) : link.source as ArgNode
          const tgt = typeof link.target === 'string' ? nodes.find(n => n.id === link.target) : link.target as ArgNode
          if (!src?.x || !tgt?.x || !src?.y || !tgt?.y) return null

          const highlighted = connectedSet.has(link.id)
          const dimmed = isHighlighting && !highlighted
          const tgtRadius = tgt.round === 0 ? NODE_RADIUS_INITIAL : NODE_RADIUS_COUNTER

          // Shorten line to stop at node border
          const dx = tgt.x - src.x
          const dy = tgt.y - src.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const endX = tgt.x - (dx / dist) * (tgtRadius + 2)
          const endY = tgt.y - (dy / dist) * (tgtRadius + 2)

          const strokeWidth = 1 + link.attackStrength * 2.5
          const markerSuffix = dimmed ? '-dim' : ''

          return (
            <g key={link.id}>
              {/* Invisible wider hit area for hover */}
              <line
                x1={src.x}
                y1={src.y}
                x2={endX}
                y2={endY}
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => handleEdgeEnter(link.id, e)}
                onMouseLeave={handleMouseLeave}
              />
              <line
                x1={src.x}
                y1={src.y}
                x2={endX}
                y2={endY}
                stroke={ATTACK_COLORS[link.type] ?? '#888'}
                strokeWidth={highlighted ? strokeWidth + 1 : strokeWidth}
                strokeDasharray={ATTACK_DASH[link.type] ?? ''}
                strokeOpacity={dimmed ? 0.12 : link.valid ? 0.75 : 0.2}
                markerEnd={`url(#arrow-${link.type}${markerSuffix})`}
                pointerEvents="none"
              />
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map(node => {
          if (node.x == null || node.y == null) return null
          const r = node.round === 0 ? NODE_RADIUS_INITIAL : NODE_RADIUS_COUNTER
          const label = labelMap.get(node.id) ?? 'UNDEC'
          const fill = LABEL_FILLS[label]
          const stroke = LABEL_STROKES[label]
          const speakerColor = speakerColorMap.get(node.speakerId) ?? '#888'
          const highlighted = connectedSet.has(node.id)
          const dimmed = isHighlighting && !highlighted
          const meta = metaMap.get(node.speakerId)
          const initial = (meta?.name ?? node.speakerId).charAt(0).toUpperCase()

          return (
            <g
              key={node.id}
              style={{
                cursor: 'pointer',
                opacity: dimmed ? 0.15 : label === 'OUT' ? 0.5 : 1,
                transition: 'opacity 150ms',
              }}
              onMouseEnter={(e) => handleNodeEnter(node.id, e)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Outer ring (speaker color) */}
              <circle
                cx={node.x}
                cy={node.y}
                r={r + 3}
                fill="none"
                stroke={speakerColor}
                strokeWidth={highlighted ? 3 : 2}
                strokeOpacity={highlighted ? 1 : 0.6}
              />
              {/* Main circle (label color) */}
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={highlighted ? 2 : 1}
              />
              {/* Speaker initial */}
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={stroke}
                fontSize={r === NODE_RADIUS_INITIAL ? 13 : 10}
                fontWeight={600}
                fontFamily="monospace"
                pointerEvents="none"
              >
                {initial}
              </text>
              {/* Label text below */}
              <text
                x={node.x}
                y={node.y + r + 12}
                textAnchor="middle"
                fill={stroke}
                fontSize={9}
                fontWeight={500}
                fontFamily="monospace"
                pointerEvents="none"
                opacity={0.8}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted font-mono bg-card-bg/80 backdrop-blur rounded px-2 py-1.5 border border-card-border/50">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: LABEL_STROKES.IN }} /> IN</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: LABEL_STROKES.OUT }} /> OUT</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: LABEL_STROKES.UNDEC }} /> UNDEC</span>
        <span className="border-l border-card-border pl-3 flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: ATTACK_COLORS.rebut }} /> rebut</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: ATTACK_COLORS.undermine }} /> undermine</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dotted" style={{ borderColor: ATTACK_COLORS.undercut }} /> undercut</span>
      </div>

      {/* Speaker legend */}
      {personaMetas.length > 0 && (
        <div className="absolute top-3 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted font-mono bg-card-bg/80 backdrop-blur rounded px-2 py-1.5 border border-card-border/50">
          {personaMetas.map(p => (
            <span key={p.id} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: speakerColorMap.get(p.id) ?? '#888' }} />
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltipContent && tooltipPos && (
        <div
          className="absolute z-50 pointer-events-none animate-fade-in"
          style={{
            left: Math.min(tooltipPos.x + 14, width - 300),
            top: Math.max(tooltipPos.y - 10, 8),
            maxWidth: 300,
          }}
        >
          <div className="rounded-lg border border-card-border bg-surface shadow-lg p-3 space-y-1.5 text-xs">
            {tooltipContent.kind === 'node' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tooltipContent.speakerColor }} />
                  <span className="font-semibold text-sm">{tooltipContent.speaker}</span>
                  <span className={`font-mono text-[10px] ${
                    tooltipContent.label === 'IN' ? 'text-green-400'
                    : tooltipContent.label === 'OUT' ? 'text-red-400'
                    : 'text-yellow-400'
                  }`}>{tooltipContent.label}</span>
                  <span className="text-muted font-mono ml-auto">{tooltipContent.id}</span>
                </div>
                <p className="text-foreground/90 leading-snug">{tooltipContent.claim}</p>
                {tooltipContent.premises.length > 0 && (
                  <div>
                    <span className="text-muted">Premises:</span>
                    <ul className="pl-3 mt-0.5 space-y-0.5">
                      {tooltipContent.premises.map((p, i) => (
                        <li key={i} className="text-foreground/70">{truncate(p, 100)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {tooltipContent.assumptions.length > 0 && (
                  <div>
                    <span className="text-muted">Assumptions:</span>
                    <ul className="pl-3 mt-0.5 space-y-0.5">
                      {tooltipContent.assumptions.map((a, i) => (
                        <li key={i} className="text-foreground/70">{truncate(a, 100)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {tooltipContent.evidence.length > 0 && (
                  <div>
                    <span className="text-muted">Evidence:</span>
                    <ul className="pl-3 mt-0.5 space-y-0.5">
                      {tooltipContent.evidence.map((e, i) => (
                        <li key={i} className="text-foreground/70">{truncate(e, 100)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-muted pt-0.5">Round {tooltipContent.round}</div>
              </>
            )}

            {tooltipContent.kind === 'edge' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tooltipContent.speakerColor }} />
                  <span className="font-semibold text-sm">{tooltipContent.speaker}</span>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    tooltipContent.type === 'rebut' ? 'bg-red-900/40 text-red-400'
                    : tooltipContent.type === 'undermine' ? 'bg-yellow-900/40 text-yellow-400'
                    : 'bg-purple-900/40 text-purple-400'
                  }`}>{tooltipContent.type}</span>
                  <span className="text-muted font-mono ml-auto">{tooltipContent.id}</span>
                </div>
                <p className="text-foreground/90 leading-snug">{tooltipContent.counterProposition}</p>
                <p className="text-foreground/60 leading-snug italic">{tooltipContent.rationale}</p>
                <div className="flex items-center gap-3 text-muted pt-0.5">
                  <span>Targets {tooltipContent.targetComponent}[{tooltipContent.targetIndex}]</span>
                  <span>Strength {(tooltipContent.attackStrength * 100).toFixed(0)}%</span>
                  <span className={tooltipContent.valid ? 'text-green-400' : 'text-red-400'}>
                    {tooltipContent.valid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                <div className="text-muted">Round {tooltipContent.round}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
