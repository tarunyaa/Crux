'use client'

import { useEffect, useState, useRef } from 'react'
import { useDebateStream } from '@/lib/hooks/useDebateStream'
import type { DebateMode } from '@/lib/types'
import HexAvatar from '@/components/HexAvatar'
import SuitIcon from '@/components/SuitIcon'
import AgentPolygon from '@/components/AgentPolygon'
import DebateReplay from '@/components/DebateReplay'

interface PersonaMeta {
  id: string
  name: string
  picture: string
}

interface MatchClientProps {
  topic: string
  personaIds: string[]
  personaMetas: PersonaMeta[]
  mode?: DebateMode
  save?: boolean
}

function stripMarkdown(text: string): string {
  return text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
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

export default function MatchClient({ topic, personaIds, personaMetas, mode = 'blitz', save = false }: MatchClientProps) {
  const [state, { start, abort }] = useDebateStream()
  const feedRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showAnalysis, setShowAnalysis] = useState(false)

  const metaMap = new Map(personaMetas.map(p => [p.id, p]))

  // Auto-start the debate on mount.
  // start() internally calls abort() first, so it's safe to re-invoke
  // (e.g. React StrictMode double-fires effects in dev).
  useEffect(() => {
    start({ topic, personaIds, mode, save })
    return () => { abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll feed
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [state.messages, autoScroll])

  function handleFeedScroll() {
    if (!feedRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    setAutoScroll(atBottom)
  }

  const statusLabel = {
    idle: 'Idle',
    connecting: 'Connecting...',
    streaming: 'Debate in progress',
    completed: 'Debate complete',
    error: 'Error',
  }[state.status]

  const statusColor = {
    idle: 'text-muted',
    connecting: 'text-yellow-400',
    streaming: 'text-accent',
    completed: 'text-accent',
    error: 'text-danger',
  }[state.status]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold truncate">{topic}</h1>
        <div className="flex items-center gap-3">
          <p className={`text-sm flex items-center ${statusColor}`}>
            {state.status === 'streaming' && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2 animate-pulse" />
            )}
            {statusLabel}
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
            {mode}
          </span>
        </div>
      </div>

      {/* Claims */}
      {state.claims.length > 0 && (
        <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Claims Under Debate
          </h2>
          <p className="text-xs text-muted/60">Specific propositions the agents are arguing for or against.</p>
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
          {/* Active speaker indicator (classical mode) */}
          {state.activeSpeaker && state.status === 'streaming' && (() => {
            const speakerMeta = metaMap.get(state.activeSpeaker.personaId)
            return (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-dim/10 px-3 py-2">
                <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm font-medium">
                  Speaking: {speakerMeta?.name ?? state.activeSpeaker.personaId}
                </span>
                <span className="text-xs text-muted ml-auto truncate max-w-[50%]">
                  {state.activeSpeaker.intent}
                </span>
              </div>
            )
          })()}
          <div
            ref={feedRef}
            onScroll={handleFeedScroll}
            className="rounded-xl border border-card-border bg-card-bg p-4 space-y-4 overflow-y-auto"
            style={{ minHeight: '400px' }}
          >
            {(state.status === 'connecting' || (state.status === 'streaming' && state.messages.length === 0 && state.initialStances.length === 0)) && (
              <div className="flex flex-col items-center justify-center h-40 text-muted gap-3">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">{state.statusMessage ?? 'Connecting to debate engine...'}</span>
              </div>
            )}

            {/* Initial stances (shown before debate rounds begin), organized by claim */}
            {state.initialStances.length > 0 && state.messages.length === 0 && (
              <div className="space-y-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Opening Positions</p>
                {state.claims.map((claim, claimIdx) => {
                  const suits = ['spade', 'heart', 'diamond', 'club'] as const
                  // Collect each persona's stance + reasoning for this claim
                  const entries = state.initialStances
                    .map(entry => {
                      const stance = entry.stances.find(s => s.claimId === claim.id)
                      const reasoning = entry.reasonings.find(r => r.claimId === claim.id)?.reasoning
                      if (!stance) return null
                      return { personaId: entry.personaId, stance, reasoning }
                    })
                    .filter(Boolean) as { personaId: string; stance: typeof state.initialStances[0]['stances'][0]; reasoning: string | undefined }[]
                  if (entries.length === 0) return null
                  return (
                    <div key={claim.id} className="space-y-3 animate-fade-in">
                      <div className="flex items-start gap-2 pb-1 border-b border-card-border">
                        <SuitIcon suit={suits[claimIdx % 4]} className="text-sm mt-0.5 shrink-0" />
                        <p className="text-sm font-medium text-foreground/90">{claim.text}</p>
                      </div>
                      {entries.map(({ personaId, stance, reasoning }) => {
                        const meta = metaMap.get(personaId)
                        return (
                          <div key={personaId} className="flex items-start gap-3 pl-4">
                            <HexAvatar
                              src={meta?.picture || undefined}
                              alt={meta?.name ?? personaId}
                              size={36}
                              fallbackInitial={(meta?.name ?? personaId).charAt(0)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm">{meta?.name ?? personaId}</span>
                                {stanceBadge(stance.stance)}
                                <span className="text-xs text-muted font-mono">{(stance.confidence * 100).toFixed(0)}%</span>
                              </div>
                              {reasoning && (
                                <p className="text-sm text-foreground/70 whitespace-pre-wrap">{stripMarkdown(reasoning)}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {state.status === 'streaming' && (
                  <div className="flex items-center gap-2 text-muted text-sm pt-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>{state.statusMessage ?? 'Starting debate...'}</span>
                  </div>
                )}
              </div>
            )}

            {state.claims.length > 0 && state.messages.length > 0 && (
              <div className="space-y-6">
                {state.claims.map((claim, claimIdx) => {
                  const suits = ['spade', 'heart', 'diamond', 'club'] as const
                  const claimMessages = state.messages.filter(
                    msg => msg.stance.claimId === claim.id
                  )
                  if (claimMessages.length === 0) return null
                  return (
                    <div key={claim.id} className="space-y-3">
                      <div className="flex items-start gap-2 pb-1 border-b border-card-border">
                        <SuitIcon suit={suits[claimIdx % 4]} className="text-sm mt-0.5 shrink-0" />
                        <p className="text-sm font-medium text-foreground/90">{claim.text}</p>
                      </div>
                      {claimMessages.map((msg, i) => {
                        const meta = metaMap.get(msg.personaId)
                        return (
                          <div key={i} className="flex items-start gap-3 pl-4 animate-fade-in">
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
                              <p className="text-sm text-foreground/85 whitespace-pre-wrap">{stripMarkdown(msg.content)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Agent Polygon */}
          {personaMetas.length >= 2 && (
            <div className="rounded-xl border border-card-border bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
                Agent Dynamics
              </h2>
              <p className="text-xs text-muted/60 mb-2">How agents are positioned relative to each other based on stance alignment.</p>
              <AgentPolygon
                agents={personaMetas}
                messages={state.messages}
                activeSpeakerId={state.activeSpeaker?.personaId ?? null}
              />
            </div>
          )}

          {/* Convergence */}
          <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
              Convergence
            </h2>
            <p className="text-xs text-muted/60">Tracks whether agents are moving toward agreement or drifting apart.</p>
            {state.convergence ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted" title="How spread out the agents' positions are. Lower = more agreement.">Entropy</span>
                  <span className="font-mono text-xs">{state.convergence.entropy.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted" title="Gap between agents' confidence levels, weighted by stance. Lower = closer to consensus.">Confidence dist.</span>
                  <span className="font-mono text-xs">{state.convergence.confidenceWeightedDistance.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted" title="Key questions that haven't been settled yet.">Unresolved cruxes</span>
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
              <p className="text-muted text-sm">No data yet</p>
            )}
          </div>

          {/* Cruxes */}
          <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
              Cruxes
            </h2>
            <p className="text-xs text-muted/60">Key factual questions where the answer would change someone{"'"}s mind.</p>
            {state.cruxes.length > 0 ? (
              <ul className="space-y-2">
                {state.cruxes.map((crux) => (
                  <li key={crux.id} className="text-sm">
                    <span className={crux.resolved ? 'line-through text-muted' : 'text-foreground/90'}>
                      {crux.proposition}
                    </span>
                    <span className="text-xs text-muted ml-2 font-mono" title="Weight: how central this crux is to the disagreement. Higher = more decisive.">
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
            <p className="text-xs text-muted/60">What evidence would make each agent change their position.</p>
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
      {state.status === 'error' && state.error && (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-danger">Error</h2>
          <p className="text-sm text-foreground/80">{state.error}</p>
        </div>
      )}

      {/* Completion banner — shown on debate_complete */}
      {state.output && (
        <div className="rounded-xl border border-accent/30 bg-accent-dim/10 p-5 card-shadow">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-accent">Debate Complete</h2>
                <div className="flex flex-wrap gap-3 text-xs text-muted mt-0.5">
                  {(state.output.cruxes?.length ?? 0) > 0 && (
                    <span>{state.output.cruxes.length} crux{state.output.cruxes.length !== 1 ? 'es' : ''}</span>
                  )}
                  {(state.output.faultLines?.length ?? 0) > 0 && (
                    <span>{state.output.faultLines.length} fault line{state.output.faultLines.length !== 1 ? 's' : ''}</span>
                  )}
                  {(state.output.resolutionPaths?.length ?? 0) > 0 && (
                    <span>{state.output.resolutionPaths.length} resolution path{state.output.resolutionPaths.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAnalysis(prev => !prev)}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-black text-sm font-semibold hover:bg-accent/90 transition-colors"
            >
              {showAnalysis ? 'Hide Analysis' : 'View Full Analysis'}
              <svg className={`w-4 h-4 transition-transform ${showAnalysis ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Inline full analysis */}
      {showAnalysis && state.output && (
        <DebateReplay
          topic={topic}
          mode={mode}
          personaMetas={personaMetas}
          state={{
            debateId: state.debateId,
            claims: state.claims,
            messages: state.messages,
            convergence: state.convergence,
            cruxes: state.cruxes,
            flipConditions: state.flipConditions,
            output: state.output,
            error: state.error,
            tables: {},
            initialStances: state.initialStances,
          }}
          createdAt={new Date().toISOString()}
          hasError={state.status === 'error'}
          inline
        />
      )}
    </div>
  )
}
