'use client'

// ─── QBAF Tree Visualization ──────────────────────────────────
// Renders a PersonaQBAF as a top-down tree.
// Root at top, depth-1 in the middle, depth-2 at the bottom.
// Nodes show claim text, τ (base score), and σ (dialectical strength).
// Edges colored by type: white arrow = support, red dashed = attack.

import { useState } from 'react'
import type { PersonaQBAF, QBAFNode, QBAFEdge } from '@/lib/belief-graph/types'

interface QBAFTreeViewProps {
  qbaf: PersonaQBAF
}

interface TreeNode {
  node: QBAFNode
  edge?: QBAFEdge     // edge connecting this node to its parent
  children: TreeNode[]
  x: number           // computed layout x position
  y: number           // computed layout y position
}

function buildTree(qbaf: PersonaQBAF): TreeNode | null {
  const root = qbaf.nodes.find(n => n.id === qbaf.rootClaim)
  if (!root) return null

  // Build parent→children map from edges (edge.from is child, edge.to is parent)
  const childrenMap = new Map<string, Array<{ nodeId: string; edge: QBAFEdge }>>()
  for (const edge of qbaf.edges) {
    const list = childrenMap.get(edge.to) ?? []
    list.push({ nodeId: edge.from, edge })
    childrenMap.set(edge.to, list)
  }

  const nodeMap = new Map(qbaf.nodes.map(n => [n.id, n]))

  function buildSubtree(nodeId: string, parentEdge?: QBAFEdge): TreeNode {
    const node = nodeMap.get(nodeId)!
    const childEntries = childrenMap.get(nodeId) ?? []
    const children = childEntries.map(c => buildSubtree(c.nodeId, c.edge))
    return { node, edge: parentEdge, children, x: 0, y: 0 }
  }

  return buildSubtree(root.id)
}

// Assign x/y positions to tree nodes using a simple layout
function layoutTree(tree: TreeNode, width: number): void {
  const depthGroups: TreeNode[][] = [[], [], []]

  function collect(t: TreeNode, depth: number) {
    if (depth < 3) depthGroups[depth].push(t)
    for (const child of t.children) collect(child, depth + 1)
  }
  collect(tree, 0)

  const yPositions = [60, 220, 380]

  for (let d = 0; d < 3; d++) {
    const group = depthGroups[d]
    if (group.length === 0) continue
    const spacing = width / (group.length + 1)
    for (let i = 0; i < group.length; i++) {
      group[i].x = spacing * (i + 1)
      group[i].y = yPositions[d]
    }
  }
}

function strengthColor(sigma: number): string {
  // Low σ = more red tint, high σ = more white
  if (sigma < 0.3) return 'rgba(220, 38, 38, 0.9)'
  if (sigma < 0.5) return 'rgba(220, 120, 100, 0.9)'
  if (sigma < 0.7) return 'rgba(200, 180, 170, 0.9)'
  return 'rgba(255, 255, 255, 0.85)'
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted w-3">{label}</span>
      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] font-mono text-muted w-7 text-right">{value.toFixed(2)}</span>
    </div>
  )
}

