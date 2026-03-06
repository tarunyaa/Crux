'use client'

import type { ArgumentCruxCard as ArgumentCruxCardType } from '@/lib/argument/types'

interface ArgumentCruxCardProps {
  card: ArgumentCruxCardType
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
}

export function ArgumentCruxCard({ card }: ArgumentCruxCardProps) {
  return (
    <div className="rounded-xl border border-card-border bg-surface p-4 space-y-3">
      {/* Header row: crux type badge + outcome-critical badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="bg-surface border border-card-border text-[10px] uppercase text-muted px-2 py-0.5 rounded">
          {card.crux_type}
        </span>
        {card.winner_critical && (
          <span className="bg-accent text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
            Outcome-Critical
          </span>
        )}
      </div>

      {/* The argument text */}
      <p className="text-sm text-foreground leading-snug">
        {stripMd(card.question)}
      </p>

      {/* Structural impact */}
      <p className="text-[11px] text-muted">
        Removing this shifts outcome by{' '}
        <span className="font-mono text-foreground">&plusmn;{card.importance.toFixed(3)}</span>
        {' '}<span className="text-[10px] text-muted/50">(&sigma; = argument strength after graph propagation)</span>
      </p>

      {/* Flip mechanism */}
      <blockquote className="border-l-2 border-card-border pl-3 text-[11px] text-muted italic leading-snug">
        {stripMd(card.flip_mechanism)}
      </blockquote>

      {/* Expert attribution */}
      {card.expert && (
        <p className="text-[10px] text-muted uppercase tracking-wide">
          via {card.expert}
        </p>
      )}
    </div>
  )
}
