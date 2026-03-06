'use client'

import { useState, useRef, useEffect } from 'react'
import type { ArenaOutput, ArenaMethod, ArenaStats, ArenaDebate } from '@/lib/arena/types'
import { ARENA_METHOD_LABELS } from '@/lib/arena/types'
import { PairwiseVoting } from '@/components/arena/PairwiseVoting'
import { ArenaDashboard } from '@/components/arena/ArenaDashboard'
import { CruxCardDisplay } from '@/components/arena/CruxCardDisplay'

type Phase = 'idle' | 'running' | 'voting' | 'results'

interface MethodProgress {
  method: ArenaMethod
  status: 'waiting' | 'running' | 'complete' | 'error'
  error?: string
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'arena_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

interface Props {
  initialStats: ArenaStats | null
  initialDebates: ArenaDebate[]
  initialDebateId?: string
  initialOutputs?: ArenaOutput[]
}

export function ArenaClient({
  initialStats,
  initialDebates,
  initialDebateId,
  initialOutputs,
}: Props) {
  const [phase, setPhase] = useState<Phase>(
    initialDebateId && initialOutputs && initialOutputs.length > 0 ? 'voting' : 'idle',
  )
  const [topic, setTopic] = useState('')
  const [progress, setProgress] = useState<MethodProgress[]>([])
  const [outputs, setOutputs] = useState<ArenaOutput[]>(initialOutputs ?? [])
  const [debateId, setDebateId] = useState<string>(initialDebateId ?? '')
  const [stats, setStats] = useState<ArenaStats | null>(initialStats)
  const [debates] = useState<ArenaDebate[]>(initialDebates)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const METHODS: ArenaMethod[] = ['direct_crux', 'cot_crux', 'multiagent_crux']

  const runArena = async () => {
    if (!topic.trim() || startedRef.current) return
    startedRef.current = true
    setError(null)
    setOutputs([])
    setProgress(METHODS.map(m => ({ method: m, status: 'waiting' })))
    setPhase('running')

    try {
      const res = await fetch('/api/arena/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), methods: METHODS }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Request failed')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let savedDebateId = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue
          try {
            const event = JSON.parse(json)
            handleEvent(event, (id) => { savedDebateId = id })
          } catch { /* skip */ }
        }
      }

      if (savedDebateId) setDebateId(savedDebateId)
      setPhase('voting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
      startedRef.current = false
    }
  }

