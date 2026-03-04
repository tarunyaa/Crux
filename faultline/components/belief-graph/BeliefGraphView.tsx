'use client'

// ─── Belief Graph Experiment Dashboard ───────────────────────
// Fit-to-screen: header + graph fill viewport, results in tabbed panel below graph.

import { useState, useEffect, useMemo } from 'react'
import { useBeliefGraphStream } from '@/lib/hooks/useBeliefGraphStream'
import { QBAFGraph } from './QBAFGraph'
import { StructuralCruxCard } from './StructuralCruxCard'
import { BenchmarkDashboard } from './BenchmarkDashboard'
import type { PairwiseDiff, ClaimMapping, PersonaQBAF } from '@/lib/belief-graph/types'

interface BeliefGraphViewProps {
  topic: string
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

function resolveNodeClaim(nodeId: string, qbafs: Record<string, PersonaQBAF>): string {
  for (const qbaf of Object.values(qbafs)) {
    const node = qbaf.nodes.find(n => n.id === nodeId)
    if (node) return node.claim
  }
  return nodeId
}

function PersonaAvatar({ name, avatarUrl, size = 20 }: { name: string; avatarUrl?: string; size?: number }) {
  const [imgError, setImgError] = useState(false)

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    )
  }

  const initial = name.charAt(0).toUpperCase()
  return (
    <span
      className="rounded-full bg-surface border border-card-border flex items-center justify-center text-muted font-mono flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {initial}
    </span>
  )
}

type SectionTab = 'cruxes' | 'diffs' | 'revisions' | 'benchmarks'

