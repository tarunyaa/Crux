'use client'

// ─── Benchmark Metrics Dashboard ─────────────────────────────

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
          <div key={metric.shortLabel} className="text-center">
            <div className="text-lg font-mono text-foreground">
              {metric.value}
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
          </div>
        ))}
      </div>
    </div>
  )
}

function buildMetrics(b: BenchmarkMetrics, names: Map<string, string>): MetricDisplay[] {
  const avgRSD = Object.values(b.rootStrengthDelta).reduce((s, v) => s + v, 0) / Math.max(Object.values(b.rootStrengthDelta).length, 1)
  const avgBRC = Object.values(b.beliefRevisionCost).reduce((s, v) => s + v, 0) / Math.max(Object.values(b.beliefRevisionCost).length, 1)
  const avgGGR = Object.values(b.graphGrowthRate).reduce((s, v) => s + v, 0) / Math.max(Object.values(b.graphGrowthRate).length, 1)

  return [
    {
      label: 'Root Strength Delta',
      shortLabel: 'RSD',
      value: avgRSD.toFixed(3),
      target: '> 0.05',
      status: avgRSD > 0.05 ? 'good' : 'warn',
    },
    {
      label: 'Stance Divergence',
      shortLabel: 'ΔSD',
      value: (b.stanceDivergence >= 0 ? '+' : '') + b.stanceDivergence.toFixed(4),
      target: '≥ 0',
      status: b.stanceDivergence >= 0 ? 'good' : 'warn',
    },
    {
      label: 'Belief Revision Cost',
      shortLabel: 'BRC',
      value: avgBRC.toFixed(4),
      target: 'low = rational',
      status: avgBRC < 0.2 ? 'good' : avgBRC < 0.5 ? 'neutral' : 'warn',
    },
    {
      label: 'Crux Localization Rate',
      shortLabel: 'CLR',
      value: (b.cruxLocalizationRate * 100).toFixed(1) + '%',
      target: '10-30%',
      status: b.cruxLocalizationRate >= 0.1 && b.cruxLocalizationRate <= 0.3 ? 'good' : 'neutral',
    },
    {
      label: 'Argument Coverage',
      shortLabel: 'AC',
      value: b.argumentCoverage.toFixed(2),
      target: '> 0.6',
      status: b.argumentCoverage > 0.6 ? 'good' : 'warn',
    },
    {
      label: 'Graph Growth Rate',
      shortLabel: 'GGR',
      value: avgGGR.toFixed(2),
      target: '1.5-3.0',
      status: avgGGR >= 1.5 && avgGGR <= 3.0 ? 'good' : 'neutral',
    },
    {
      label: 'Counterfactual Sensitivity',
      shortLabel: 'CS',
      value: b.counterfactualSensitivity.toFixed(4),
      target: '> 0.1',
      status: b.counterfactualSensitivity > 0.1 ? 'good' : 'warn',
    },
    {
      label: 'Decision Flip Score',
      shortLabel: 'DFS',
      value: b.decisionFlipScore ? (b.decisionFlipScore.flipped ? 'Flipped' : 'No flip') : 'N/A',
      target: 'flipped = impactful',
      status: b.decisionFlipScore?.flipped ? 'good' : 'neutral',
    },
    {
      label: 'Convergence Round',
      shortLabel: 'Conv',
      value: b.convergenceRound !== null ? `R${b.convergenceRound}` : 'N/A',
      target: 'converged = stable',
      status: b.convergenceRound !== null ? 'good' : 'neutral',
    },
  ]
}