  const handleEvent = (event: { type: string; data?: unknown }, onSaved: (id: string) => void) => {
    switch (event.type) {
      case 'arena_start': {
        const d = event.data as { debateId: string }
        setDebateId(d.debateId)
        break
      }
      case 'method_start': {
        const d = event.data as { method: ArenaMethod }
        setProgress(prev =>
          prev.map(p => p.method === d.method ? { ...p, status: 'running' } : p),
        )
        break
      }
      case 'method_complete': {
        const d = event.data as {
          method: ArenaMethod
          crux_cards: ArenaOutput['cruxCards']
          model: string
          runtime_ms: number
          token_usage: Record<string, number>
        }
        setProgress(prev =>
          prev.map(p => p.method === d.method ? { ...p, status: 'complete' } : p),
        )
        setOutputs(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            debateId: '',
            method: d.method,
            cruxCards: d.crux_cards ?? [],
            tokenUsage: d.token_usage ?? {},
            runtimeMs: d.runtime_ms ?? 0,
            model: d.model,
            costUsd: null,
          },
        ])
        break
      }
      case 'method_error': {
        const d = event.data as { method: ArenaMethod; error: string }
        setProgress(prev =>
          prev.map(p => p.method === d.method ? { ...p, status: 'error', error: d.error } : p),
        )
        break
      }
      case 'saved': {
        const d = event.data as { debateId: string }
        onSaved(d.debateId)
        break
      }
      case 'error': {
        const d = event.data as { message: string }
        setError(d.message)
        break
      }
    }
  }

  const onVotingComplete = async () => {
    setPhase('results')
    // Refresh stats
    try {
      const res = await fetch('/api/arena/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* non-blocking */ }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">CruxArena</h1>
        <p className="mt-2 text-muted text-sm">
          Blind pairwise comparison of debate methods. Which finds the real cruxes?
        </p>
      </div>

      {/* Topic input (only in idle) */}
      {phase === 'idle' && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runArena()}
              placeholder="Enter a debate topic..."
              className="flex-1 rounded border border-card-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={runArena}
              disabled={!topic.trim()}
              className="rounded bg-accent px-6 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Run Arena
            </button>
          </div>
          {error && (
            <p className="text-sm text-accent">{error}</p>
          )}
          <p className="text-xs text-muted">
            Runs 3 methods: Direct Crux (gpt-4o-mini), CoT Crux (o3), Multi-Agent (gpt-4o-mini).
            Takes 1–3 minutes.
          </p>
        </div>
      )}

      {/* Running: show per-method progress */}
      {phase === 'running' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Running methods on: <span className="text-foreground normal-case">{topic}</span>
          </h2>
          <div className="space-y-2">
            {progress.map(p => (
              <div
                key={p.method}
                className="flex items-center gap-3 rounded-lg border border-card-border bg-card-bg px-4 py-3"
              >
                <StatusDot status={p.status} />
                <span className="text-sm text-foreground">{ARENA_METHOD_LABELS[p.method]}</span>
                {p.status === 'running' && (
                  <span className="ml-auto text-xs text-muted animate-pulse">running...</span>
                )}
                {p.status === 'complete' && (
                  <span className="ml-auto text-xs text-muted">done</span>
                )}
                {p.status === 'error' && (
                  <span className="ml-auto text-xs text-accent">{p.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voting */}
      {phase === 'voting' && outputs.length >= 2 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Vote: <span className="text-foreground normal-case font-normal">{topic || 'loaded debate'}</span>
          </h2>
          <PairwiseVoting
            debateId={debateId}
            outputs={outputs}
            sessionId={getOrCreateSessionId()}
            onComplete={onVotingComplete}
          />
        </div>
      )}

      {/* Results: reveal methods */}
      {phase === 'results' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Results</h2>
            <button
              onClick={() => {
                setPhase('idle')
                setTopic('')
                setOutputs([])
                setProgress([])
                startedRef.current = false
              }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Run another
            </button>
          </div>

          <div className="space-y-6">
            {outputs.map(output => (
              <div key={output.method} className="space-y-3">
                <div className="flex items-center gap-3 border-b border-card-border pb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {ARENA_METHOD_LABELS[output.method]}
                  </h3>
                  <span className="text-xs text-muted font-mono">{output.model}</span>
                  <span className="text-xs text-muted ml-auto">
                    {output.runtimeMs >= 60000
                      ? `${(output.runtimeMs / 60000).toFixed(1)}m`
                      : `${(output.runtimeMs / 1000).toFixed(1)}s`}
                    {' · '}
                    {output.cruxCards.length} cards
                  </span>
                </div>
                <div className="space-y-3">
                  {output.cruxCards.map((card, i) => (
                    <CruxCardDisplay
                      key={i}
                      card={card}
                      index={i}
                      showImportance={output.method === 'argora_crux'}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard (always shown in idle or results) */}
      {(phase === 'idle' || phase === 'results') && (
        <ArenaDashboard stats={stats} debates={debates} />
      )}
    </div>
  )
}

function StatusDot({ status }: { status: MethodProgress['status'] }) {
  if (status === 'waiting') {
    return <div className="h-2 w-2 rounded-full bg-card-border" />
  }
  if (status === 'running') {
    return <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
  }
  if (status === 'complete') {
    return <div className="h-2 w-2 rounded-full bg-foreground" />
  }
  return <div className="h-2 w-2 rounded-full bg-accent" />
}
