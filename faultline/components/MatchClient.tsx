'use client'

import { useEffect, useState, useRef } from 'react'
import { useDebateStream } from '@/lib/hooks/useDebateStream'
import { useDebateV2Stream } from '@/lib/hooks/useDebateV2Stream'
import type { DebateMode } from '@/lib/types'
import HexAvatar from '@/components/HexAvatar'
import SuitIcon from '@/components/SuitIcon'
import AgentPolygon from '@/components/AgentPolygon'
import ArgumentGraph from '@/components/ArgumentGraph'
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

function attackTypeBadge(type: string) {
  const styles: Record<string, string> = {
    rebut: 'bg-red-900/40 text-red-400',
    undermine: 'bg-yellow-900/40 text-yellow-400',
    undercut: 'bg-purple-900/40 text-purple-400',
  }
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${styles[type] ?? 'bg-card-border text-muted'}`}>
      {type}
    </span>
  )
}

function graphLabelBadge(label: string) {
  const styles: Record<string, string> = {
    IN: 'text-green-400',
    OUT: 'text-red-400',
    UNDEC: 'text-yellow-400',
  }
  return (
    <span className={`text-xs font-mono ${styles[label] ?? 'text-muted'}`}>
      {label}
    </span>
  )
}

export default function MatchClient({ topic, personaIds, personaMetas, mode = 'blitz', save = false }: MatchClientProps) {
  // Use v2 for v2 mode
  if (mode === 'v2') {
    return <MatchClientV2 topic={topic} personaIds={personaIds} personaMetas={personaMetas} />
  }

  const [state, { start, abort }] = useDebateStream()
  const feedRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [graphView, setGraphView] = useState<'thread' | 'graph'>('thread')

  const metaMap = new Map(personaMetas.map(p => [p.id, p]))

  useEffect(() => {
    start({ topic, personaIds, mode, save })
    return () => { abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll feed — use graph arguments for graph mode, messages for others
  const scrollTrigger = mode === 'graph'
    ? state.graph?.arguments.length ?? 0
    : state.messages.length
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [scrollTrigger, autoScroll])

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

  // Build threaded graph view data
  const graphThreads = mode === 'graph' && state.graph ? buildGraphThreads(state.graph) : null

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
            {/* Graph mode view tabs */}
            {mode === 'graph' && state.graph && state.graph.arguments.length > 0 && (
              <div className="flex items-center gap-1 mb-3 border-b border-card-border pb-2">
                <button
                  onClick={() => setGraphView('thread')}
                  className={`px-3 py-1 text-xs font-semibold rounded-t transition-colors ${
                    graphView === 'thread'
                      ? 'text-accent border-b-2 border-accent'
                      : 'text-muted hover:text-foreground/70'
                  }`}
                >
                  Thread
                </button>
                <button
                  onClick={() => setGraphView('graph')}
                  className={`px-3 py-1 text-xs font-semibold rounded-t transition-colors ${
                    graphView === 'graph'
                      ? 'text-accent border-b-2 border-accent'
                      : 'text-muted hover:text-foreground/70'
                  }`}
                >
                  Graph
                </button>
              </div>
            )}

            {/* Loading state */}
            {(state.status === 'connecting' || (state.status === 'streaming' && state.messages.length === 0 && state.initialStances.length === 0 && !graphThreads)) && (
              <div className="flex flex-col items-center justify-center h-40 text-muted gap-3">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">{state.statusMessage ?? 'Connecting to debate engine...'}</span>
              </div>
            )}

            {/* ── GRAPH MODE: Visual Graph ── */}
            {mode === 'graph' && graphView === 'graph' && state.graph && state.graph.arguments.length > 0 && (
              <div style={{ height: 500 }}>
                <ArgumentGraph
                  arguments={state.graph.arguments}
                  attacks={state.graph.attacks}
                  validationResults={state.graph.validationResults}
                  labelling={state.graph.labelling}
                  personaMetas={personaMetas}
                />
              </div>
            )}

            {/* ── GRAPH MODE FEED (Thread view) ── */}
            {mode === 'graph' && graphView === 'thread' && graphThreads && graphThreads.length > 0 && (
              <div className="space-y-5">
                {graphThreads.map((thread) => {
                  const argMeta = metaMap.get(thread.argument.speakerId)
                  const label = thread.label
                  return (
                    <div key={thread.argument.id} className="animate-fade-in">
                      {/* The argument */}
                      <div className={`rounded-lg border p-3 space-y-1.5 ${
                        label === 'OUT'
                          ? 'border-red-900/30 bg-red-950/10 opacity-60'
                          : label === 'IN'
                            ? 'border-green-900/30 bg-green-950/10'
                            : 'border-card-border bg-surface'
                      }`}>
                        <div className="flex items-center gap-2">
                          <HexAvatar
                            src={argMeta?.picture || undefined}
                            alt={argMeta?.name ?? thread.argument.speakerId}
                            size={28}
                            fallbackInitial={(argMeta?.name ?? thread.argument.speakerId).charAt(0)}
                          />
                          <span className="font-semibold text-sm">{argMeta?.name ?? thread.argument.speakerId}</span>
                          {graphLabelBadge(label)}
                          {thread.argument.round > 0 && (
                            <span className="text-xs text-muted font-mono">R{thread.argument.round}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/90">{stripMarkdown(thread.argument.claim)}</p>
                        {thread.argument.premises.length > 0 && (
                          <ul className="pl-4 space-y-0.5">
                            {thread.argument.premises.map((p, i) => (
                              <li key={i} className="text-xs text-muted flex items-start gap-1.5">
                                <span className="text-muted/50 shrink-0">&#8627;</span>
                                {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Attacks on this argument */}
                      {thread.attacks.length > 0 && (
                        <div className="ml-6 mt-1 space-y-1.5 border-l-2 border-card-border pl-3">
                          {thread.attacks.map((atk) => {
                            const atkMeta = metaMap.get(atk.attack.speakerId)
                            return (
                              <div key={atk.attack.id} className="flex items-start gap-2 py-1.5 animate-fade-in">
                                <HexAvatar
                                  src={atkMeta?.picture || undefined}
                                  alt={atkMeta?.name ?? atk.attack.speakerId}
                                  size={24}
                                  fallbackInitial={(atkMeta?.name ?? atk.attack.speakerId).charAt(0)}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-medium text-xs">{atkMeta?.name ?? atk.attack.speakerId}</span>
                                    {attackTypeBadge(atk.attack.type)}
                                    {atk.valid !== undefined && (
                                      <span className={`text-xs ${atk.valid ? 'text-green-400/60' : 'text-red-400/60 line-through'}`}>
                                        {atk.valid ? '' : 'invalid'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-foreground/80">{stripMarkdown(atk.attack.counterProposition)}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Streaming indicator */}
                {state.status === 'streaming' && (
                  <div className="flex items-center gap-2 text-muted text-sm pt-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>{state.statusMessage ?? 'Processing...'}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── BLITZ / CLASSICAL MODE FEED ── */}
            {mode !== 'graph' && (
              <>
                {/* Initial stances (shown before debate rounds begin), organized by claim */}
                {state.initialStances.length > 0 && state.messages.length === 0 && (
                  <div className="space-y-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Opening Positions</p>
                    {state.claims.map((claim, claimIdx) => {
                      const suits = ['spade', 'heart', 'diamond', 'club'] as const
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
              </>
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

          {/* Graph sidebar (graph mode) — just the status panel, no attack log */}
          {mode === 'graph' && state.graph && (
            <div className="rounded-xl border border-card-border bg-surface p-4 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
                Argumentation Graph
              </h2>
              <p className="text-xs text-muted/60">Formal argument status computed via Dung{"'"}s semantics.</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Arguments</span>
                  <span className="font-mono text-xs">{state.graph.arguments.length}</span>
                </div>
                {state.graph.labelling && (() => {
                  const labels = state.graph.labelling.labels
                  const labelValues: string[] = labels instanceof Map
                    ? [...labels.values()]
                    : Object.values(labels as Record<string, string>)
                  const inCount = labelValues.filter(l => l === 'IN').length
                  const outCount = labelValues.filter(l => l === 'OUT').length
                  const undecCount = labelValues.filter(l => l === 'UNDEC').length
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-green-400">IN (accepted)</span>
                        <span className="font-mono text-xs">{inCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-400">OUT (defeated)</span>
                        <span className="font-mono text-xs">{outCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">UNDEC</span>
                        <span className="font-mono text-xs">{undecCount}</span>
                      </div>
                    </>
                  )
                })()}
                <div className="flex justify-between">
                  <span className="text-muted">Attacks</span>
                  <span className="font-mono text-xs">{state.graph.attacks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Camps</span>
                  <span className="font-mono text-xs">{state.graph.preferredCount}</span>
                </div>
                {state.graph.graphConverged && (
                  <p className="text-accent text-xs font-semibold pt-1">Graph Stable</p>
                )}
              </div>
            </div>
          )}

          {/* Cruxes (non-graph modes) */}
          {mode !== 'graph' && (
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
          )}

          {/* Flip Conditions (non-graph modes) */}
          {mode !== 'graph' && (
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
          )}
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
            graph: state.graph,
          }}
          createdAt={new Date().toISOString()}
          hasError={state.status === 'error'}
          inline
        />
      )}
    </div>
  )
}

// ─── Graph Thread Builder ───────────────────────────────────

interface GraphThread {
  argument: {
    id: string
    speakerId: string
    claim: string
    premises: string[]
    round: number
  }
  label: string
  attacks: {
    attack: {
      id: string
      speakerId: string
      type: string
      counterProposition: string
    }
    valid?: boolean
  }[]
}

function buildGraphThreads(graph: NonNullable<ReturnType<typeof useDebateStream>[0]['graph']>): GraphThread[] {
  // Only show initial arguments (round 0) as top-level threads.
  // Counter-arguments created by attacks are shown inline under their target.
  const initialArgs = graph.arguments.filter(a => a.round === 0)

  // Build a lookup for labels
  const labelMap: Map<string, string> = graph.labelling?.labels instanceof Map
    ? graph.labelling.labels as Map<string, string>
    : graph.labelling?.labels
      ? new Map(Object.entries(graph.labelling.labels as Record<string, string>))
      : new Map()

  // Build attack index: targetArgId → attacks on it
  const attacksByTarget = new Map<string, typeof graph.attacks>()
  for (const atk of graph.attacks) {
    if (!attacksByTarget.has(atk.toArgId)) attacksByTarget.set(atk.toArgId, [])
    attacksByTarget.get(atk.toArgId)!.push(atk)
  }

  // Validation lookup
  const validationMap = new Map(graph.validationResults.map(v => [v.attackId, v]))

  return initialArgs.map(arg => {
    const attacks = (attacksByTarget.get(arg.id) ?? []).map(atk => {
      const validation = validationMap.get(atk.id)
      return {
        attack: {
          id: atk.id,
          speakerId: atk.speakerId,
          type: atk.type,
          counterProposition: atk.counterProposition,
        },
        valid: validation?.valid,
      }
    })

    return {
      argument: {
        id: arg.id,
        speakerId: arg.speakerId,
        claim: arg.claim,
        premises: arg.premises ?? [],
        round: arg.round,
      },
      label: labelMap.get(arg.id) ?? 'UNDEC',
      attacks,
    }
  })
}

// ─── V2 Match Client ────────────────────────────────────────

const PHASE_LABELS: Record<number, string> = {
  1: 'Opening Statements',
  2: 'Free Exchange',
  3: 'Crux Seeking',
  4: 'Resolution'
}

const MOVE_COLORS: Record<string, string> = {
  CLAIM: 'text-blue-400',
  CHALLENGE: 'text-red-400',
  CLARIFY: 'text-purple-400',
  CONCEDE: 'text-green-400',
  REFRAME: 'text-yellow-400',
  PROPOSE_CRUX: 'text-orange-400',
}

function MatchClientV2({ topic, personaIds, personaMetas }: { topic: string; personaIds: string[]; personaMetas: PersonaMeta[] }) {
  const [state, { start, abort }] = useDebateV2Stream()
  const chatRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const personaMap = new Map(personaMetas.map(p => [p.id, p]))

  useEffect(() => {
    start({ topic, personaIds, maxTurns: 30 })
    return () => { abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [state.transcript.length, autoScroll])

  const handleScroll = () => {
    if (!chatRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    setAutoScroll(atBottom)
  }

  const statusLabel = state.running ? 'Debate in progress' : state.complete ? 'Debate complete' : state.error ? 'Error' : 'Ready'
  const statusColor = state.running ? 'text-accent' : state.complete ? 'text-accent' : state.error ? 'text-danger' : 'text-muted'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold truncate">{topic}</h1>
        <div className="flex items-center gap-3">
          <p className={`text-sm flex items-center ${statusColor}`}>
            {state.running && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2 animate-pulse" />
            )}
            {statusLabel}
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
            v2
          </span>
          {state.currentPhase && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
              Phase {state.currentPhase}: {PHASE_LABELS[state.currentPhase]}
            </span>
          )}
        </div>
      </div>

      {/* Main grid: chat + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chat Area */}
        <div className="lg:col-span-2">
          <div
            ref={chatRef}
            onScroll={handleScroll}
            className="rounded-xl border border-card-border bg-card-bg p-4 space-y-4 overflow-y-auto"
            style={{ minHeight: '500px', maxHeight: '70vh' }}
          >
            {state.transcript.length === 0 && !state.running && (
              <div className="h-full flex items-center justify-center text-muted">
                Waiting to start debate...
              </div>
            )}

            {state.transcript.map((turn, idx) => {
              const persona = personaMap.get(turn.personaId)
              const isPhaseStart = idx === 0 || state.transcript[idx - 1].phase !== turn.phase

              return (
                <div key={turn.turnIndex}>
                  {/* Phase Marker */}
                  {isPhaseStart && (
                    <div className="flex items-center gap-3 my-6">
                      <div className="h-px flex-1 bg-card-border" />
                      <span className="text-sm font-medium text-primary px-3 py-1 bg-primary/10 rounded-full">
                        Phase {turn.phase}: {PHASE_LABELS[turn.phase]}
                      </span>
                      <div className="h-px flex-1 bg-card-border" />
                    </div>
                  )}

                  {/* Steering Hint */}
                  {turn.steeringHint && (
                    <div className="mb-3 px-4 py-2 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
                      <p className="text-xs text-yellow-400/80">
                        <span className="font-semibold">Moderator:</span> {turn.steeringHint}
                      </p>
                    </div>
                  )}

                  {/* Chat Message */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <HexAvatar src={persona?.picture ?? ''} alt={persona?.name ?? turn.personaId} size={40} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-sm">{persona?.name ?? turn.personaId}</span>
                        <span className={`text-xs font-mono ${MOVE_COLORS[turn.move] ?? 'text-muted'}`}>
                          {turn.move}
                        </span>
                      </div>
                      <div className="bg-card border border-card-border rounded-lg px-4 py-3">
                        <p className="text-sm leading-relaxed">{turn.dialogue}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {state.running && (
              <div className="flex items-center gap-2 text-muted text-sm py-4">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                if (chatRef.current) {
                  chatRef.current.scrollTop = chatRef.current.scrollHeight
                }
              }}
              className="mt-2 px-4 py-2 bg-primary/20 text-primary text-sm rounded-lg hover:bg-primary/30 transition-colors"
            >
              ↓ Scroll to latest
            </button>
          )}
        </div>

        {/* Sidebar - Insights */}
        <div className="space-y-4">
          {/* Graph Stats */}
          {state.graph && (
            <div className="bg-card border border-card-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Argument Graph</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Arguments</span>
                  <span>{state.graph.arguments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Attacks</span>
                  <span>{state.graph.attacks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">IN</span>
                  <span className="text-green-400">{state.graphStats.inCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-400">OUT</span>
                  <span className="text-red-400">{state.graphStats.outCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400">UNDEC</span>
                  <span className="text-yellow-400">{state.graphStats.undecCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Concessions */}
          {state.concessions.length > 0 && (
            <div className="bg-card border border-card-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Concessions</h3>
              <div className="space-y-3">
                {state.concessions.slice(-3).reverse().map((c, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="font-semibold text-green-400">{personaMap.get(c.personaId)?.name}</div>
                    <div className="text-muted mt-1">{c.effect}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Crux */}
          {state.cruxProposals.length > 0 && (
            <div className="bg-card border border-card-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Proposed Crux</h3>
              <div className="space-y-3">
                {state.cruxProposals.slice(-1).map((crux, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="font-semibold text-orange-400">{personaMap.get(crux.personaId)?.name}</div>
                    <div className="text-muted mt-1 italic">"{crux.statement.slice(0, 120)}..."</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Results */}
          {state.complete && state.output && (
            <div className="bg-card border border-card-border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Results</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted mb-1">Regime</div>
                  <div className="font-mono text-xs">{state.output.regime}</div>
                  <div className="text-muted text-xs mt-1">{state.output.regimeDescription}</div>
                </div>

                {state.output.crux && (
                  <div>
                    <div className="text-muted mb-1">Crux</div>
                    <div className="text-xs italic">"{state.output.crux.statement.slice(0, 150)}..."</div>
                  </div>
                )}

                <div>
                  <div className="text-muted mb-1">Performance</div>
                  <div className="text-xs space-y-1">
                    <div>Duration: {(state.output.duration / 1000).toFixed(1)}s</div>
                    <div>Turns: {state.transcript.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-4">
          <h2 className="text-sm font-semibold text-danger">Error</h2>
          <p className="text-sm text-foreground/80 mt-2">{state.error}</p>
        </div>
      )}
    </div>
  )
}
