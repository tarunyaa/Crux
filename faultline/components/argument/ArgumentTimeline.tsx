'use client'

import { useRef, useEffect, type JSX } from 'react'
import type { ArgumentMessage, ConsensusData } from '@/lib/argument/types'
import { formatArgumentText } from '@/lib/utils/format-argument-text'

interface ArgumentTimelineProps {
  messages: ArgumentMessage[]
  experts: string[]
  expertNames: Map<string, string>
  expertAvatars: Map<string, string>
  phase: string
  consensus: ConsensusData | null
}

function HexAvatarSmall({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <div className="relative w-6 h-6 flex-shrink-0">
      <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
      <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg flex items-center justify-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] font-bold text-accent">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
    </div>
  )
}

function TypeIndicator({ type }: { type: ArgumentMessage['type'] }) {
  if (type === 'attack') {
    return <span className="text-[9px] font-semibold tracking-wider text-accent uppercase">attack</span>
  }
  if (type === 'support') {
    return <span className="text-[9px] font-semibold tracking-wider text-muted/60 uppercase">support</span>
  }
  return null
}

interface MessageRowProps {
  message: ArgumentMessage
  expertNames: Map<string, string>
  expertAvatars: Map<string, string>
  isWinner?: boolean
}

function MessageRow({ message, expertNames, expertAvatars, isWinner }: MessageRowProps) {
  const displayName = expertNames.get(message.expertName) ?? message.expertName
  const avatarUrl = expertAvatars.get(message.expertName)
  const isAttack = message.type === 'attack'

  return (
    <div
      className={`group flex gap-2 px-3 py-1.5 rounded-md transition-colors ${
        isAttack
          ? 'border-l-2 border-l-accent bg-accent/5'
          : message.type === 'support'
            ? 'border-l-2 border-l-card-border/40 hover:bg-surface'
            : 'hover:bg-surface'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <HexAvatarSmall name={displayName} avatarUrl={avatarUrl} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-accent leading-none">{displayName}</span>
          <TypeIndicator type={message.type} />
          {isWinner && (
            <span className="text-[9px] font-bold tracking-wider text-accent border border-accent/40 px-1 py-px rounded">
              WINNER
            </span>
          )}
          {message.scores && message.scores.final !== null && (
            <span className="text-[10px] font-mono text-muted ml-auto">
              {message.scores.final.toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-xs text-foreground leading-snug mt-0.5">
          {formatArgumentText(message.content)}
        </div>
      </div>
    </div>
  )
}

function PhaseDivider({ label, suit }: { label: string; suit?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      {suit && <span className="text-accent text-[10px]">{suit}</span>}
      <div className="flex-1 h-px bg-card-border opacity-60" />
      <span className="text-[10px] text-muted uppercase tracking-widest flex-shrink-0">{label}</span>
      <div className="flex-1 h-px bg-card-border opacity-60" />
      {suit && <span className="text-accent text-[10px]">{suit}</span>}
    </div>
  )
}

// Suits for reply depths: ♥ (red), ♦ (red), ♣ (black)
const DEPTH_SUITS = ['♥', '♦', '♣'] as const

export function ArgumentTimeline({
  messages,
  expertNames,
  expertAvatars,
  phase,
  consensus,
}: ArgumentTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isBuilding = !['idle', 'complete', 'error', 'baselines', 'crux_extraction'].includes(phase)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const winnerStatement = consensus?.winner

  // Build parent→children map for recursive threading
  const childrenOf = new Map<string | undefined, ArgumentMessage[]>()
  for (const msg of messages) {
    const arr = childrenOf.get(msg.parentId) ?? []
    arr.push(msg)
    childrenOf.set(msg.parentId, arr)
  }
  const rootMessages = childrenOf.get(undefined) ?? []

  function renderThread(nodes: ArgumentMessage[], depth: number): JSX.Element[] {
    const result: JSX.Element[] = []
    for (const msg of nodes) {
      const children = childrenOf.get(msg.id) ?? []
      const suit = depth > 0 ? DEPTH_SUITS[Math.min(depth - 1, DEPTH_SUITS.length - 1)] : null
      const isRed = suit === '♥' || suit === '♦'
      result.push(
        <div key={msg.id} style={{ marginLeft: `${depth * 20}px` }}>
          {suit && (
            <div className="flex items-center gap-1.5 px-1 mt-2 mb-0.5">
              <span className={`text-[9px] ${isRed ? 'text-accent' : 'text-foreground/30'}`}>{suit}</span>
              <div className="h-px flex-1 bg-card-border opacity-25" />
            </div>
          )}
          <MessageRow
            message={msg}
            expertNames={expertNames}
            expertAvatars={expertAvatars}
            isWinner={winnerStatement ? msg.content === winnerStatement : false}
          />
        </div>
      )
      if (children.length > 0) {
        result.push(...renderThread(children, depth + 1))
      }
    }
    return result
  }

  return (
    <div className="bg-card-bg border border-card-border rounded-xl flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-3 max-h-[75vh]">

        {rootMessages.length > 0 && (
          <>
            <PhaseDivider label="Opening Positions" suit="♠" />
            {renderThread(rootMessages, 0)}
          </>
        )}

        {/* Loading states */}
        {rootMessages.length === 0 && isBuilding && (
          <div className="py-8 text-center">
            <p className="text-xs text-muted animate-pulse">Experts are forming positions...</p>
          </div>
        )}
        {isBuilding && rootMessages.length > 0 && childrenOf.size <= 1 && (
          <div className="py-3 text-center">
            <p className="text-xs text-muted animate-pulse">Debate in progress...</p>
          </div>
        )}

        {phase === 'complete' && (
          <PhaseDivider label="Complete" suit="♥" />
        )}
      </div>
    </div>
  )
}
