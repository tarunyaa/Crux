'use client'

import { useRef, useEffect } from 'react'
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

const ROUND_SUITS = ['♠', '♥', '♦', '♣'] as const

export function ArgumentTimeline({
  messages,
  experts,
  expertNames,
  expertAvatars,
  phase,
  consensus,
}: ArgumentTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isBuilding = !['idle', 'complete', 'error', 'baselines'].includes(phase)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const msgById = new Map(messages.map(m => [m.id, m]))
  const maxDepth = messages.reduce((acc, m) => Math.max(acc, m.depth), -1)

  // Group messages by depth level
  const byDepth = new Map<number, ArgumentMessage[]>()
  for (const msg of messages) {
    const arr = byDepth.get(msg.depth) ?? []
    arr.push(msg)
    byDepth.set(msg.depth, arr)
  }

  // Group depth-N messages by their parentId
  function groupByParent(msgs: ArgumentMessage[]): Map<string | undefined, ArgumentMessage[]> {
    const map = new Map<string | undefined, ArgumentMessage[]>()
    for (const msg of msgs) {
      const arr = map.get(msg.parentId) ?? []
      arr.push(msg)
      map.set(msg.parentId, arr)
    }
    return map
  }

  const winnerStatement = consensus?.winner
  const mainArgs = byDepth.get(0) ?? []
  const hasSubArgs = maxDepth > 0

  return (
    <div className="bg-card-bg border border-card-border rounded-xl flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 max-h-[75vh]">

        {/* Opening positions */}
        {mainArgs.length > 0 && (
          <>
            <PhaseDivider label="Opening Positions" suit="♠" />
            <div className="space-y-0.5">
              {mainArgs.map(msg => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  expertNames={expertNames}
                  expertAvatars={expertAvatars}
                  isWinner={winnerStatement ? msg.content === winnerStatement : false}
                />
              ))}
            </div>
          </>
        )}

        {/* Rounds 1, 2, 3... */}
        {Array.from({ length: Math.max(0, maxDepth) }, (_, i) => i + 1).map(depth => {
          const roundMsgs = byDepth.get(depth) ?? []
          if (roundMsgs.length === 0) return null
          const byParent = groupByParent(roundMsgs)
          const suit = ROUND_SUITS[(depth - 1) % 4]
          return (
            <div key={`round-${depth}`}>
              <PhaseDivider label={`Round ${depth}`} suit={suit} />
              <div className="space-y-2">
                {Array.from(byParent.entries()).map(([parentId, children]) => {
                  const parent = parentId ? msgById.get(parentId) : undefined
                  const parentDisplayName = parent ? (expertNames.get(parent.expertName) ?? parent.expertName) : null
                  return (
                    <div key={parentId ?? 'root'}>
                      {parent && parentDisplayName && (
                        <div className="flex items-center gap-1.5 px-3 py-0.5">
                          <span className="text-[10px] text-muted/60">↩</span>
                          <span className="text-[10px] text-accent/70 font-medium">{parentDisplayName}:</span>
                          <span className="text-[10px] text-muted italic truncate">
                            {parent.content.length > 60 ? parent.content.slice(0, 60) + '…' : parent.content}
                          </span>
                        </div>
                      )}
                      <div className="border-l-2 border-l-card-border/30 ml-3 space-y-0.5">
                        {children.map(child => (
                          <MessageRow
                            key={child.id}
                            message={child}
                            expertNames={expertNames}
                            expertAvatars={expertAvatars}
                            isWinner={winnerStatement ? child.content === winnerStatement : false}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Loading states */}
        {mainArgs.length === 0 && isBuilding && (
          <div className="py-8 text-center">
            <p className="text-xs text-muted animate-pulse">Experts are forming positions...</p>
          </div>
        )}
        {isBuilding && mainArgs.length > 0 && !hasSubArgs && (
          <div className="py-3 text-center">
            <p className="text-xs text-muted animate-pulse">Debate in progress...</p>
          </div>
        )}

        {/* Verdict + Complete */}
        {phase === 'complete' && consensus && (
          <>
            <PhaseDivider label="Verdict" suit="♥" />
            <div className="px-3 py-2 mx-2 rounded-lg border border-accent/20 bg-accent/5">
              {consensus.winner_score !== null && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-accent font-bold">
                    {consensus.winner_score.toFixed(4)}
                  </span>
                  {consensus.override_decision && consensus.override_decision !== consensus.original_decision && (
                    <span className="text-[9px] px-1.5 py-px rounded bg-accent/10 text-accent uppercase tracking-wider">
                      Override
                    </span>
                  )}
                </div>
              )}
              <div className="text-xs text-foreground leading-snug">
                {formatArgumentText(consensus.consensus_text || consensus.winner || '')}
              </div>
            </div>
          </>
        )}
        {phase === 'complete' && !consensus && (
          <PhaseDivider label="Complete" suit="♥" />
        )}
      </div>
    </div>
  )
}
