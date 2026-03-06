'use client'

import type { ArgumentCompleteData, ArgumentCruxCard, DivergenceMap } from '@/lib/argument/types'
import { ArgumentCruxCard as ArgumentCruxCardComponent } from './ArgumentCruxCard'
import HexAvatar from '@/components/HexAvatar'

interface ArgumentReplayProps {
  topic: string
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  output: ArgumentCompleteData & { crux_cards?: ArgumentCruxCard[]; divergence_map?: DivergenceMap }
  createdAt: string
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
}

export function ArgumentReplay({
  topic,
  personaIds,
  personaNames,
  personaAvatars,
  output,
  createdAt,
}: ArgumentReplayProps) {
  const cruxCards = output.crux_cards ?? []
  const sortedCards = [...cruxCards].sort((a, b) => b.importance - a.importance)
  const divergenceMap = output.divergence_map ?? null
  const consensus = output.consensus ?? null

  const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-foreground">{stripMd(topic)}</h1>
          <span className="text-[10px] uppercase font-semibold tracking-wider border border-card-border text-muted px-2 py-0.5 rounded">
            Argument Debate
          </span>
        </div>
        <p className="text-sm text-muted">{formattedDate}</p>

        {/* Persona chips */}
        {personaIds.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            {personaIds.map(pid => {
              const name = personaNames.get(pid) ?? pid
              const avatar = personaAvatars.get(pid)
              return (
                <div key={pid} className="flex items-center gap-1.5">
                  <HexAvatar src={avatar || undefined} alt={name} size={24} />
                  <span className="text-xs text-foreground">{name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Crux Cards */}
      {sortedCards.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted border-b border-card-border pb-2">
            Crux Cards
          </h2>
          <div className="space-y-3">
            {sortedCards.map((card, i) => (
              <ArgumentCruxCardComponent key={i} card={card} />
            ))}
          </div>
        </div>
      )}

      {/* Expert Analysis */}
      {divergenceMap && Object.keys(divergenceMap.per_expert).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted border-b border-card-border pb-2">
            Expert Analysis
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted border-b border-card-border">
                  <th className="pb-2 pr-4 font-semibold">Expert</th>
                  <th className="pb-2 pr-4 font-semibold">
                    &sigma; Score{' '}
                    <span className="font-normal text-muted/60">
                      (final argument strength)
                    </span>
                  </th>
                  <th className="pb-2 pr-4 font-semibold">Supports</th>
                  <th className="pb-2 font-semibold">Attacks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {Object.entries(divergenceMap.per_expert).map(([expert, data]) => (
                  <tr key={expert} className="text-foreground">
                    <td className="py-2 pr-4 font-medium">{expert}</td>
                    <td className="py-2 pr-4 font-mono">{data.root_strength.toFixed(3)}</td>
                    <td className="py-2 pr-4">{data.support_count}</td>
                    <td className="py-2">{data.attack_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verdict */}
      {consensus && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted border-b border-card-border pb-2">
            Verdict
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted tracking-wide">Winner</p>
              <p className="text-sm font-semibold text-foreground">{stripMd(consensus.winner)}</p>
              {consensus.winner_score != null && (
                <p className="text-xs text-muted">
                  &sigma; = {consensus.winner_score.toFixed(3)}{' '}
                  <span className="text-[10px] text-muted/50">(final argument strength)</span>
                </p>
              )}
            </div>
            <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted tracking-wide">Consensus</p>
              {consensus.consensus_text
                .split(/\n+/)
                .map(p => stripMd(p))
                .filter(p => p.length > 0)
                .map((para, i) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">
                    {para}
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-muted pt-2 border-t border-card-border">
        Full debate thread available only in live mode.
      </p>
    </div>
  )
}
