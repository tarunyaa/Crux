'use client'

import { useEffect, useRef, useState } from 'react'
import { useArgumentStream } from '@/lib/hooks/useArgumentStream'
import type { BridgeConfig } from '@/lib/argument/bridge'
import type { BaselineResult } from '@/lib/argument/types'
import { ArgumentTimeline } from './ArgumentTimeline'
import HexAvatar from '@/components/HexAvatar'
import { ResultsSection } from './ResultsSection'
import { TechnicalAnalysis } from './TechnicalAnalysis'
import { MethodComparison } from './MethodComparison'

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
  baselines: 'Running Baselines',
  complete: 'Complete',
}

export function GraphDebateView({ config, personaNames, personaAvatars }: GraphDebateViewProps) {
  const { state, messages, start } = useArgumentStream(config)
  const startedRef = useRef(false)
  const [localBaselineResults, setLocalBaselineResults] = useState<BaselineResult[]>([])
  const [baselinesRunning, setBaselinesRunning] = useState(false)
  const [baselinesRan, setBaselinesRan] = useState(false)
  const [verdictOpen, setVerdictOpen] = useState(true)
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const [baselinesOpen, setBaselinesOpen] = useState(false)

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
    setBaselinesRunning(true)
    try {
      const res = await fetch('/api/argument/baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: config.topic }),
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
            if (event.type === 'baseline_result') {
              const d = event.data
              setLocalBaselineResults(prev => [...prev, {
                method: d.method,
                label: d.label,
                answer: d.answer,
                reasoning: d.reasoning,
                mainTask: d.main_task,
                tokenUsage: d.token_usage,
                error: d.error,
              }])
            }
          } catch { /* skip */ }
        }
      }
      setBaselinesRan(true)
    } finally {
      setBaselinesRunning(false)
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
          {/* Header row */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <span className="text-foreground/20 text-sm">♠</span>
            <div className="flex-1 h-px bg-card-border opacity-40" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Debate Topic</span>
            <div className="flex-1 h-px bg-card-border opacity-40" />
            <span className="text-foreground/20 text-sm">♠</span>
          </div>

          {/* Topic text */}
          <div className="px-5 pb-4">
            <p className="text-base font-semibold text-foreground leading-snug">
              {state.framedTopic && state.framedTopic !== config.topic
                ? state.framedTopic
                : config.topic}
            </p>
          </div>

          {/* Positions — only when available */}
          {state.positions.length > 0 && (
            <>
              <div className="h-px bg-card-border opacity-40 mx-5" />
              <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {state.positions.map((pos, i) => {
                  const suits = ['♠', '♥', '♦', '♣'] as const
                  const suit = suits[i % 4]
                  const isRed = suit === '♥' || suit === '♦'
                  // Match persona to this position by index
                  const personaId = config.personaIds?.[i]
                  const personaName = personaId ? personaNames.get(personaId) : null
                  const personaAvatar = personaId ? personaAvatars.get(personaId) : null

                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`text-sm flex-shrink-0 mt-0.5 ${isRed ? 'text-accent' : 'text-foreground/30'}`}>
                        {suit}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {personaAvatar && (
                            <HexAvatar src={personaAvatar} alt={personaName ?? ''} size={16} fallbackInitial={(personaName ?? '?').charAt(0)} />
                          )}
                          <span className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider">
                            {pos.shortName || pos.label || `Position ${String.fromCharCode(65 + i)}`}
                          </span>
                          {personaName && (
                            <span className={`text-[10px] font-medium ${isRed ? 'text-accent' : 'text-foreground/40'}`}>
                              · {personaName.split(' ')[0]}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted leading-snug">{pos.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
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
          </div>
        </div>

        {/* Results — shown when complete, collapsible sections */}
        {isComplete && (
          <div className="space-y-2 pt-2">
            {/* Verdict */}
            {state.consensus && (
              <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
                <button
                  onClick={() => setVerdictOpen(v => !v)}
                  className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-card-bg/50 transition-colors"
                >
                  <span className="text-accent text-[10px]">♥</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">Verdict</span>
                  {state.consensus.winner_score != null && (
                    <span className="text-[10px] font-mono text-accent mr-2">
                      &sigma; = {state.consensus.winner_score.toFixed(4)}
                    </span>
                  )}
                  <span className="text-muted text-xs">{verdictOpen ? '▴' : '▾'}</span>
                </button>
                {verdictOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-card-border">
                    <ResultsSection
                      consensus={state.consensus}
                      counterfactual={state.counterfactual}
                      report={state.report}
                      hierarchy={state.qbafHierarchy}
                      strengths={state.qbafStrengths}
                      expertNames={expertNames}
                      expertAvatars={expertAvatars}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Technical Analysis */}
            <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
              <button
                onClick={() => setTechnicalOpen(v => !v)}
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-card-bg/50 transition-colors"
              >
                <span className="text-foreground/30 text-[10px]">♣</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">Technical Analysis</span>
                <span className="text-muted text-xs">{technicalOpen ? '▴' : '▾'}</span>
              </button>
              {technicalOpen && (
                <div className="px-4 pb-4 border-t border-card-border">
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
                </div>
              )}
            </div>

            {/* Baselines — opt-in */}
            <div className="rounded-xl border border-card-border bg-surface overflow-hidden">
              <button
                onClick={() => setBaselinesOpen(v => !v)}
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-card-bg/50 transition-colors"
              >
                <span className="text-accent text-[10px]">♦</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">Baseline Comparison</span>
                {localBaselineResults.length > 0 && (
                  <span className="text-[10px] text-muted mr-2">{localBaselineResults.length} baselines</span>
                )}
                <span className="text-muted text-xs">{baselinesOpen ? '▴' : '▾'}</span>
              </button>
              {baselinesOpen && (
                <div className="px-4 pb-4 border-t border-card-border">
                  {localBaselineResults.length > 0 ? (
                    <MethodComparison
                      results={localBaselineResults}
                      consensus={state.consensus}
                      topic={config.topic}
                    />
                  ) : (
                    <div className="py-6 text-center space-y-3">
                      <p className="text-xs text-muted">
                        Compare ARGORA against direct prompting and CoT baselines.
                      </p>
                      {!baselinesRan && (
                        <button
                          onClick={runComparison}
                          disabled={baselinesRunning}
                          className="text-xs border border-accent/60 text-accent hover:bg-accent hover:text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                        >
                          {baselinesRunning ? 'Running...' : 'Run Comparison'}
                        </button>
                      )}
                      {baselinesRunning && (
                        <p className="text-[10px] text-muted animate-pulse">Comparing against baselines...</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