export function QBAFTreeView({ qbaf }: QBAFTreeViewProps) {
  const [selectedNode, setSelectedNode] = useState<QBAFNode | null>(null)
  const tree = buildTree(qbaf)
  if (!tree) return <p className="text-muted text-sm">Empty QBAF</p>

  // Collect all nodes with positions for SVG rendering
  const allTreeNodes: TreeNode[] = []
  function collectAll(t: TreeNode) {
    allTreeNodes.push(t)
    for (const c of t.children) collectAll(c)
  }

  const svgWidth = 700
  layoutTree(tree, svgWidth)
  collectAll(tree)

  const svgHeight = 440
  const nodePositions = new Map(allTreeNodes.map(t => [t.node.id, { x: t.x, y: t.y }]))

  // Collect edges for rendering
  const edgeLines: Array<{
    from: { x: number; y: number }
    to: { x: number; y: number }
    edge: QBAFEdge
  }> = []
  for (const t of allTreeNodes) {
    if (t.edge) {
      const parentPos = nodePositions.get(t.edge.to)
      const childPos = nodePositions.get(t.node.id)
      if (parentPos && childPos) {
        edgeLines.push({ from: childPos, to: parentPos, edge: t.edge })
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Tree SVG */}
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="rounded-lg border border-card-border bg-background">
        <defs>
          <marker id="arrow-support" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0,0 8,3 0,6" fill="rgba(255,255,255,0.5)" />
          </marker>
          <marker id="arrow-attack" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0,0 8,3 0,6" fill="#dc2626" />
          </marker>
        </defs>

        {/* Edges */}
        {edgeLines.map((line, i) => {
          const isAttack = line.edge.type === 'attack'
          return (
            <line
              key={i}
              x1={line.from.x}
              y1={line.from.y - 10}
              x2={line.to.x}
              y2={line.to.y + 10}
              stroke={isAttack ? 'rgba(220, 38, 38, 0.6)' : 'rgba(255, 255, 255, 0.25)'}
              strokeWidth={1.5}
              strokeDasharray={isAttack ? '6,3' : 'none'}
              markerEnd={isAttack ? 'url(#arrow-attack)' : 'url(#arrow-support)'}
            />
          )
        })}

        {/* Nodes */}
        {allTreeNodes.map(t => {
          const isRoot = t.node.depth === 0
          const isSelected = selectedNode?.id === t.node.id
          const r = isRoot ? 14 : 10
          return (
            <g
              key={t.node.id}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedNode(isSelected ? null : t.node)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle cx={t.x} cy={t.y} r={r + 4} fill="none" stroke="rgba(220, 38, 38, 0.5)" strokeWidth={2} />
              )}
              {/* Node circle */}
              <circle
                cx={t.x}
                cy={t.y}
                r={r}
                fill={strengthColor(t.node.dialecticalStrength)}
                stroke={t.node.type === 'con' ? '#dc2626' : 'rgba(255,255,255,0.3)'}
                strokeWidth={t.node.type === 'con' ? 1.5 : 0.5}
              />
              {/* σ label inside */}
              <text
                x={t.x}
                y={t.y + 3.5}
                textAnchor="middle"
                fontSize={isRoot ? 9 : 7}
                fill={t.node.dialecticalStrength < 0.5 ? '#fff' : '#000'}
                fontFamily="monospace"
              >
                {t.node.dialecticalStrength.toFixed(2)}
              </text>
              {/* Type indicator */}
              {t.node.type === 'pro' && (
                <text x={t.x} y={t.y - r - 4} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.5)">↑</text>
              )}
              {t.node.type === 'con' && (
                <text x={t.x} y={t.y - r - 4} textAnchor="middle" fontSize={10} fill="#dc2626">↓</text>
              )}
            </g>
          )
        })}

        {/* Depth labels */}
        <text x={12} y={62} fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="monospace">root</text>
        <text x={12} y={222} fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="monospace">d1</text>
        <text x={12} y={382} fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="monospace">d2</text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <svg width="16" height="8"><line x1="0" y1="4" x2="10" y2="4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" /><polygon points="10,1.5 16,4 10,6.5" fill="rgba(255,255,255,0.4)" /></svg>
          Support
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <svg width="16" height="8"><line x1="0" y1="4" x2="10" y2="4" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3,1.5" /><polygon points="10,1.5 16,4 10,6.5" fill="#dc2626" /></svg>
          Attack
        </div>
        <span className="text-[10px] text-muted">· Numbers = σ (dialectical strength) · Click node for details</span>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="rounded-lg border border-card-border bg-surface p-4 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
              selectedNode.type === 'con' ? 'bg-accent/20 text-accent' :
              selectedNode.type === 'pro' ? 'bg-foreground/10 text-foreground' :
              'bg-foreground/10 text-foreground'
            }`}>
              {selectedNode.type === 'root' ? 'ROOT' : selectedNode.type.toUpperCase()}
            </span>
            <span className="text-xs text-muted">depth {selectedNode.depth}</span>
          </div>

          <p className="text-sm text-foreground leading-relaxed">{selectedNode.claim}</p>

          <div className="space-y-1 max-w-xs">
            <ScoreBar label="τ" value={selectedNode.baseScore} color="rgba(255,255,255,0.5)" />
            <ScoreBar label="σ" value={selectedNode.dialecticalStrength} color={strengthColor(selectedNode.dialecticalStrength)} />
          </div>

          {selectedNode.grounding.length > 0 && (
            <div className="text-[10px] text-muted">
              Grounded in: {selectedNode.grounding.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
