'use client'

// ─── Structural Crux Card Display ────────────────────────────

import type { StructuralCrux } from '@/lib/belief-graph/types'

interface StructuralCruxCardProps {
  crux: StructuralCrux
  rank: number
  personaNames: Map<string, string>
}

export function StructuralCruxCard({ crux, rank, personaNames }: StructuralCruxCardProps) {
  const positions = Object.entries(crux.personaPositions)

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-accent uppercase tracking-wider">
          Crux #{rank}
        </span>
        <span className="text-xs font-mono text-muted">
          score {crux.cruxScore.toFixed(3)}
        </span>
      </div>

      {/* Claim */}
      <p className="text-foreground text-sm font-medium mb-3 leading-relaxed">
        &ldquo;{crux.claim}&rdquo;
      </p>

      {/* Persona positions */}
      <div className="space-y-2 mb-3">
        {positions.map(([pid, pos]) => (
          <div key={pid} className="text-xs">
            <span className="text-accent font-medium">
              {personaNames.get(pid) ?? pid}
            </span>
            <span className="text-muted ml-2">
              τ={pos.baseScore.toFixed(2)} → σ={pos.dialecticalStrength.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Disagreement type badge */}
      <div className="mb-3">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface text-muted border border-card-border">
          {crux.disagreementType.replace('_', ' ')}
        </span>
      </div>

      {/* Counterfactual */}
      <p className="text-xs text-muted italic mb-2">
        {crux.counterfactual}
      </p>

      {/* Settling question */}
      {crux.settlingQuestion && (
        <div className="mt-3 pt-3 border-t border-card-border">
          <p className="text-xs text-muted mb-1">Settling question:</p>
          <p className="text-xs text-foreground">
            {crux.settlingQuestion}
          </p>
        </div>
      )}
    </div>
  )
}
