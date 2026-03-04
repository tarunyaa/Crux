'use client'

// ─── Structural Crux Card Display ────────────────────────────

import type { StructuralCrux } from '@/lib/belief-graph/types'

interface StructuralCruxCardProps {
  crux: StructuralCrux
  rank: number
  personaNames: Map<string, string>
}

const DISAGREEMENT_LABELS: Record<string, string> = {
  base_score: 'They disagree on whether this is true',
  edge_structure: 'They agree this matters, but disagree on what it means for their position',
  both: 'They disagree on both whether this is true and what it implies',
}

function StrengthBar({ baseScore, dialecticalStrength, name }: { baseScore: number; dialecticalStrength: number; name: string }) {
  const basePct = Math.round(baseScore * 100)
  const dialPct = Math.round(dialecticalStrength * 100)
  const shifted = dialPct - basePct
  const noChange = shifted === 0

  return (
    <div className="flex items-center gap-2">
      {/* Name */}
      <span className="text-xs text-foreground font-medium w-28 truncate flex-shrink-0">
        {name}
      </span>

      {/* Bar */}
      <div className="relative h-3 flex-1 bg-background rounded-full overflow-hidden border border-card-border">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${dialPct}%`,
            backgroundColor: dialPct === 0
              ? 'rgba(220, 38, 38, 0.15)'
              : 'rgba(220, 38, 38, 0.35)',
          }}
        />
        {/* Base score marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-accent"
          style={{ left: `${basePct}%` }}
        />
      </div>

      {/* Score label */}
      <span className="text-[10px] font-mono text-muted whitespace-nowrap w-16 text-right">
        {dialPct}%
        {!noChange && (
          <span className={shifted > 0 ? 'text-foreground' : 'text-accent'}>
            {' '}{shifted > 0 ? '+' : ''}{shifted}
          </span>
        )}
      </span>
    </div>
  )
}

export function StructuralCruxCard({ crux, rank, personaNames }: StructuralCruxCardProps) {
  const positions = Object.entries(crux.personaPositions)
  const cruxPct = Math.round(crux.cruxScore * 100)

  // Sort positions: biggest movers first, then by strength descending
  const sortedPositions = [...positions].sort((a, b) => {
    const shiftA = Math.abs(a[1].dialecticalStrength - a[1].baseScore)
    const shiftB = Math.abs(b[1].dialecticalStrength - b[1].baseScore)
    if (shiftA !== shiftB) return shiftB - shiftA
    return b[1].baseScore - a[1].baseScore
  })

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-5 shadow-md shadow-black/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-accent text-base leading-none select-none" aria-hidden>&#9830;</span>
          <span className="text-xs font-mono text-accent uppercase tracking-wider font-semibold">
            Crux #{rank}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted">
          {cruxPct}% pivotal
        </span>
      </div>

      {/* Claim */}
      <p className="text-foreground text-sm font-medium mb-2 leading-relaxed border-l-2 border-accent pl-3">
        {crux.claim}
      </p>

      {/* Disagreement type */}
      <p className="text-[10px] text-muted mb-4">
        {DISAGREEMENT_LABELS[crux.disagreementType] ?? crux.disagreementType}
      </p>

      {/* Positions */}
      <div className="space-y-1.5 mb-4">
        {sortedPositions.map(([pid, pos]) => (
          <StrengthBar
            key={pid}
            name={personaNames.get(pid) ?? pid}
            baseScore={pos.baseScore}
            dialecticalStrength={pos.dialecticalStrength}
          />
        ))}
      </div>

      {/* Counterfactual — only show if meaningful */}
      {crux.counterfactual && !crux.counterfactual.includes('minimal structural impact') && (
        <div className="bg-surface rounded-lg px-3 py-2 mb-3 border border-card-border">
          <p className="text-xs text-foreground leading-relaxed">
            {crux.counterfactual}
          </p>
        </div>
      )}

      {/* Settling question */}
      {crux.settlingQuestion && (
        <div className="pt-3 border-t border-card-border">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">To resolve this</p>
          <p className="text-xs text-foreground font-medium leading-relaxed">
            {crux.settlingQuestion}
          </p>
        </div>
      )}
    </div>
  )
}
