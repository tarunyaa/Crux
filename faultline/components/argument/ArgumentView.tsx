'use client'

import { useEffect, useRef, useState } from 'react'
import { useArgumentStream } from '@/lib/hooks/useArgumentStream'
import type { BridgeConfig } from '@/lib/argument/bridge'
import type { BaselineResult } from '@/lib/argument/types'
import { ArgumentTimeline } from './ArgumentTimeline'
import { ResultsSection } from './ResultsSection'
import { MethodComparison } from './MethodComparison'
import { TechnicalAnalysis } from './TechnicalAnalysis'

interface ArgumentViewProps {
  config: BridgeConfig
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

type ResultTab = 'results' | 'benchmarks' | 'technical'

export function ArgumentView({ config, personaNames, personaAvatars }: ArgumentViewProps) {
  const { state, messages, start } = useArgumentStream(config)
  const startedRef = useRef(false)
  const [showResults, setShowResults] = useState(false)
  const [activeTab, setActiveTab] = useState<ResultTab>('results')
  const [localBaselineResults, setLocalBaselineResults] = useState<BaselineResult[]>([])
  const [baselinesRunning, setBaselinesRunning] = useState(false)
  const [baselinesRan, setBaselinesRan] = useState(false)

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
              const d = event.data as {
                method: BaselineResult['method']
                label: string
                answer: string | null
                reasoning: string | null
                main_task?: string
                token_usage?: Record<string, number>
                error?: string
              }
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
          } catch { /* skip malformed lines */ }
        }
      }
      setBaselinesRan(true)
    } finally {
      setBaselinesRunning(false)
    }
  }

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state.phase === 'complete') setShowResults(true)
  }, [state.phase])

  const isRunning = !['idle', 'complete', 'error'].includes(state.phase)
  const isComplete = state.phase === 'complete'

  // Build expert-to-persona mapping
  const expertNames = new Map<string, string>()
  const expertAvatars = new Map<string, string>()
  if (config.personaIds && config.personaIds.length > 0) {
    state.experts.forEach((expert, i) => {
      const personaId = config.personaIds![i]
      if (personaId) {
        const name = personaNames.get(personaId) ?? expert
        expertNames.set(expert, name)
        const avatar = personaAvatars.get(personaId)
        if (avatar) expertAvatars.set(expert, avatar)
      }
    })
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

  const phaseLabel: Record<string, string> = {
    idle: 'Idle',
    starting: 'Initializing',
    experts: 'Selecting Experts',
    arguments: 'Generating Arguments',
    building: 'Building Graph',
    scoring: 'Scoring',
    evaluating: 'QBAF Evaluation',
    analyzing: 'Counterfactual Analysis',
    baselines: 'Running Benchmarks',
    complete: 'Complete',
  }

  const tabs: { id: ResultTab; label: string; suit: string }[] = [
    { id: 'results', label: 'Debate Results', suit: '♥' },
    { id: 'benchmarks', label: 'Benchmarks', suit: '♦' },
    { id: 'technical', label: 'Technical Analysis', suit: '♣' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Top Bar ─── */}
      <div className="border-b border-card-border bg-surface/50">
        <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            {isRunning && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[10px] text-muted uppercase tracking-wider">
                  {phaseLabel[state.phase] || state.phase}
                </span>
              </div>
            )}
            {isComplete && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 text-foreground/50 font-medium uppercase tracking-wider">
                Complete
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Results toggle */}
          {isComplete && (
            <button
              onClick={() => setShowResults(!showResults)}
              className="text-[10px] text-accent hover:text-foreground transition-colors uppercase tracking-wider"
            >
              {showResults ? 'Hide Results' : 'Show Results'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Main Layout ─── */}
      <div className="max-w-4xl mx-auto px-6 py-5">

        {/* Debate Topic card */}
        <div className="rounded-xl border border-card-border bg-surface px-4 py-3 mb-4">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Debate Topic</p>
          <p className="text-sm text-foreground font-medium leading-snug">{config.topic}</p>
        </div>

        {/* Debate Timeline — full width */}
        <ArgumentTimeline
          messages={messages}
          experts={state.experts}
          expertNames={expertNames}
          expertAvatars={expertAvatars}
          phase={state.phase}
          consensus={state.consensus}
        />

        {/* ─── Results Sections (Tabbed) ─── */}
        {showResults && isComplete && (
          <div className="mt-8">
            {/* Section divider */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-accent text-xs">♠</span>
              <div className="flex-1 h-px bg-card-border" />
              <div className="flex items-center gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`text-[10px] px-3 py-1.5 rounded uppercase tracking-wider font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <span className="mr-1">{tab.suit}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 h-px bg-card-border" />
              <span className="text-accent text-xs">♠</span>
            </div>

            {/* Tab Content */}
            {activeTab === 'results' && (
              <ResultsSection
                consensus={state.consensus}
                counterfactual={state.counterfactual}
                report={state.report}
                hierarchy={state.qbafHierarchy}
                strengths={state.qbafStrengths}
                expertNames={expertNames}
                expertAvatars={expertAvatars}
              />
            )}

            {activeTab === 'benchmarks' && (
              <div className="max-w-5xl">
                {localBaselineResults.length > 0 ? (
                  <MethodComparison
                    results={localBaselineResults}
                    consensus={state.consensus}
                    topic={config.topic}
                  />
                ) : (
                  <div className="rounded-xl border border-card-border bg-surface p-8 text-center space-y-4">
                    <p className="text-xs text-muted">
                      Run a comparison against direct prompting baselines to see how ARGORA&apos;s structured argumentation performs.
                    </p>
                    {!baselinesRan && (
                      <button
                        onClick={runComparison}
                        disabled={baselinesRunning}
                        className="text-xs border border-accent/60 text-accent hover:bg-accent hover:text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                      >
                        {baselinesRunning ? 'Running Comparison...' : 'Run Comparison'}
                      </button>
                    )}
                    {baselinesRunning && (
                      <p className="text-[10px] text-muted animate-pulse">Comparing against direct and CoT baselines&hellip;</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'technical' && (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
