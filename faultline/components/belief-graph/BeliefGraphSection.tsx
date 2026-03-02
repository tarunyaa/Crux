'use client'

// ─── Belief Graph Section for Persona Card Detail ────────────
// Renders the mini graph + stats summary.

import type { BeliefGraph } from '@/lib/types'
import { BeliefGraphMini } from './BeliefGraphMini'

interface BeliefGraphSectionProps {
  graph: BeliefGraph
}

export function BeliefGraphSection({ graph }: BeliefGraphSectionProps) {
  const nodesByType = {
    core_value: graph.nodes.filter(n => n.type === 'core_value').length,
    factual_claim: graph.nodes.filter(n => n.type === 'factual_claim').length,
    inference: graph.nodes.filter(n => n.type === 'inference').length,
    assumption: graph.nodes.filter(n => n.type === 'assumption').length,
  }

  const positiveEdges = graph.edges.filter(e => e.polarity === 1).length
  const negativeEdges = graph.edges.filter(e => e.polarity === -1).length
  const avgConfidence = graph.edges.length > 0
    ? graph.edges.reduce((s, e) => s + e.confidence, 0) / graph.edges.length
    : 0

  // Count unique sources
  const allGrounding = new Set<string>()
  for (const node of graph.nodes) {
    for (const g of node.grounding) allGrounding.add(g)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        Belief Graph
      </h2>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatBox label="Nodes" value={graph.nodes.length} />
        <StatBox label="Edges" value={graph.edges.length} />
        <StatBox label="Sources" value={allGrounding.size} />
        <StatBox label="Avg conf." value={avgConfidence.toFixed(2)} />
      </div>

      {/* Edge breakdown — primary visual signal */}
      <div className="flex gap-3 text-[10px] text-muted">
        <span className="text-foreground/70">{positiveEdges} causal supports</span>
        <span className="text-card-border">·</span>
        <span className="text-accent">{negativeEdges} undermines</span>
      </div>

      {/* Graph visualization */}
      <BeliefGraphMini graph={graph} />

      <p className="text-[10px] text-muted text-center">
        Extracted {new Date(graph.extractedAt).toLocaleDateString()} · Hover nodes for details
      </p>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface rounded-lg border border-card-border px-3 py-2 text-center">
      <div className="text-sm font-mono text-foreground">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}
