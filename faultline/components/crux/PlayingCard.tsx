'use client'

// ─── Crux Card (Playing Card Style) ──────────────────────────
// Collapsed: card-style panel — suit + type badge + question + persona positions.
// Expanded: full detail view with diagnosis, positions, resolution.
// PlayingCardExpanded: always-expanded, no toggle (for results section).

import { useState } from 'react'
import type { CruxCard as CruxCardType } from '@/lib/crux/types'

const SUITS = ['♠', '♥', '♦', '♣'] as const
const SUIT_COLORS = ['text-foreground', 'text-accent', 'text-accent', 'text-foreground'] as const

const DISAGREEMENT_LABEL: Record<string, string> = {
  horizon: 'Time Horizon',
  evidence: 'Evidence',
  values: 'Values',
  definition: 'Definition',
  claim: 'Claim',
  premise: 'Premise',
}

function getSuit(cardId: string): { symbol: string; color: string } {
  const idx = cardId.charCodeAt(cardId.length - 1) % 4
  return { symbol: SUITS[idx], color: SUIT_COLORS[idx] }
}

interface PlayingCardProps {
  card: CruxCardType
  personaNames: Map<string, string>
  index?: number
}

// ─── Expanded detail view (shared between PlayingCard and PlayingCardExpanded) ──
function ExpandedDetail({
  card,
  personaNames,
  suit,
  rank,
  onCollapse,
}: {
  card: CruxCardType
  personaNames: Map<string, string>
  suit: { symbol: string; color: string }
  rank: string
  onCollapse?: () => void
}) {
  const personas = Object.entries(card.personas)
  return (
    <div
      className={`rounded-lg border border-accent bg-card-bg p-3 shadow-[0_0_12px_rgba(220,38,38,0.15)] ${onCollapse ? 'cursor-pointer' : ''}`}
      onClick={onCollapse}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm ${suit.color}`}>{suit.symbol}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{rank}</span>
          {card.resolved && (
            <span className="text-xs text-accent font-semibold">✓</span>
          )}
        </div>
        {onCollapse && <span className="text-[10px] text-muted">collapse ↑</span>}
      </div>

      <h3 className="text-xs font-bold text-foreground mb-2 leading-snug">
        {card.question}
      </h3>

      <div className="bg-surface rounded p-2 mb-2 border border-card-border">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Root Cause</div>
        <p className="text-xs text-foreground">{card.diagnosis}</p>
      </div>

      <div className="space-y-1.5">
        {personas.map(([personaId, data]) => {
          const name = personaNames.get(personaId) ?? personaId
          const positionColor =
            data.position === 'YES' ? 'text-foreground border-foreground' :
            data.position === 'NO' ? 'text-accent border-accent' :
            'text-muted border-muted'

          return (
            <div key={personaId} className={`rounded p-2 border-l-2 bg-surface ${positionColor}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold text-foreground">{name}</span>
                <span className={`text-[10px] font-bold ${positionColor.split(' ')[0]}`}>
                  {data.position}
                </span>
              </div>
              <p className="text-[11px] text-muted leading-snug">{data.reasoning}</p>
              {data.falsifier && (
                <p className="text-[10px] text-muted italic mt-1 border-t border-card-border pt-1">
                  Changes mind if: {data.falsifier}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {card.resolution && (
        <div className="mt-2 p-2 rounded bg-surface border border-card-border">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Resolution</div>
          <p className="text-[11px] text-foreground">{card.resolution}</p>
        </div>
      )}
    </div>
  )
}

// ─── PlayingCardExpanded: always-shown expanded state (no toggle) ──────────
export function PlayingCardExpanded({ card, personaNames }: PlayingCardProps) {
  const suit = getSuit(card.id)
  const rank = DISAGREEMENT_LABEL[card.disagreementType] ?? card.disagreementType
  return (
    <ExpandedDetail
      card={card}
      personaNames={personaNames}
      suit={suit}
      rank={rank}
    />
  )
}

// ─── PlayingCard: toggleable collapsed/expanded ───────────────
export function PlayingCard({ card, personaNames, index = 0 }: PlayingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const suit = getSuit(card.id)
  const personas = Object.entries(card.personas)
  const rank = DISAGREEMENT_LABEL[card.disagreementType] ?? card.disagreementType

  if (expanded) {
    return (
      <ExpandedDetail
        card={card}
        personaNames={personaNames}
        suit={suit}
        rank={rank}
        onCollapse={() => setExpanded(false)}
      />
    )
  }

  // ─── Collapsed: portrait playing card ───────────────────────
  return (
    <div
      onClick={() => setExpanded(true)}
      className="relative flex-shrink-0 rounded-lg border border-card-border bg-card-bg cursor-pointer hover:border-accent hover:shadow-[0_0_14px_rgba(220,38,38,0.2)] transition-all overflow-hidden select-none w-40"
      style={{ aspectRatio: '5/7' }}
    >
      {/* Inner inset border — classic playing card double-border */}
      <div className="absolute inset-[5px] rounded border border-card-border/25 pointer-events-none" />

      {/* Top-left corner */}
      <div className="absolute top-2 left-2.5 flex flex-col items-center leading-none gap-[2px]">
        <span className={`text-sm font-bold leading-none ${suit.color}`}>{suit.symbol}</span>
        <span className="text-[8px] text-muted uppercase tracking-wide leading-none">{rank.slice(0, 4)}</span>
      </div>

      {/* Watermark suit symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-7xl ${suit.color} opacity-[0.04] leading-none`}>{suit.symbol}</span>
      </div>

      {/* Question — centered in the card body */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-[11px] font-medium text-foreground leading-snug line-clamp-4">{card.question}</p>
      </div>

      {/* Persona positions — pinned just above the bottom corner */}
      <div className="absolute bottom-7 left-3 right-3 border-t border-card-border/30 pt-1 space-y-0.5">
        {personas.map(([personaId, data]) => {
          const name = personaNames.get(personaId) ?? personaId
          const posColor =
            data.position === 'YES' ? 'text-foreground' :
            data.position === 'NO' ? 'text-accent' :
            'text-muted'
          return (
            <div key={personaId} className="flex items-center justify-between">
              <span className="text-[9px] text-muted leading-none">{name.split(' ')[0]}</span>
              <span className={`text-[9px] font-bold leading-none ${posColor}`}>{data.position}</span>
            </div>
          )
        })}
      </div>

      {card.resolved && (
        <div className="absolute top-2 right-2.5">
          <span className="text-[9px] text-accent font-bold">✓</span>
        </div>
      )}
    </div>
  )
}
