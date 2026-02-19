'use client'

import Link from 'next/link'
import HexAvatar from '@/components/HexAvatar'

const SUITS = ['♠', '♥', '♦', '♣'] as const

interface PersonaCardProps {
  id: string
  name: string
  handle: string
  picture: string
  locked?: boolean
  selected?: boolean
  disabled?: boolean
  selectable?: boolean
  compact?: boolean
  onToggle?: (id: string) => void
}

function getSuit(name: string) {
  const idx = name.charCodeAt(0) % 4
  return SUITS[idx]
}

export default function PersonaCard({
  id,
  name,
  handle,
  picture,
  locked,
  selected,
  disabled,
  selectable,
  compact,
  onToggle,
}: PersonaCardProps) {
  const suit = getSuit(name)
  const rank = locked ? '?' : name.charAt(0).toUpperCase()
  const isRed = suit === '♥' || suit === '♦'

  const borderClass = locked
    ? 'border-card-border opacity-50 cursor-not-allowed'
    : selected
      ? 'border-accent shadow-[0_0_12px_rgba(220,38,38,0.25)] cursor-pointer'
      : disabled
        ? 'border-card-border opacity-40 cursor-not-allowed'
        : 'border-card-border hover:border-muted cursor-pointer'

  const card = compact ? (
    <div className={`animate-card-in ${locked || disabled ? '' : 'group'}`}>
      <div
        className={`
          rounded-lg border p-2 transition-all duration-300
          bg-card-bg card-shadow relative overflow-hidden
          ${borderClass}
        `}
        onClick={() => {
          if (selectable && !locked && !disabled && onToggle) {
            onToggle(id)
          }
        }}
      >
        <div className={`flex items-center gap-2.5 relative ${locked ? 'opacity-60' : ''}`}>
          <span className={`text-xs ${isRed ? 'text-accent' : 'text-foreground/50'}`}>
            {suit}
          </span>
          <HexAvatar
            src={locked ? undefined : picture || undefined}
            alt={locked ? 'Locked' : name}
            size={32}
            fallbackInitial={locked ? '?' : name.charAt(0)}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-xs truncate">
              {locked ? 'Locked' : name}
            </p>
            {handle && !locked && (
              <p className="text-muted text-[10px] truncate">{handle}</p>
            )}
          </div>
          {selectable && !locked && (
            <div
              className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                selected
                  ? 'border-accent bg-accent'
                  : 'border-muted/50'
              }`}
            >
              {selected && (
                <svg viewBox="0 0 12 12" className="w-2 h-2 text-white">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className={`card-3d animate-card-in ${locked || disabled ? '' : 'group'}`}>
      <div
        className={`
          card-inner rounded-xl border p-3 transition-all duration-300
          bg-card-bg card-shadow relative overflow-hidden
          ${borderClass}
        `}
        style={{ aspectRatio: '5/7' }}
        onClick={() => {
          if (selectable && !locked && !disabled && onToggle) {
            onToggle(id)
          }
        }}
      >
        {/* Locked: card back pattern */}
        {locked && (
          <div className="absolute inset-0 card-back-pattern rounded-xl" />
        )}

        {/* Card face inner area */}
        <div className={`card-face rounded-lg h-full flex flex-col items-center justify-between p-2 relative ${locked ? 'opacity-60' : ''}`}>
          {/* Top-left corner: rank + suit */}
          <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
            <span className={`text-[11px] font-bold ${isRed ? 'text-accent' : 'text-foreground/50'}`}>
              {rank}
            </span>
            <span className={`text-[9px] ${isRed ? 'text-accent' : 'text-foreground/50'}`}>
              {suit}
            </span>
          </div>

          {/* Bottom-right corner: rank + suit (inverted) */}
          <div className="absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180">
            <span className={`text-[11px] font-bold ${isRed ? 'text-accent' : 'text-foreground/50'}`}>
              {rank}
            </span>
            <span className={`text-[9px] ${isRed ? 'text-accent' : 'text-foreground/50'}`}>
              {suit}
            </span>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3">
            <HexAvatar
              src={locked ? undefined : picture || undefined}
              alt={locked ? 'Locked' : name}
              size={44}
              fallbackInitial={locked ? '?' : name.charAt(0)}
            />
            <div className="text-center min-w-0 w-full px-1">
              <p className="font-semibold text-[11px] leading-tight line-clamp-2">
                {locked ? 'Locked' : name}
              </p>
              {handle && !locked && (
                <p className="text-muted text-[9px] truncate mt-0.5">{handle}</p>
              )}
              {locked && (
                <p className="text-muted text-[10px] mt-0.5">Unavailable</p>
              )}
            </div>
          </div>

          {/* Selection indicator */}
          {selectable && !locked && (
            <div className="absolute top-2 right-2.5">
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  selected
                    ? 'border-accent bg-accent'
                    : 'border-muted/50'
                }`}
              >
                {selected && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (selectable || locked) {
    return card
  }

  return (
    <Link href={`/cards/${encodeURIComponent(id)}`}>
      {card}
    </Link>
  )
}
