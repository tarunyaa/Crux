'use client'

import Link from 'next/link'
import type { DebateMode } from '@/lib/types'
import type { HydratedDebateState } from '@/lib/hooks/hydrateDebateState'
import HexAvatar from '@/components/HexAvatar'
import SuitIcon from '@/components/SuitIcon'
import AgentPolygon from '@/components/AgentPolygon'

interface PersonaMeta {
  id: string
  name: string
  picture: string
}

interface DebateReplayProps {
  topic: string
  mode: DebateMode
  personaMetas: PersonaMeta[]
  state: HydratedDebateState
  createdAt: string
  hasError: boolean
}

function stanceBadge(stance: string) {
  const colors: Record<string, string> = {
    pro: 'bg-green-900/40 text-green-400 border border-green-800/30',
    con: 'bg-red-900/40 text-red-400 border border-red-800/30',
    uncertain: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800/30',
  }
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${colors[stance] ?? 'bg-card-border text-muted border border-card-border'}`}>
      {stance}
    </span>
  )
}

export default function DebateReplay({ topic, mode, personaMetas, state, createdAt, hasError }: DebateReplayProps) {
  const metaMap = new Map(personaMetas.map(p => [p.id, p]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{topic}</h1>
          <div className="flex items-center gap-3">
            <p className={`text-sm ${hasError ? 'text-danger' : 'text-accent'}`}>
              {hasError ? 'Error' : 'Debate complete'}
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
              {mode}
            </span>
            <span className="text-xs text-muted">
              {new Date(createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        <Link href="/debates" className="text-muted hover:text-foreground text-sm shrink-0 transition-colors">
          &larr; Past Debates
        </Link>
      </div>

      {/* Claims */}
      {state.claims.length > 0 && (
        <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Claims Under Debate
          </h2>
          <ul className="space-y-1">
            {state.claims.map((claim, idx) => {
              const suits = ['spade', 'heart', 'diamond', 'club'] as const
              return (
                <li key={claim.id} className="text-sm text-foreground/90 flex items-start gap-2">
                  <SuitIcon suit={suits[idx % 4]} className="text-xs mt-0.5 shrink-0" />
                  {claim.text}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Main grid: feed + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Message feed */}
        <div className="lg:col-span-2">
          <div
            className="rounded-xl border border-card-border bg-card-bg p-4 space-y-4 overflow-y-auto"
            style={{ minHeight: '400px' }}
          >
            {/* Initial stances */}
            {state.initialStances.length > 0 && state.messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Opening Positions</p>
                {state.initialStances.map((entry) => {
                  const meta = metaMap.get(entry.personaId)
                  return (
                    <div key={entry.personaId} className="flex items-start gap-3">
                      <HexAvatar
                        src={meta?.picture || undefined}
                        alt={meta?.name ?? entry.personaId}
                        size={36}
                        fallbackInitial={(meta?.name ?? entry.personaId).charAt(0)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{meta?.name ?? entry.personaId}</span>
                          {entry.stances.map(s => (
                            <span key={s.claimId} className="inline-flex items-center gap-1">
                              {stanceBadge(s.stance)}
                              <span className="text-xs text-muted font-mono">{(s.confidence * 100).toFixed(0)}%</span>
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-foreground/70 whitespace-pre-wrap">{entry.reasoning}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {state.messages.map((msg, i) => {
              const meta = metaMap.get(msg.personaId)
              return (
                <div key={i} className="flex items-start gap-3">
                  <HexAvatar
                    src={meta?.picture || undefined}
                    alt={meta?.name ?? msg.personaId}
                    size={36}
                    fallbackInitial={(meta?.name ?? msg.personaId).charAt(0)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{meta?.name ?? msg.personaId}</span>
                      {stanceBadge(msg.stance.stance)}
                      <span className="text-xs text-muted font-mono">
                        {(msg.stance.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-foreground/85 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              )
            })}

            {state.messages.length === 0 && state.initialStances.length === 0 && (
              <p className="text-muted text-sm text-center py-8">No messages recorded</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Agent Polygon */}
          {personaMetas.length >= 2 && (
            <div className="rounded-xl border border-card-border bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                Agent Dynamics
              </h2>
              <AgentPolygon
                agents={personaMetas}
                messages={state.messages}
                activeSpeakerId={null}
              />
            </div>
          )}

          {/* Convergence */}
          <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
              Convergence
            </h2>
            {state.convergence ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Entropy</span>
                  <span className="font-mono text-xs">{state.convergence.entropy.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Confidence dist.</span>
                  <span className="font-mono text-xs">{state.convergence.confidenceWeightedDistance.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Unresolved cruxes</span>
                  <span className="font-mono text-xs">{state.convergence.unresolvedCruxCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Events</span>
                  <span className="font-mono text-xs">{state.convergence.eventCount} / {state.convergence.maxEvents}</span>
                </div>
                {state.convergence.converged && (
                  <p className="text-accent text-xs font-semibold pt-1">Converged</p>
                )}
                {state.convergence.diverged && (
                  <p className="text-danger text-xs font-semibold pt-1">Diverged</p>
                )}
              </div>
            ) : (
              <p className="text-muted text-sm">No data</p>
            )}
          </div>

          {/* Cruxes */}
          <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
              Cruxes
            </h2>
            {state.cruxes.length > 0 ? (
              <ul className="space-y-2">
                {state.cruxes.map((crux) => (
                  <li key={crux.id} className="text-sm">
                    <span className={crux.resolved ? 'line-through text-muted' : 'text-foreground/90'}>
                      {crux.proposition}
                    </span>
                    <span className="text-xs text-muted ml-2 font-mono">
                      w={crux.weight.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">No cruxes surfaced</p>
            )}
          </div>

          {/* Flip Conditions */}
          <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
              Flip Conditions
            </h2>
            {state.flipConditions.length > 0 ? (
              <ul className="space-y-2">
                {state.flipConditions.map((fc, i) => {
                  const meta = metaMap.get(fc.personaId)
                  return (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{meta?.name ?? fc.personaId}:</span>{' '}
                      <span className={fc.triggered ? 'text-accent' : 'text-foreground/80'}>
                        {fc.condition}
                      </span>
                      {fc.triggered && (
                        <span className="text-xs text-accent ml-1">(triggered)</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-muted text-sm">None triggered</p>
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {hasError && state.error && (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-danger">Error</h2>
          <p className="text-sm text-foreground/80">{state.error}</p>
        </div>
      )}

      {/* Output panel */}
      {state.output && (
        <div className="rounded-xl border border-accent/30 bg-accent-dim/10 p-6 space-y-6 card-shadow">
          <h2 className="text-xl font-bold text-accent flex items-center gap-2">
            <SuitIcon suit="diamond" className="text-lg" />
            Debate Results
          </h2>

          {/* Cruxes */}
          {(state.output.cruxes?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Key Cruxes</h3>
              <ul className="space-y-2">
                {state.output.cruxes?.map((crux) => (
                  <li key={crux.id} className="text-sm">
                    <span className={crux.resolved ? 'text-muted' : 'text-foreground/90'}>
                      {crux.proposition}
                    </span>
                    <span className="text-xs text-muted ml-2 font-mono">
                      weight: {crux.weight.toFixed(2)} {crux.resolved ? '(resolved)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fault Lines */}
          {(state.output.faultLines?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Fault Lines</h3>
              <ul className="space-y-3">
                {state.output.faultLines?.map((fl, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-xs uppercase tracking-wider text-accent/70">{fl.category.replace('_', ' ')}</span>
                    <p className="text-foreground/90 mt-0.5">{fl.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence Ledger */}
          {(state.output.evidenceLedger?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Evidence Ledger</h3>
              {state.output.evidenceLedger?.map((entry, i) => {
                const meta = metaMap.get(entry.personaId)
                return (
                  <div key={i} className="text-sm space-y-1">
                    <p className="font-medium">{meta?.name ?? entry.personaId}</p>
                    {entry.accepted.length > 0 && (
                      <div className="pl-3">
                        <span className="text-xs text-accent">Accepted:</span>
                        <ul className="list-disc list-inside text-foreground/80">
                          {entry.accepted.map((a, j) => <li key={j}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                    {entry.rejected.length > 0 && (
                      <div className="pl-3">
                        <span className="text-xs text-danger">Rejected:</span>
                        <ul className="list-disc list-inside text-foreground/80">
                          {entry.rejected.map((r, j) => (
                            <li key={j}>{r.evidence} — <span className="text-muted italic">{r.reason}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Resolution Paths */}
          {(state.output.resolutionPaths?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Resolution Paths</h3>
              <ul className="space-y-2">
                {state.output.resolutionPaths?.map((rp, i) => (
                  <li key={i} className="text-sm text-foreground/90">{rp.description}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
