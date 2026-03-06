'use client'

import { useEffect, useRef, useState } from 'react'
import { useArgumentStream } from '@/lib/hooks/useArgumentStream'
import type { BridgeConfig } from '@/lib/argument/bridge'
import { ArgumentTimeline } from './ArgumentTimeline'
import HexAvatar from '@/components/HexAvatar'
import { ResultsSection } from './ResultsSection'
import { TechnicalAnalysis } from './TechnicalAnalysis'
import { ArgumentCruxCard } from './ArgumentCruxCard'
import AgentPolygon from '@/components/AgentPolygon'
import { CruxCardDisplay } from '@/components/arena/CruxCardDisplay'
import type { ArenaOutput, ArenaMethod } from '@/lib/arena/types'
import { ARENA_METHOD_LABELS } from '@/lib/arena/types'

interface GraphDebateViewProps {
  config: BridgeConfig
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  starting: 'Initializing',
  experts: 'Selecting Experts',
  arguments: 'Generating Arguments',
  building: 'Building Graph',
  scoring: 'Scoring',
  evaluating: 'Evaluating',
  analyzing: 'Analyzing',
  crux_extraction: 'Extracting Cruxes',
  baselines: 'Running Baselines',
  complete: 'Complete',
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '').trim()
}

type RichBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbered'; items: string[] }
  | { kind: 'para'; text: string }
  | { kind: 'divider' }

function parseRichBlocks(raw: string): RichBlock[] {
  const clean = raw.replace(/\*\*/g, '').replace(/\*/g, '')
  const lines = clean.split('\n')
  const blocks: RichBlock[] = []
  let bullets: string[] = []
  let numbered: string[] = []

  const flushBullets = () => {
    if (bullets.length) { blocks.push({ kind: 'bullets', items: [...bullets] }); bullets = [] }
  }
  const flushNumbered = () => {
    if (numbered.length) { blocks.push({ kind: 'numbered', items: [...numbered] }); numbered = [] }
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushBullets(); flushNumbered(); continue }
    if (t === '---' || t === '***' || t === '___') {
      flushBullets(); flushNumbered(); blocks.push({ kind: 'divider' }); continue
    }
    if (t.startsWith('### ')) {
      flushBullets(); flushNumbered()
      blocks.push({ kind: 'h3', text: t.slice(4) })
    } else if (/^#{1,2}\s/.test(t)) {
      flushBullets(); flushNumbered()
      blocks.push({ kind: 'h2', text: t.replace(/^#+\s*/, '') })
    } else if (/^[-*]\s+/.test(t)) {
      flushNumbered()
      bullets.push(t.replace(/^[-*]\s+/, ''))
    } else if (/^\d+\.\s+/.test(t)) {
      flushBullets()
      numbered.push(t.replace(/^\d+\.\s+/, ''))
    } else {
      flushBullets(); flushNumbered()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'para') {
        last.text += ' ' + t
      } else {
        blocks.push({ kind: 'para', text: t })
      }
    }
  }
  flushBullets(); flushNumbered()
  return blocks
}

function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichBlocks(text)
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {blocks.map((block, i) => {
        if (block.kind === 'h2') return (
          <p key={i} className="text-[10px] font-semibold uppercase tracking-wider text-muted pt-2 first:pt-0">{block.text}</p>
        )
        if (block.kind === 'h3') return (
          <p key={i} className="text-[11px] font-medium text-muted">{block.text}</p>
        )
        if (block.kind === 'bullets') return (
          <div key={i} className="space-y-1">
            {block.items.map((item, j) => (
              <div key={j} className="flex items-start gap-2 text-xs">
                <span className="text-foreground/40 flex-shrink-0 mt-px">—</span>
                <span className="text-foreground">{item}</span>
              </div>
            ))}
          </div>
        )
        if (block.kind === 'numbered') return (
          <div key={i} className="space-y-1">
            {block.items.map((item, j) => (
              <div key={j} className="flex items-start gap-2 text-xs">
                <span className="text-accent flex-shrink-0 font-mono mt-px">{j + 1}.</span>
                <span className="text-foreground">{item}</span>
              </div>
            ))}
          </div>
        )
        if (block.kind === 'divider') return (
          <div key={i} className="h-px bg-card-border my-1" />
        )
        return (
          <p key={i} className="text-xs text-foreground leading-relaxed">{block.text}</p>
        )
      })}
    </div>
  )
}

