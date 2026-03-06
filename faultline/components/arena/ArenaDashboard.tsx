'use client'

import type { ArenaStats, ArenaDebate } from '@/lib/arena/types'
import { ARENA_METHOD_LABELS, ARENA_METHOD_MODELS } from '@/lib/arena/types'
import Link from 'next/link'

interface Props {
  stats: ArenaStats | null
  debates: ArenaDebate[]
}

export function ArenaDashboard({ stats, debates }: Props) {
  return (
    <div className="space-y-8">
      {/* Global stats */}
      {stats && stats.totalVotes > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Win Rates</h2>
          <p className="text-xs text-muted">
            {stats.totalVotes} pairwise votes across {stats.totalDebates} debates
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-left">
                  <th className="pb-2 pr-6 text-xs uppercase tracking-wider text-muted">Method</th>
                  <th className="pb-2 pr-6 text-xs uppercase tracking-wider text-muted">Model</th>
                  <th className="pb-2 pr-6 text-xs uppercase tracking-wider text-muted">Win Rate</th>
                  <th className="pb-2 pr-6 text-xs uppercase tracking-wider text-muted">W / T / L</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-muted">Avg Runtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {stats.methods.map(m => (
                  <tr key={m.method}>
                    <td className="py-3 pr-6 font-medium text-foreground">
                      {ARENA_METHOD_LABELS[m.method]}
                    </td>
                    <td className="py-3 pr-6 font-mono text-xs text-muted">
                      {ARENA_METHOD_MODELS[m.method]}
                    </td>
                    <td className="py-3 pr-6">
                      {m.winRate !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${(m.winRate * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="text-foreground">{(m.winRate * 100).toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-6 font-mono text-xs text-muted">
                      {m.wins} / {m.ties} / {m.losses}
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {m.avgRuntimeMs !== null
                        ? m.avgRuntimeMs >= 60000
                          ? `${(m.avgRuntimeMs / 60000).toFixed(1)}m`
                          : `${(m.avgRuntimeMs / 1000).toFixed(1)}s`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-card-border bg-card-bg p-6 text-center text-sm text-muted">
          No votes yet. Run a debate and cast your first comparison.
        </div>
      )}

      {/* Recent debates */}
      {debates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Recent Debates</h2>
          <div className="space-y-2">
            {debates.map(d => (
              <Link
                key={d.id}
                href={`/arena?debate=${d.id}`}
                className="flex items-start justify-between rounded-lg border border-card-border bg-card-bg px-4 py-3 hover:border-foreground/30 transition-colors"
              >
                <div>
                  <p className="text-sm text-foreground">{d.topic}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {d.methodsRun.map(m => ARENA_METHOD_LABELS[m]).join(' · ')}
                  </p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap ml-4">
                  {new Date(d.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
