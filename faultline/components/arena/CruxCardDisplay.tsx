'use client'

import type { CruxCardOutput } from '@/lib/arena/types'

const TYPE_LABELS: Record<string, string> = {
  evidence: 'Evidence',
  values: 'Values',
  definition: 'Definition',
  horizon: 'Time Horizon',
  claim: 'Empirical Claim',
  premise: 'Premise',
}

interface Props {
  card: CruxCardOutput
  index: number
  showImportance?: boolean
}

export function CruxCardDisplay({ card, index, showImportance = false }: Props) {
  return (
    <div className="rounded-lg border border-card-border bg-card-bg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted">#{index + 1}</span>
        <span className="rounded border border-card-border px-2 py-0.5 text-xs text-muted uppercase tracking-wide">
          {TYPE_LABELS[card.disagreementType] ?? card.disagreementType}
        </span>
      </div>

      {/* Question */}
      <p className="text-sm font-medium text-foreground leading-snug">{card.question}</p>

      {/* Diagnosis */}
      <p className="text-xs text-muted leading-relaxed">{card.diagnosis}</p>

      {/* Importance score (ARGORA only) */}
      {showImportance && card.importance !== null && (
        <div className="text-xs text-muted">
          <span className="text-accent font-mono">{card.importance.toFixed(3)}</span>
          <span className="ml-1">counterfactual impact</span>
        </div>
      )}

      {/* Positions */}
      <div className="space-y-2 pt-1">
        {card.positions.map((pos, i) => (
          <div key={i} className="rounded border border-card-border bg-surface p-3 space-y-1">
            <div className="text-xs font-semibold text-accent">{pos.expert}</div>
            <div className="text-xs text-foreground">{pos.stance}</div>
            <div className="text-xs text-muted leading-relaxed">{pos.reasoning}</div>
            {pos.flipCondition && (
              <div className="text-xs text-muted italic border-t border-card-border pt-1 mt-1">
                Would change if: {pos.flipCondition}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