export function GraphDebateView({ config, personaNames, personaAvatars }: GraphDebateViewProps) {
  const { state, messages, start } = useArgumentStream(config)
  const startedRef = useRef(false)
  const [arenaOutputs, setArenaOutputs] = useState<ArenaOutput[]>([])
  const [comparisonRunning, setComparisonRunning] = useState(false)
  const [comparisonRan, setComparisonRan] = useState(false)
  const [activeResultTab, setActiveResultTab] = useState<'results' | 'analysis'>('results')

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isRunning = !['idle', 'complete', 'error'].includes(state.phase)
  const isComplete = state.phase === 'complete'

  // Build expert→persona mapping by index
  const expertNames = new Map<string, string>()
  const expertAvatars = new Map<string, string>()
  if (config.personaIds && config.personaIds.length > 0) {
    state.experts.forEach((expert, i) => {
      const personaId = config.personaIds![i]
      if (personaId) {
        expertNames.set(expert, personaNames.get(personaId) ?? expert)
        const avatar = personaAvatars.get(personaId)
        if (avatar) expertAvatars.set(expert, avatar)
      }
    })
  }

  // Active speaker = last message's expert
  const activeSpeaker = messages.length > 0 ? messages[messages.length - 1].expertName : null
  const activeSpeakerDisplay = activeSpeaker ? (expertNames.get(activeSpeaker) ?? activeSpeaker) : null

  const runComparison = async () => {
    if (!state.arenaDebateId) return
    setComparisonRunning(true)
    try {
      const res = await fetch('/api/arena/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: config.topic,
          existingDebateId: state.arenaDebateId,
          methods: ['direct_crux', 'cot_crux', 'multiagent_crux'],
        }),
      })
      if (!res.ok) return
      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'method_complete') {
              const d = event.data as {
                method: ArenaMethod
                crux_cards: ArenaOutput['cruxCards']
                model: string
                runtime_ms: number
                token_usage: Record<string, number>
              }
              setArenaOutputs(prev => [...prev, {
                id: crypto.randomUUID(),
                debateId: state.arenaDebateId ?? '',
                method: d.method,
                cruxCards: d.crux_cards ?? [],
                tokenUsage: d.token_usage ?? {},
                runtimeMs: d.runtime_ms ?? 0,
                model: d.model,
                costUsd: null,
              }])
            }
          } catch { /* skip */ }
        }
      }
      setComparisonRan(true)
    } finally {
      setComparisonRunning(false)
    }
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen bg-background px-6 py-8">
        <div className="max-w-md p-6 bg-card-bg border border-accent/40 rounded-xl text-accent">
          <h2 className="font-bold mb-2">Error</h2>
          <p className="text-sm text-muted">{state.error}</p>
        </div>
      </div>
    )
  }

  // Persona list for sidebar — use personaIds order if available, else experts
  const sidebarPersonas = config.personaIds?.length
    ? config.personaIds.map(id => ({
        id,
        name: personaNames.get(id) ?? id,
        avatar: personaAvatars.get(id),
        expert: state.experts[config.personaIds!.indexOf(id)] ?? id,
      }))
    : state.experts.map((expert, i) => ({
        id: expert,
        name: expertNames.get(expert) ?? expert,
        avatar: expertAvatars.get(expert),
        expert,
      }))

  // Build expertNameToPersonaId for AgentPolygon
  const expertNameToPersonaId: Record<string, string> = {}
  sidebarPersonas.forEach(p => {
    if (p.expert) expertNameToPersonaId[p.expert] = p.id
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-card-border bg-surface/50">
        <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center gap-4">
          {isRunning && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] text-muted uppercase tracking-wider">
                {PHASE_LABEL[state.phase] || state.phase}
              </span>
            </div>
          )}
          {isComplete && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 text-foreground/50 font-medium uppercase tracking-wider">
              Complete
            </span>
          )}
          {activeSpeakerDisplay && isRunning && (
            <span className="text-[10px] text-muted">
              {activeSpeakerDisplay} is arguing...
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">

        {/* Topic card */}
        <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <span className="text-foreground/20 text-sm">♠</span>
            <div className="flex-1 h-px bg-card-border opacity-40" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Debate Topic</span>
            <div className="flex-1 h-px bg-card-border opacity-40" />
            <span className="text-foreground/20 text-sm">♠</span>
          </div>
          <div className="px-5 pb-4">
            <p className="text-base font-semibold text-foreground leading-snug">
              {config.topic}
            </p>
          </div>
        </div>

        {/* Main grid: debate thread + persona sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[65vh]">

          {/* Debate thread — 2/3 */}
          <div className="lg:col-span-2 lg:h-full lg:overflow-hidden">
            <ArgumentTimeline
              messages={messages}
              experts={state.experts}
              expertNames={expertNames}
              expertAvatars={expertAvatars}
              phase={state.phase}
              consensus={state.consensus}
            />
          </div>

          {/* Persona sidebar — 1/3 */}
          <div className="rounded-xl border border-card-border bg-surface p-4 lg:h-full lg:overflow-y-auto">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-3 flex items-center gap-1.5">
              <span className="text-accent text-[9px]">♠</span>
              Debaters
            </p>
            <div className="space-y-3">
              {sidebarPersonas.map(p => {
                const isActive = activeSpeaker === p.expert && isRunning
                const score = state.qbafStrengths.find(s => s.expert === p.expert)
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                      isActive ? 'bg-accent/10' : ''
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <HexAvatar
                        src={p.avatar}
                        alt={p.name}
                        size={32}
                        fallbackInitial={p.name.charAt(0)}
                      />
                      {isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-foreground' : 'text-muted'}`}>
                        {p.name}
                      </p>
                      {score?.final_score != null && (
                        <p className="text-[10px] font-mono text-accent">
                          &sigma; = {score.final_score.toFixed(3)}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Argument count */}
            {messages.length > 0 && (
              <div className="mt-4 pt-3 border-t border-card-border">
                <p className="text-[10px] text-muted">
                  <span className="text-foreground font-medium">{messages.length}</span> arguments
                  {messages.filter(m => m.type === 'attack').length > 0 && (
                    <> &middot; <span className="text-accent font-medium">{messages.filter(m => m.type === 'attack').length}</span> attacks</>
                  )}
                </p>
              </div>
            )}

            {/* Alignment graph — shown after divergence is computed */}
            {state.divergenceMap && isComplete && (
              <div className="mt-4 pt-3 border-t border-card-border">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
                  <span className="text-foreground/20 text-[9px]">◈</span>
                  Alignment
                </p>
                <AgentPolygon
                  agents={sidebarPersonas.map(p => ({ id: p.id, name: p.name, picture: p.avatar ?? '' }))}
                  messages={[]}
                  activeSpeakerId={null}
                  divergenceMap={state.divergenceMap}
                  expertNameToPersonaId={expertNameToPersonaId}
                />
              </div>
            )}
          </div>
        </div>

        {/* Results — shown when complete, tabbed */}
        {isComplete && (
          <div className="space-y-2 pt-2">
            {/* Tab switcher + Export PDF */}
            <div className="flex items-center gap-1 px-1">
              <button
                onClick={async () => {
                  const { exportArgumentPDF } = await import('@/lib/utils/export-pdf')
                  exportArgumentPDF({
                  topic: config.topic,
                  personaNames,
                  personaAvatars,
                  consensus: state.consensus,
                  cruxCards: state.cruxCards,
                  divergenceMap: state.divergenceMap,
                    messages,
                  })
                }}
                className="text-[10px] px-3 py-1.5 rounded border border-card-border text-muted hover:text-foreground hover:border-foreground/30 transition-colors ml-auto order-last"
              >
                Export PDF
              </button>
              {(['results', 'analysis'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveResultTab(tab)}
                  className={`text-[10px] px-3 py-1.5 rounded uppercase tracking-wider font-medium transition-colors ${
                    activeResultTab === tab ? 'bg-accent/10 text-accent' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {tab === 'results' ? '♥ Results' : '♣ Analysis'}
                </button>
              ))}
            </div>

            {activeResultTab === 'results' && (
              <div className="space-y-4">
                {/* Verdict */}
                {state.consensus && (
                  <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
                    {/* Winner bar */}
                    <div className="px-5 py-4 border-b border-card-border">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5 flex-1">
                          <p className="text-[10px] text-muted uppercase tracking-wider">Winning Argument</p>
                          <p className="text-base font-semibold text-foreground leading-snug">
                            {stripMarkdown(state.consensus.winner || '')}
                          </p>
                          {/* Observer LLM agreement badge */}
                          {typeof (state.consensus.agnostic_consensus as Record<string, unknown>)?.override_recommended === 'boolean' && (
                            (() => {
                              const overrideRecommended = (state.consensus!.agnostic_consensus as Record<string, unknown>).override_recommended as boolean
                              return (
                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded mt-1.5 ${
                                  overrideRecommended
                                    ? 'bg-accent/10 text-accent border border-accent/30'
                                    : 'bg-foreground/5 text-muted border border-card-border'
                                }`}>
                                  {overrideRecommended ? '⚠ Observer disagrees' : '✓ Observer confirms'}
                                </span>
                              )
                            })()
                          )}
                        </div>
                        {state.consensus.winner_score != null && (
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-muted uppercase tracking-wider">Strength</p>
                            <p className="text-lg font-mono font-bold text-foreground">
                              {state.consensus.winner_score.toFixed(3)}
                            </p>
                            <p className="text-[9px] text-muted/50">&sigma; score</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Consensus summary */}
                    <div className="px-5 py-4 space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Consensus</p>
                      <RichText text={state.consensus.consensus_text || ''} />
                    </div>

                    {/* Graph consensus summary (if different/present) */}
                    {state.consensus.graph_consensus_summary && (
                      <div className="px-5 py-4 border-t border-card-border bg-card-bg space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Graph Analysis</p>
                        <RichText text={state.consensus.graph_consensus_summary} />
                      </div>
                    )}
                  </div>
                )}

                {/* Argument strength cards */}
                <ResultsSection
                  consensus={state.consensus}
                  counterfactual={state.counterfactual}
                  report={state.report}
                  hierarchy={state.qbafHierarchy}
                  strengths={state.qbafStrengths}
                  expertNames={expertNames}
                  expertAvatars={expertAvatars}
                />

                {/* Crux cards */}
                {state.cruxCards.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-accent text-[10px]">♠</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted">Flip Conditions</span>
                      <span className="text-[10px] text-muted">({state.cruxCards.length})</span>
                    </div>
                    <div className="space-y-3">
                      {[...state.cruxCards]
                        .sort((a, b) => b.importance - a.importance)
                        .map((card, i) => (
                          <ArgumentCruxCard key={i} card={card} />
                        ))}
                    </div>
                  </div>
                )}
                {state.cruxCards.length === 0 && (
                  <div className="rounded-xl border border-card-border bg-surface p-6 text-center">
                    <p className="text-xs text-muted">No high-impact flip conditions found — argument strengths are robust.</p>
                  </div>
                )}

                {/* Baseline benchmarks */}
                <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-card-border">
                    <span className="text-foreground/20 text-[10px]">♦</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">Baseline Crux Methods</span>
                    {arenaOutputs.length > 0 && state.arenaDebateId && (
                      <a
                        href={`/arena?debate=${state.arenaDebateId}`}
                        className="text-[10px] text-accent hover:text-foreground transition-colors"
                      >
                        View in CruxBench &rarr;
                      </a>
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    {arenaOutputs.length > 0 ? (
                      <div className="space-y-6 pt-4">
                        {arenaOutputs.map(output => (
                          <div key={output.method} className="space-y-3">
                            <div className="flex items-center gap-2 pb-1 border-b border-card-border">
                              <span className="text-xs font-semibold text-foreground">
                                {ARENA_METHOD_LABELS[output.method] ?? output.method}
                              </span>
                              <span className="text-[10px] font-mono text-muted">{output.model}</span>
                              <span className="text-[10px] text-muted ml-auto">
                                {output.runtimeMs >= 60000
                                  ? `${(output.runtimeMs / 60000).toFixed(1)}m`
                                  : `${(output.runtimeMs / 1000).toFixed(1)}s`}
                                {' · '}{output.cruxCards.length} cards
                              </span>
                            </div>
                            <div className="space-y-2">
                              {output.cruxCards.map((card, i) => (
                                <CruxCardDisplay key={i} card={card} index={i} showImportance={false} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center space-y-3">
                        <p className="text-xs text-muted">
                          Run Direct, CoT, and Multi-Agent crux extraction on this debate and compare with ARGORA in CruxBench.
                        </p>
                        {!comparisonRan && (
                          <button
                            onClick={runComparison}
                            disabled={comparisonRunning || !state.arenaDebateId}
                            className="text-xs border border-accent/60 text-accent hover:bg-accent hover:text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                          >
                            {comparisonRunning ? 'Running...' : 'Run Comparison'}
                          </button>
                        )}
                        {comparisonRunning && (
                          <p className="text-[10px] text-muted animate-pulse">Extracting cruxes with baseline methods...</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeResultTab === 'analysis' && (
              <div className="space-y-4">
                {/* Score legend */}
                <div className="rounded-xl border border-card-border bg-surface p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Score Legend</p>
                  <div className="space-y-1 text-[11px] text-muted">
                    <p><span className="font-mono text-foreground">&tau;</span> &mdash; Initial score before attacks and supports are considered</p>
                    <p><span className="font-mono text-foreground">&sigma;</span> &mdash; Final score after the full debate (higher = stronger argument)</p>
                    <p><span className="font-mono text-foreground">&Delta;</span> &mdash; Lift: how much the debate changed each argument&apos;s standing</p>
                  </div>
                </div>

                {/* Expert divergence */}
                {state.divergenceMap && (
                  <div className="rounded-xl border border-card-border bg-surface p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">Expert Contributions</p>
                    <div className="space-y-2">
                      {Object.entries(state.divergenceMap.per_expert).map(([expert, data]) => {
                        const displayName = expertNames.get(expert) ?? expert
                        const isCruxDriver = state.divergenceMap!.crux_facets.includes(expert) ||
                          state.divergenceMap!.pairwise.some(p => (p.expert_a === expert || p.expert_b === expert) && p.is_crux)
                        return (
                          <div key={expert} className="flex items-center gap-3 p-2 rounded border border-card-border bg-card-bg">
                            <span className="text-xs text-foreground font-medium flex-1">{displayName}</span>
                            <span className="text-[10px] font-mono text-foreground">&sigma; {data.root_strength.toFixed(3)}</span>
                            <span className="text-[10px] text-foreground/40">{data.support_count}+ {data.attack_count}&minus;</span>
                            {isCruxDriver && (
                              <span className="text-[9px] px-1.5 py-px rounded bg-accent/10 text-accent font-medium uppercase">crux driver</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Top 3 argument strengths table */}
                {state.qbafHierarchy.filter(n => n.type === 'main_argument').length > 0 && (
                  <div className="rounded-xl border border-card-border bg-surface p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">Argument Strengths</p>
                    <div className="space-y-2">
                      {state.qbafHierarchy
                        .filter(n => n.type === 'main_argument')
                        .sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
                        .slice(0, 3)
                        .map((node, i) => {
                          const lift = (node.final_score ?? 0) - (node.initial_score ?? 0)
                          return (
                            <div key={i} className="flex items-center gap-3 p-2 rounded border border-card-border bg-card-bg">
                              <span className="text-[10px] text-muted font-mono w-4">{i + 1}</span>
                              <span className="text-[11px] text-foreground flex-1 line-clamp-1">{stripMarkdown(node.statement)}</span>
                              <span className="text-[10px] font-mono text-muted">&tau; {node.initial_score?.toFixed(2) ?? '—'}</span>
                              <span className="text-[10px] font-mono text-foreground">&sigma; {node.final_score?.toFixed(2) ?? '—'}</span>
                              <span className={`text-[10px] font-mono ${lift >= 0 ? 'text-foreground/50' : 'text-accent'}`}>
                                {lift >= 0 ? '+' : ''}{lift.toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Full technical analysis */}
                <TechnicalAnalysis
                  baseScores={state.baseScores}
                  consensus={state.consensus}
                  report={state.report}
                  hierarchy={state.qbafHierarchy}
                  strengths={state.qbafStrengths}
                  counterfactual={state.counterfactual}
                  experts={state.experts}
                  expertNames={expertNames}
                  fullResult={state.fullResult}
                />

                {/* CruxBench link */}
                {state.arenaDebateId && (
                  <div className="rounded-xl border border-card-border bg-surface p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Compare in CruxBench</p>
                      <p className="text-[10px] text-muted mt-0.5">Run blind comparison against other crux methods</p>
                    </div>
                    <a
                      href={`/arena?debate=${state.arenaDebateId}`}
                      className="text-xs border border-accent/60 text-accent hover:bg-accent hover:text-white px-4 py-2 rounded transition-colors"
                    >
                      View in CruxBench &rarr;
                    </a>
                  </div>
                )}

              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
