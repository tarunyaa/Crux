'use client'

// ─── Round Timeline Scrubber ─────────────────────────────────

import type { RoundSnapshot } from '@/lib/belief-graph/types'
import type { RevisionDetail } from '@/lib/hooks/useBeliefGraphStream'

interface RoundTimelineProps {
  rounds: RoundSnapshot[]
  revisionDetails: RevisionDetail[]
  selectedRound: number
  onSelectRound: (round: number) => void
  personaNames: Map<string, string>
}

export function RoundTimeline({ rounds, revisionDetails, selectedRound, onSelectRound, personaNames }: RoundTimelineProps) {
  if (rounds.length === 0) return null

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-4">
      <h3 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
        Round Timeline
      </h3>

      {/* Timeline bar */}
      <div className="flex items-center gap-1 mb-3">
        {rounds.map(round => (
          <button
            key={round.round}
            onClick={() => onSelectRound(round.round)}
            className={`flex-1 h-8 rounded text-xs font-mono transition-colors ${
              round.round === selectedRound
                ? 'bg-accent text-white'
                : 'bg-surface text-muted hover:bg-card-border'
            }`}
          >
            R{round.round}
          </button>
        ))}
      </div>

      {/* Selected round details */}
      {rounds[selectedRound] && (
        <div className="text-xs space-y-1">
          {Object.entries(rounds[selectedRound].rootStrengths).map(([pid, strength]) => {
            const detail = revisionDetails.find(
              d => d.round === rounds[selectedRound].round && d.personaId === pid
            )
            return (
              <div key={pid} className="flex justify-between">
                <span className="text-muted">{personaNames.get(pid) ?? pid}</span>
                <span className="text-foreground font-mono">
                  σ={strength.toFixed(3)}
                  {detail && (
                    <span className="text-accent ml-2">R={detail.R.toFixed(3)}</span>
                  )}
                  {rounds[selectedRound].revisionCosts[pid] > 0 && (
                    <span className="text-muted ml-2">
                      (cost: {rounds[selectedRound].revisionCosts[pid].toFixed(4)})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
