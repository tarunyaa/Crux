'use client'

// ─── Benchmark Metrics Dashboard ─────────────────────────────

import { useState } from 'react'
import type { BenchmarkMetrics } from '@/lib/belief-graph/types'

interface BenchmarkDashboardProps {
  benchmarks: BenchmarkMetrics
  personaNames: Map<string, string>
}

interface MetricDisplay {
  label: string
  shortLabel: string
  value: string
  target: string
  status: 'good' | 'neutral' | 'warn'
  description: string
}

function MetricCell({ metric }: { metric: MetricDisplay }) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="text-center relative">
      <div className="flex items-center justify-center gap-1">
        <div className="text-lg font-mono text-foreground">
          {metric.value}
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-[10px] text-muted hover:text-foreground border border-card-border rounded-full w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 transition-colors"
          title={metric.label}
        >
          ?
        </button>
      </div>
      <div className="text-[10px] font-mono text-muted uppercase">
        {metric.shortLabel}
      </div>
      <div className={`text-[9px] mt-0.5 ${
        metric.status === 'good' ? 'text-accent' :
        metric.status === 'warn' ? 'text-danger' : 'text-muted'
      }`}>
        {metric.target}
      </div>
      {showInfo && (
        <div className="absolute z-10 top-full mt-1 left-1/2 -translate-x-1/2 w-56 bg-card-bg border border-card-border rounded-lg p-2.5 text-left shadow-lg">
          <div className="text-[10px] font-mono text-accent mb-1">{metric.label}</div>
          <div className="text-[10px] text-muted leading-relaxed">{metric.description}</div>
          <button
            onClick={() => setShowInfo(false)}
            className="text-[9px] text-muted hover:text-foreground mt-1.5 font-mono"
          >
            close
          </button>
        </div>
      )}
    </div>
  )
}

export function BenchmarkDashboard({ benchmarks, personaNames }: BenchmarkDashboardProps) {
  const metrics = buildMetrics(benchmarks, personaNames)

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-4">
      <h3 className="text-xs font-mono text-accent uppercase tracking-wider mb-4">
        Benchmarks
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(metric => (
          <MetricCell key={metric.shortLabel} metric={metric} />
        ))}
      </div>
    </div>
  )
}

function buildMetrics(b: BenchmarkMetrics, names: Map<string, string>): MetricDisplay[] {
  const avgRSD = Object.values(b.rootStrengthDelta).reduce((s, v) => s + v, 0) / Math.max(Object.values(b.rootStrengthDelta).length, 1)
  const avgBRC = Object.values(b.beliefRevisionCost).reduce((s, v) => s + v, 0) / Math.max(Object.values(b.beliefRevisionCost).length, 1)

  return [
    {
      label: 'Root Strength Delta',
      shortLabel: 'RSD',
      value: avgRSD.toFixed(3),
      target: '> 0.05',
      status: avgRSD > 0.05 ? 'good' : 'warn',
      description: '|σ_final - σ_initial| — How much a persona\'s root claim strength changed after revision. Higher means more impactful debate.',
    },
    {
      label: 'Stance Divergence',
      shortLabel: 'ΔSD',
      value: (b.stanceDivergence >= 0 ? '+' : '') + b.stanceDivergence.toFixed(4),
      target: '≥ 0',
      status: b.stanceDivergence >= 0 ? 'good' : 'warn',
      description: 'Change in spread between personas\' root strengths. Positive means positions diverged, negative means they converged.',
    },
    {
      label: 'Belief Revision Cost',
      shortLabel: 'BRC',
      value: avgBRC.toFixed(4),
      target: 'low = rational',
      status: avgBRC < 0.2 ? 'good' : avgBRC < 0.5 ? 'neutral' : 'warn',
      description: 'Σ|Δτ| / |nodes| — Average change in base scores across all nodes. Lower means more rational, minimal revision.',
    },
    {
      label: 'Crux Localization Rate',
      shortLabel: 'CLR',
      value: (b.cruxLocalizationRate * 100).toFixed(1) + '%',
      target: '10-30%',
      status: b.cruxLocalizationRate >= 0.1 && b.cruxLocalizationRate <= 0.3 ? 'good' : 'neutral',
      description: 'Percentage of community nodes classified as cruxes. Target 10-30% — too low means no disagreement found, too high means everything is a crux.',
    },
    {
      label: 'Argument Coverage',
      shortLabel: 'AC',
      value: b.argumentCoverage.toFixed(2),
      target: '> 0.6',
      status: b.argumentCoverage > 0.6 ? 'good' : 'warn',
      description: '|community_nodes| / (N × |persona_nodes|) — How much overlap exists between personas\' arguments. Higher means more shared ground.',
    },
    {
      label: 'Counterfactual Sensitivity',
      shortLabel: 'CS',
      value: b.counterfactualSensitivity.toFixed(4),
      target: '> 0.1',
      status: b.counterfactualSensitivity > 0.1 ? 'good' : 'warn',
      description: '|Δσ(root)| when top crux is hypothetically removed. Higher means the identified crux really matters to the outcome.',
    },
    {
      label: 'Decision Flip Score',
      shortLabel: 'DFS',
      value: b.decisionFlipScore ? (b.decisionFlipScore.flipped ? 'Flipped' : 'No flip') : 'N/A',
      target: 'flipped = impactful',
      status: b.decisionFlipScore?.flipped ? 'good' : 'neutral',
      description: 'Whether removing the top crux would flip a persona\'s stance from for to against or vice versa. A flip means the crux is truly decisive.',
    },
  ]
}
