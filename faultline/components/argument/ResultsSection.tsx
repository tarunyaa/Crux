'use client'

import { useState } from 'react'
import type {
  CounterfactualData,
  ReportData,
  QBAFHierarchyNode,
  QBAFStrength,
  ConsensusData,
} from '@/lib/argument/types'

interface ResultsSectionProps {
  consensus: ConsensusData | null
  counterfactual: CounterfactualData | null
  report: ReportData | null
  hierarchy: QBAFHierarchyNode[]
  strengths: QBAFStrength[]
  expertNames: Map<string, string>
  expertAvatars: Map<string, string>
}

const SUITS = ['♠', '♥', '♦', '♣'] as const
const SUIT_COLORS = ['text-foreground', 'text-accent', 'text-accent', 'text-foreground'] as const

// ─── Strength Card with persona profile pic ──────────────
function StrengthCard({
  node,
  isWinner,
  index,
  expertNames,
  expertAvatars,
}: {
  node: QBAFHierarchyNode
  isWinner: boolean
  index: number
  expertNames: Map<string, string>
  expertAvatars: Map<string, string>
}) {
  const suitIdx = index % 4
  const suit = SUITS[suitIdx]
  const isRed = suit === '♥' || suit === '♦'
  const displayName = expertNames.get(node.expert) ?? node.expert
  const avatarUrl = expertAvatars.get(node.expert)
  const rank = displayName.charAt(0).toUpperCase()
  const childCount = node.supplementary_args?.length ?? 0
  const attackCount = node.supplementary_args?.filter(c => c.relation === 'attack').length ?? 0
  const supportCount = childCount - attackCount

  return (
    <div className="card-3d animate-card-in group flex-shrink-0 w-40">
      <div
        className={`card-inner rounded-xl border p-3 transition-all duration-300 bg-card-bg card-shadow relative overflow-hidden ${
          isWinner
            ? 'border-accent shadow-[0_0_12px_rgba(220,38,38,0.25)]'
            : 'border-card-border hover:border-muted'
        }`}
        style={{ aspectRatio: '5/7' }}
      >
        {/* Inner inset border */}
        <div className="absolute inset-[5px] rounded border border-card-border/25 pointer-events-none" />

        {/* Top-left corner */}
        <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
          <span className={`text-[11px] font-bold ${isRed ? 'text-accent' : 'text-foreground/50'}`}>{rank}</span>
          <span className={`text-[9px] ${isRed ? 'text-accent' : 'text-foreground/50'}`}>{suit}</span>
        </div>

        {/* Bottom-right corner (inverted) */}
        <div className="absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180">
          <span className={`text-[11px] font-bold ${isRed ? 'text-accent' : 'text-foreground/50'}`}>{rank}</span>
          <span className={`text-[9px] ${isRed ? 'text-accent' : 'text-foreground/50'}`}>{suit}</span>
        </div>

        {/* Watermark suit */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={`text-7xl ${isRed ? 'text-accent' : 'text-foreground'} opacity-[0.04] leading-none`}>{suit}</span>
        </div>

        {/* Center content */}
        <div className="relative flex flex-col items-center justify-center h-full px-1 text-center gap-1.5">
          {/* Profile pic */}
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-[-1px] hex-clip" style={{ background: isWinner ? 'var(--accent)' : 'var(--card-border)' }} />
            <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-accent">{rank}</span>
              )}
            </div>
          </div>

          {/* Score */}
          <span className="text-lg font-mono font-bold text-foreground">
            {node.final_score !== null ? node.final_score.toFixed(2) : '—'}
          </span>

          {/* Expert name */}
          <p className="text-[9px] font-semibold text-foreground leading-tight line-clamp-2">{displayName}</p>

          {/* Edge counts */}
          <div className="flex items-center gap-2 text-[9px] text-muted">
            <span>{supportCount}+</span>
            <span>{attackCount}−</span>
          </div>

          {isWinner && (
            <span className="text-[8px] font-bold tracking-wider text-accent uppercase">Winner</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Counterfactual Card (PlayingCard-style) ─────────────────
function CounterfactualCard({
  statement,
  data,
  index,
}: {
  statement: string
  data: {
    baseline_root: number
    edge_impacts: Record<string, number>
    most_influential_direct_child?: { child_id: string; delta: number; edge_type: string; statement?: string }
    most_decisive_chain?: { start_node_id: string; delta_chain: number; chain_nodes: string[]; chain_statements: string[]; edge_types: string[] }
    most_influential_node?: { child_id: string; delta: number; edge_type: string; statement?: string }
  }
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const suitIdx = index % 4
  const suit = SUITS[suitIdx]
  const suitColor = SUIT_COLORS[suitIdx]

  if (expanded) {
    return (
      <div
        onClick={() => setExpanded(false)}
        className="rounded-lg border border-accent bg-card-bg p-3 shadow-[0_0_12px_rgba(220,38,38,0.15)] cursor-pointer min-w-[280px]"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm ${suitColor}`}>{suit}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Counterfactual</span>
          </div>
          <span className="text-[10px] text-muted">collapse</span>
        </div>

        <p className="text-xs font-semibold text-foreground leading-snug mb-2">{statement}</p>

        <div className="bg-surface rounded p-2 mb-2 border border-card-border">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Baseline Strength</div>
          <span className="text-xs font-mono text-foreground">{data.baseline_root.toFixed(4)}</span>
        </div>

        {data.most_influential_direct_child && (
          <div className="rounded p-2 border-l-2 border-l-accent bg-surface mb-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold text-foreground">Most Influential Child</span>
              <DeltaBadge delta={data.most_influential_direct_child.delta} />
            </div>
            {data.most_influential_direct_child.statement && (
              <p className="text-[11px] text-muted leading-snug">{data.most_influential_direct_child.statement}</p>
            )}
            <span className="text-[9px] text-muted uppercase">{data.most_influential_direct_child.edge_type}</span>
          </div>
        )}

        {data.most_decisive_chain && (
          <div className="rounded p-2 border-l-2 border-l-foreground/30 bg-surface mb-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold text-foreground">Decisive Chain</span>
              <DeltaBadge delta={data.most_decisive_chain.delta_chain} />
            </div>
            {data.most_decisive_chain.chain_statements.length > 0 && (
              <p className="text-[11px] text-muted leading-snug">
                {data.most_decisive_chain.chain_statements[0]}
              </p>
            )}
          </div>
        )}

        {data.most_influential_node &&
          data.most_influential_node.statement !== data.most_influential_direct_child?.statement && (
          <div className="rounded p-2 border-l-2 border-l-card-border bg-surface">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold text-foreground">Most Influential Node</span>
              <DeltaBadge delta={data.most_influential_node.delta} />
            </div>
            {data.most_influential_node.statement && (
              <p className="text-[11px] text-muted leading-snug">{data.most_influential_node.statement}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // Collapsed: portrait playing card
  return (
    <div
      onClick={() => setExpanded(true)}
      className="relative flex-shrink-0 rounded-lg border border-card-border bg-card-bg cursor-pointer hover:border-accent hover:shadow-[0_0_14px_rgba(220,38,38,0.2)] transition-all overflow-hidden w-44"
      style={{ aspectRatio: '5/7' }}
    >
      <div className="absolute inset-[5px] rounded border border-card-border/25 pointer-events-none" />

      <div className="absolute top-2 left-2.5 flex flex-col items-center leading-none gap-[2px]">
        <span className={`text-sm font-bold leading-none ${suitColor}`}>{suit}</span>
        <span className="text-[7px] text-muted uppercase tracking-wide leading-none">CF</span>
      </div>

      <div className="absolute bottom-2 right-2.5 flex flex-col items-center leading-none gap-[2px] rotate-180">
        <span className={`text-sm font-bold leading-none ${suitColor}`}>{suit}</span>
        <span className="text-[7px] text-muted uppercase tracking-wide leading-none">CF</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-7xl ${suitColor} opacity-[0.04] leading-none`}>{suit}</span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-[9px] font-medium text-foreground leading-snug line-clamp-4">{statement}</p>
      </div>

      <div className="absolute bottom-7 left-3 right-3 border-t border-card-border/30 pt-1 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted leading-none">baseline</span>
          <span className="text-[9px] font-mono text-foreground leading-none">{data.baseline_root.toFixed(3)}</span>
        </div>
        {data.most_influential_direct_child && (
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted leading-none">top impact</span>
            <span className={`text-[9px] font-mono leading-none ${data.most_influential_direct_child.delta >= 0 ? 'text-foreground' : 'text-accent'}`}>
              {data.most_influential_direct_child.delta >= 0 ? '+' : ''}{data.most_influential_direct_child.delta.toFixed(3)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  return (
    <span className={`text-[10px] font-mono font-semibold ${delta >= 0 ? 'text-foreground' : 'text-accent'}`}>
      {delta >= 0 ? '+' : ''}{delta.toFixed(4)}
    </span>
  )
}

export function ResultsSection({
  consensus,
  counterfactual,
  report,
  hierarchy,
  strengths,
  expertNames,
  expertAvatars,
}: ResultsSectionProps) {
  const mainArgs = hierarchy.filter(n => n.type === 'main_argument')
  let winnerNodeId: number | null = null
  let maxScore = -Infinity
  for (const arg of mainArgs) {
    if (arg.final_score !== null && arg.final_score > maxScore) {
      maxScore = arg.final_score
      winnerNodeId = arg.node_id
    }
  }

  const counterfactualEntries = counterfactual ? Object.entries(counterfactual) : []

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Argument Strengths — PersonaCard-style horizontal scroll with profile pics */}
      {mainArgs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-xs">♠</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Argument Strengths</span>
            <div className="flex-1 h-px bg-card-border opacity-60" />
            {report?.argument_count && (
              <span className="text-[10px] text-muted">{report.argument_count} total nodes</span>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {mainArgs.map((node, i) => (
              <StrengthCard
                key={node.node_id ?? i}
                node={node}
                isWinner={node.node_id === winnerNodeId}
                index={i}
                expertNames={expertNames}
                expertAvatars={expertAvatars}
              />
            ))}
          </div>
        </div>
      )}

      {/* Flat strengths fallback */}
      {mainArgs.length === 0 && strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-xs">♠</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Strengths</span>
            <div className="flex-1 h-px bg-card-border opacity-60" />
          </div>
          <div className="space-y-1.5 max-w-2xl">
            {strengths.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-card-border bg-card-bg">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground">{expertNames.get(s.expert || '') ?? s.expert}</span>
                  <p className="text-[11px] text-muted line-clamp-1">{s.statement}</p>
                </div>
                <span className="text-xs font-mono text-foreground ml-2">
                  {s.final_score !== null ? s.final_score.toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Counterfactual Analysis — PlayingCard-style horizontal scroll */}
      {counterfactualEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-xs">♣</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Crux Cards</span>
            <div className="flex-1 h-px bg-card-border opacity-60" />
            <span className="text-accent text-xs">♣</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {counterfactualEntries.map(([statement, data], i) => (
              <CounterfactualCard
                key={statement}
                statement={statement}
                data={data}
                index={i}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