export function BeliefGraphView({ topic, personaIds, personaNames, personaAvatars }: BeliefGraphViewProps) {
  const stream = useBeliefGraphStream(topic, personaIds)
  const [viewMode, setViewMode] = useState<string>(personaIds[0])
  const [activeSection, setActiveSection] = useState<SectionTab>('cruxes')

  useEffect(() => {
    stream.start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const personaLabel = (pid: string) => personaNames.get(pid) ?? pid

  const nodeClaimLookup = useMemo(() => {
    return (nodeId: string) => resolveNodeClaim(nodeId, stream.qbafs)
  }, [stream.qbafs])

  const cruxCount = stream.cruxes.length
  const diffCount = stream.diffs.length
  const revisionCount = stream.revisions.length
  const hasBenchmarks = !!stream.benchmarks
  const hasQbafs = Object.keys(stream.qbafs).length > 0
  const hasResults = cruxCount > 0 || diffCount > 0 || revisionCount > 0 || hasBenchmarks

  const sections: { id: SectionTab; label: string; count?: number; available: boolean }[] = [
    { id: 'cruxes', label: 'Cruxes', count: cruxCount, available: cruxCount > 0 || stream.isComplete },
    { id: 'diffs', label: 'Diffs', count: diffCount, available: diffCount > 0 },
    { id: 'revisions', label: 'Revisions', count: revisionCount, available: revisionCount > 0 },
    { id: 'benchmarks', label: 'Benchmarks', available: hasBenchmarks },
  ]

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Header (fixed height) ── */}
      <header className="flex-shrink-0 border-b border-card-border px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-0.5">
            <span className="text-xs font-mono text-accent uppercase tracking-wider">
              Belief Graph
            </span>
            <StatusBadge phase={stream.phase} isRunning={stream.isRunning} />
          </div>
          <div className="flex items-baseline gap-4">
            <h1 className="text-base text-foreground font-medium">{topic}</h1>
            <p className="text-xs text-muted">
              {personaIds.map(pid => personaLabel(pid)).join(' vs ')}
              {stream.diffs.length > 0 && ` · ${stream.diffs.length} diffs`}
              {stream.communityGraph && ` · ${stream.communityGraph.nodes.length} nodes`}
            </p>
          </div>
        </div>
      </header>

      {/* ── Main content (fills remaining viewport) ── */}
      <div className="flex-1 min-h-0 flex flex-col max-w-7xl mx-auto w-full px-6 py-3 gap-3">
        {/* Error */}
        {stream.error && (
          <div className="flex-shrink-0 bg-card-bg border border-danger rounded-lg p-3 text-danger text-sm">
            {stream.error}
          </div>
        )}

        {/* Loading states */}
        {stream.isRunning && !hasQbafs && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center">
              <div className="text-muted text-sm">
                {stream.phase === 'extracting' && 'Scoping beliefs to topic...'}
                {stream.phase === 'diffing' && 'Computing pairwise structural diffs...'}
                {stream.phase === 'revising' && 'Revising beliefs from discovered contradictions...'}
              </div>
              {stream.phase === 'extracting' && (
                <div className="text-xs text-muted mt-2">
                  {Object.keys(stream.qbafs).length}/{personaIds.length} personas ready
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Graph area (flexes to fill available space) ── */}
        {hasQbafs && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {/* Persona tabs + phase indicator */}
            <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
              {personaIds.map(pid => (
                <button
                  key={pid}
                  onClick={() => setViewMode(pid)}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors flex items-center gap-1.5 ${
                    viewMode === pid
                      ? 'bg-accent text-white'
                      : 'bg-surface text-muted border border-card-border hover:text-foreground'
                  }`}
                >
                  <PersonaAvatar
                    name={personaLabel(pid)}
                    avatarUrl={personaAvatars.get(pid)}
                    size={16}
                  />
                  {personaLabel(pid)}
                </button>
              ))}
              <button
                onClick={() => setViewMode('community')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                  viewMode === 'community'
                    ? 'bg-accent text-white'
                    : 'bg-surface text-muted border border-card-border hover:text-foreground'
                }`}
                disabled={!stream.communityGraph}
              >
                Community
              </button>

              {/* Running phase indicator inline */}
              {stream.isRunning && hasQbafs && (
                <span className="text-[10px] text-muted font-mono animate-pulse ml-auto">
                  {stream.phase === 'diffing' && `diffing ${stream.diffs.length}/${personaIds.length * (personaIds.length - 1) / 2}`}
                  {stream.phase === 'revising' && 'revising beliefs...'}
                  {stream.phase === 'building-community' && 'building community graph...'}
                </span>
              )}
            </div>

            {/* Graph — fills remaining vertical space */}
            <QBAFGraph
              qbafs={stream.qbafs}
              communityGraph={stream.communityGraph}
              personaIds={personaIds}
              viewMode={viewMode}
              revisedNodeIds={stream.revisedNodeIds}
            />
          </div>
        )}

        {/* ── Results panel (fixed height, scrollable) ── */}
        {hasResults && (
          <div className="flex-shrink-0 max-h-[40vh] flex flex-col border border-card-border rounded-lg overflow-hidden">
            {/* Tab bar */}
            <div className="flex-shrink-0 flex gap-1 border-b border-card-border bg-card-bg px-2">
              {sections.filter(s => s.available).map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors relative ${
                    activeSection === section.id
                      ? 'text-accent'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {section.label}
                  {section.count !== undefined && section.count > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted">{section.count}</span>
                  )}
                  {activeSection === section.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-px bg-accent" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content (scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {activeSection === 'cruxes' && (
                <div>
                  {cruxCount === 0 ? (
                    <p className="text-xs text-muted">
                      {stream.isComplete ? 'No cruxes identified' : 'Waiting for community graph...'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {stream.cruxes.map((crux, i) => (
                        <StructuralCruxCard
                          key={crux.id}
                          crux={crux}
                          rank={i + 1}
                          personaNames={personaNames}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'diffs' && diffCount > 0 && (
                <div className="space-y-3">
                  {stream.diffs.map((diff, i) => (
                    <PairwiseDiffCard
                      key={i}
                      diff={diff}
                      personaLabel={personaLabel}
                      resolveNode={nodeClaimLookup}
                    />
                  ))}
                </div>
              )}

              {activeSection === 'revisions' && revisionCount > 0 && (
                <div className="space-y-1">
                  {stream.revisions.map((rev, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted">{personaLabel(rev.personaId)}</span>
                      <span className="text-foreground font-mono">
                        {'\u03C3'}={rev.postRootStrength.toFixed(3)}
                        <span className="text-accent ml-2">R={rev.R.toFixed(3)}</span>
                        {rev.cost > 0 && (
                          <span className="text-muted ml-2">(cost: {rev.cost.toFixed(4)})</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {stream.revisedNodeIds.size > 0 && (
                    <p className="text-[10px] text-amber-400 mt-2">
                      {stream.revisedNodeIds.size} node{stream.revisedNodeIds.size !== 1 ? 's' : ''} revised — highlighted in amber on the graph
                    </p>
                  )}
                </div>
              )}

              {activeSection === 'benchmarks' && stream.benchmarks && (
                <BenchmarkDashboard benchmarks={stream.benchmarks} personaNames={personaNames} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pairwise Diff Card ────────────────────────────────────────

function PairwiseDiffCard({
  diff,
  personaLabel,
  resolveNode,
}: {
  diff: PairwiseDiff
  personaLabel: (pid: string) => string
  resolveNode: (nodeId: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = diff.contradictions.length > 0 || diff.agreements.length > 0

  return (
    <div className="border border-card-border rounded-lg overflow-hidden">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs ${
          hasDetails ? 'cursor-pointer hover:bg-surface' : 'cursor-default'
        } transition-colors`}
      >
        <span className="text-foreground font-medium">
          {personaLabel(diff.personaA)} vs {personaLabel(diff.personaB)}
        </span>
        <span className="text-muted font-mono flex items-center gap-3">
          {diff.contradictions.length > 0 && (
            <span className="text-accent">{diff.contradictions.length} opposition</span>
          )}
          {diff.agreements.length > 0 && (
            <span>{diff.agreements.length} agreement</span>
          )}
          {diff.gaps.length > 0 && (
            <span>{diff.gaps.length} gaps</span>
          )}
          {hasDetails && (
            <span className="text-muted ml-1">{expanded ? '\u25B2' : '\u25BC'}</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-card-border px-3 py-2 space-y-3">
          {diff.contradictions.length > 0 && (
            <div className="space-y-1.5">
              {diff.contradictions.map((mapping, j) => (
                <ClaimMappingRow
                  key={`c-${j}`}
                  mapping={mapping}
                  type="opposition"
                  resolveNode={resolveNode}
                />
              ))}
            </div>
          )}

          {diff.agreements.length > 0 && (
            <div className="space-y-1.5">
              {diff.agreements.map((mapping, j) => (
                <ClaimMappingRow
                  key={`a-${j}`}
                  mapping={mapping}
                  type="agreement"
                  resolveNode={resolveNode}
                />
              ))}
            </div>
          )}

          {diff.gaps.length > 0 && (
            <div className="text-[10px] text-muted pt-1 border-t border-card-border">
              {diff.gaps.length} unmatched claim{diff.gaps.length !== 1 ? 's' : ''} (present in one persona but not the other)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClaimMappingRow({
  mapping,
  type,
  resolveNode,
}: {
  mapping: ClaimMapping
  type: 'opposition' | 'agreement'
  resolveNode: (nodeId: string) => string
}) {
  const claimA = resolveNode(mapping.nodeIdA)
  const claimB = resolveNode(mapping.nodeIdB)
  const isOpposition = type === 'opposition'

  return (
    <div className="bg-background rounded px-2.5 py-2 text-xs">
      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`flex-shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded ${
            isOpposition
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-surface text-muted border border-card-border'
          }`}
        >
          {type}
        </span>
        <span className="text-muted font-mono text-[10px] flex-shrink-0">
          {(mapping.confidence * 100).toFixed(0)}%
        </span>
        <span className="text-foreground">{mapping.sharedTopic}</span>
      </div>
      {(claimA !== mapping.nodeIdA || claimB !== mapping.nodeIdB) && (
        <div className="ml-2 pl-2 border-l border-card-border space-y-0.5">
          <div className="text-[10px] text-muted truncate" title={claimA}>A: {claimA}</div>
          <div className="text-[10px] text-muted truncate" title={claimB}>B: {claimB}</div>
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ──────────────────────────────────────────────

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
