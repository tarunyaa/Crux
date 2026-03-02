'use client'

// ─── Belief Graph Experiment Dashboard ───────────────────────

import { useState, useEffect } from 'react'
import { useBeliefGraphStream } from '@/lib/hooks/useBeliefGraphStream'
import { QBAFGraph } from './QBAFGraph'
import { StructuralCruxCard } from './StructuralCruxCard'
import { BenchmarkDashboard } from './BenchmarkDashboard'
import { RoundTimeline } from './RoundTimeline'

type ViewMode = 'persona-a' | 'persona-b' | 'community' | 'diff'

interface BeliefGraphViewProps {
  topic: string
  personaIds: [string, string]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  maxRounds?: number
}

export function BeliefGraphView({ topic, personaIds, personaNames, personaAvatars, maxRounds = 3 }: BeliefGraphViewProps) {
  const stream = useBeliefGraphStream(topic, personaIds, maxRounds)
  const [viewMode, setViewMode] = useState<ViewMode>('persona-a')
  const [selectedRound, setSelectedRound] = useState(0)

  const [pidA, pidB] = personaIds
  const nameA = personaNames.get(pidA) ?? pidA
  const nameB = personaNames.get(pidB) ?? pidB

  useEffect(() => {
    stream.start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update selected round as new rounds come in
  useEffect(() => {
    if (stream.rounds.length > 0) {
      setSelectedRound(stream.rounds.length - 1)
    }
  }, [stream.rounds.length])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-card-border px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-accent uppercase tracking-wider">
              Belief Graph Experiment
            </span>
            <StatusBadge phase={stream.phase} isRunning={stream.isRunning} />
          </div>
          <h1 className="text-lg text-foreground font-medium">{topic}</h1>
          <p className="text-xs text-muted mt-1">
            {nameA} vs {nameB}
            {stream.rounds.length > 0 && ` · ${stream.rounds.length - 1} rounds`}
            {stream.communityGraph && ` · ${stream.communityGraph.nodes.length} nodes`}
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Error */}
        {stream.error && (
          <div className="bg-card-bg border border-danger rounded-lg p-4 text-danger text-sm">
            {stream.error}
          </div>
        )}

        {/* Loading state */}
        {stream.isRunning && stream.phase === 'extracting' && (
          <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center">
            <div className="text-muted text-sm">Extracting belief graphs...</div>
            <div className="text-xs text-muted mt-2">
              {Object.keys(stream.qbafs).length}/2 personas extracted
            </div>
          </div>
        )}

        {stream.isRunning && stream.phase === 'debating' && (
          <div className="bg-card-bg border border-card-border rounded-lg p-4 text-center">
            <div className="text-muted text-sm">Round {stream.currentRound} in progress...</div>
          </div>
        )}

        {/* Main content: graph + cruxes */}
        {Object.keys(stream.qbafs).length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Graph panel (2/3) */}
            <div className="lg:col-span-2 space-y-4">
              {/* View mode toggle */}
              <div className="flex gap-2">
                {([
                  ['persona-a', nameA],
                  ['persona-b', nameB],
                  ['community', 'Community'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                      viewMode === mode
                        ? 'bg-accent text-white'
                        : 'bg-surface text-muted border border-card-border hover:text-foreground'
                    }`}
                    disabled={mode === 'community' && !stream.communityGraph}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Graph */}
              <QBAFGraph
                qbafs={stream.qbafs}
                communityGraph={stream.communityGraph}
                personaIds={personaIds}
                viewMode={viewMode}
                selectedRound={selectedRound}
              />
            </div>

            {/* Crux cards panel (1/3) */}
            <div className="space-y-4">
              <h2 className="text-xs font-mono text-accent uppercase tracking-wider">
                Structural Cruxes
              </h2>
              {stream.cruxes.length === 0 ? (
                <p className="text-xs text-muted">
                  {stream.isComplete ? 'No cruxes identified' : 'Waiting for community graph...'}
                </p>
              ) : (
                stream.cruxes.map((crux, i) => (
                  <StructuralCruxCard
                    key={crux.id}
                    crux={crux}
                    rank={i + 1}
                    personaNames={personaNames}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Benchmarks */}
        {stream.benchmarks && (
          <BenchmarkDashboard benchmarks={stream.benchmarks} personaNames={personaNames} />
        )}

        {/* Round timeline */}
        {stream.rounds.length > 0 && (
          <RoundTimeline
            rounds={stream.rounds}
            revisionDetails={stream.revisionDetails}
            selectedRound={selectedRound}
            onSelectRound={setSelectedRound}
            personaNames={personaNames}
          />
        )}
      </main>
    </div>
  )
}

function StatusBadge({ phase, isRunning }: { phase: string; isRunning: boolean }) {
  if (!isRunning && phase === 'complete') {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface text-accent border border-accent/30">
        complete
      </span>
    )
  }
  if (isRunning) {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface text-muted border border-card-border animate-pulse">
        {phase}
      </span>
    )
  }
  return null
}
