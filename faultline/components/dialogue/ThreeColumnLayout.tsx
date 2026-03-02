'use client'

// ─── Dialogue Layout ──────────────────────────────────────────
// Matches the old MatchClient layout: 2-col grid (2/3 chat + 1/3 sidebar),
// crux cards full-width strip below the grid.
// Scrollable page — no h-screen or viewport locking.

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageThread } from './MessageThread'
import { PlayingCard } from '@/components/crux/PlayingCard'
import { CruxRoom } from '@/components/crux/CruxRoom'
import HexAvatar from '@/components/HexAvatar'
import type { DialogueMessage, DebateAspect, PositionShift, DebateSummary } from '@/lib/dialogue/types'
import type { CruxCard as CruxCardType } from '@/lib/crux/types'
import type { ActiveCruxRoom, CruxTriggerInfo } from '@/lib/hooks/useDialogueStream'
import { exportDebatePDF } from '@/lib/utils/export-pdf'

// ─── DialoguePolygon ──────────────────────────────────────────
// Hex-avatar polygon with axis spokes, pairwise edges by crux status.

interface DialoguePolygonProps {
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  activeCruxRooms: Map<string, ActiveCruxRoom>
  completedRooms: Map<string, ActiveCruxRoom>
  lastSpeakerId?: string
}

interface Point {
  x: number
  y: number
}

function getVertexPositions(count: number, cx: number, cy: number, radius: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }
  return points
}

function DialoguePolygon({
  personaIds,
  personaNames,
  personaAvatars,
  activeCruxRooms,
  completedRooms,
  lastSpeakerId,
}: DialoguePolygonProps) {
  if (personaIds.length < 2) return null

  const size = 280
  const cx = size / 2
  const cy = size / 2
  const outerRadius = size / 2 - 48
  const avatarSize = 34
  const vertices = getVertexPositions(personaIds.length, cx, cy, outerRadius)

  function pairKey(a: string, b: string): string {
    return [a, b].sort().join('::')
  }

  const activePairs = new Set<string>()
  const completedPairs = new Set<string>()
  for (const room of activeCruxRooms.values()) {
    if (room.personas.length >= 2) activePairs.add(pairKey(room.personas[0], room.personas[1]))
  }
  for (const room of completedRooms.values()) {
    if (room.personas.length >= 2) completedPairs.add(pairKey(room.personas[0], room.personas[1]))
  }

  const edges: { i: number; j: number; key: string }[] = []
  for (let i = 0; i < personaIds.length; i++) {
    for (let j = i + 1; j < personaIds.length; j++) {
      edges.push({ i, j, key: pairKey(personaIds[i], personaIds[j]) })
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
          <span className="text-[10px]">♠</span>
          Alignment
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-px bg-accent" style={{ boxShadow: '0 0 4px var(--accent)' }} />
            <span className="text-[9px] text-muted">Clashing</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="12" height="2" viewBox="0 0 12 2"><line x1="0" y1="1" x2="12" y2="1" stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6"/></svg>
            <span className="text-[9px] text-muted">Resolved</span>
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size }}
        className="overflow-visible mx-auto block"
      >
        {/* Axis spokes from center to each vertex */}
        {vertices.map((v, i) => (
          <line
            key={`axis-${i}`}
            x1={cx} y1={cy} x2={v.x} y2={v.y}
            stroke="var(--card-border)" strokeWidth={1} opacity={0.25}
          />
        ))}

        {/* Pairwise edges */}
        {edges.map(({ i, j, key }) => {
          const isActive = activePairs.has(key)
          const isCompleted = completedPairs.has(key)

          if (isActive) {
            return (
              <g key={`edge-${i}-${j}`}>
                <line
                  x1={vertices[i].x} y1={vertices[i].y}
                  x2={vertices[j].x} y2={vertices[j].y}
                  stroke="var(--accent)" strokeWidth={5} opacity={0.18} strokeLinecap="round"
                />
                <line
                  x1={vertices[i].x} y1={vertices[i].y}
                  x2={vertices[j].x} y2={vertices[j].y}
                  stroke="var(--accent)" strokeWidth={1.5} opacity={0.85} strokeLinecap="round"
                />
              </g>
            )
          }
          if (isCompleted) {
            return (
              <line
                key={`edge-${i}-${j}`}
                x1={vertices[i].x} y1={vertices[i].y}
                x2={vertices[j].x} y2={vertices[j].y}
                stroke="var(--muted)" strokeWidth={1} opacity={0.35}
                strokeDasharray="3 3" strokeLinecap="round"
              />
            )
          }
          return (
            <line
              key={`edge-${i}-${j}`}
              x1={vertices[i].x} y1={vertices[i].y}
              x2={vertices[j].x} y2={vertices[j].y}
              stroke="var(--card-border)" strokeWidth={1} opacity={0.12} strokeLinecap="round"
            />
          )
        })}

        {/* Vertex nodes — hex avatars via foreignObject */}
        {personaIds.map((id, i) => {
          const v = vertices[i]
          const name = personaNames.get(id) ?? id
          const avatar = personaAvatars.get(id)
          const isLastSpeaker = lastSpeakerId === id
          const firstName = name.split(' ')[0]
          const label = firstName.length > 10 ? firstName.slice(0, 9) + '…' : firstName

          return (
            <g key={id}>
              {/* Speaker glow behind hex */}
              {isLastSpeaker && (
                <rect
                  x={v.x - avatarSize / 2 - 5} y={v.y - avatarSize / 2 - 5}
                  width={avatarSize + 10} height={avatarSize + 10}
                  rx={4} fill="var(--accent)" opacity={0.12}
                />
              )}

              {/* Hex avatar */}
              <foreignObject
                x={v.x - avatarSize / 2}
                y={v.y - avatarSize / 2}
                width={avatarSize}
                height={avatarSize}
              >
                <HexAvatar
                  src={avatar || undefined}
                  alt={name}
                  size={avatarSize}
                  fallbackInitial={name.charAt(0)}
                />
              </foreignObject>

              {/* Name label */}
              <text
                x={v.x} y={v.y + avatarSize / 2 + 13}
                textAnchor="middle"
                fill={isLastSpeaker ? 'var(--foreground)' : 'var(--muted)'}
                fontSize={isLastSpeaker ? 9 : 8}
                fontWeight={isLastSpeaker ? '600' : 'normal'}
                fontFamily="var(--font-sans)"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Phase Divider ──────────────────────────────────────────
// Suit symbols chosen deterministically from the label text.

const PHASE_SUITS = ['♠', '♥', '♦', '♣'] as const

function PhaseDivider({ label, sublabel }: { label: string; sublabel?: string }) {
  const suitIdx = label.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 4
  const suit = PHASE_SUITS[suitIdx]
  const isRed = suit === '♥' || suit === '♦'
  return (
    <div className="py-2">
      <div className="flex items-center gap-2.5">
        <div className="flex-1 h-px bg-card-border opacity-60" />
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] leading-none ${isRed ? 'text-accent' : 'text-foreground/30'}`}>{suit}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{label}</span>
          <span className={`text-[9px] leading-none ${isRed ? 'text-accent' : 'text-foreground/30'}`}>{suit}</span>
        </div>
        <div className="flex-1 h-px bg-card-border opacity-60" />
      </div>
      {sublabel && (
        <p className="text-center text-[9px] text-muted mt-1">{sublabel}</p>
      )}
    </div>
  )
}

// ─── DialogueLayout ───────────────────────────────────────────

interface DialogueLayoutProps {
  topic: string
  personaIds: string[]
  messages: DialogueMessage[]
  cruxCards: CruxCardType[]
  activeCruxRooms: Map<string, ActiveCruxRoom>
  completedRooms: Map<string, ActiveCruxRoom>
  cruxTriggerMap: Map<string, CruxTriggerInfo>
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  isRunning: boolean
  isComplete: boolean
  // Panel debate props
  aspects?: DebateAspect[]
  currentRound?: number | null
  currentPhase?: 'opening' | 'take' | 'clash' | 'closing' | null
  shifts?: PositionShift[]
  summary?: DebateSummary | null
}

export function ThreeColumnLayout({
  topic,
  personaIds,
  messages,
  cruxCards,
  activeCruxRooms,
  completedRooms,
  personaNames,
  personaAvatars,
  cruxTriggerMap,
  isRunning,
  isComplete,
  aspects = [],
  currentRound,
  currentPhase,
  shifts = [],
  summary,
}: DialogueLayoutProps) {
  // Track which crux room cards are expanded
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  // Track whether the user has scrolled away from the bottom
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const onScroll = () => {
      isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll feed to bottom only if user is already near the bottom
  useEffect(() => {
    if (feedRef.current && isNearBottom.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [messages.length])

  // Auto-expand newly spawned active rooms
  const prevActiveSize = useRef(0)
  useEffect(() => {
    if (activeCruxRooms.size > prevActiveSize.current) {
      for (const [id] of activeCruxRooms) {
        setExpandedRooms(prev => new Set([...prev, id]))
      }
    }
    prevActiveSize.current = activeCruxRooms.size
  }, [activeCruxRooms])

  function toggleRoom(roomId: string) {
    setExpandedRooms(prev => {
      const next = new Set(prev)
      if (next.has(roomId)) {
        next.delete(roomId)
      } else {
        next.add(roomId)
      }
      return next
    })
  }

  const [exporting, setExporting] = useState(false)
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportDebatePDF({
        topic,
        personaIds,
        messages,
        personaNames,
        personaAvatars,
        aspects,
        cruxCards,
        completedRooms,
        shifts,
        summary: summary ?? null,
      })
    } finally {
      setExporting(false)
    }
  }, [topic, personaIds, messages, personaNames, personaAvatars, aspects, cruxCards, completedRooms, shifts, summary])

  const allRooms = new Map([...completedRooms, ...activeCruxRooms])
  const personaNamesList = Array.from(personaNames.values())
  const lastSpeakerId = messages.length > 0 ? messages[messages.length - 1].personaId : undefined

  // Build message feed with phase dividers, threading replies under parent messages
  type FeedElement =
    | { type: 'divider'; label: string; sublabel?: string; key: string }
    | { type: 'message'; message: DialogueMessage; depth: number; key: string }

  const feedElements: FeedElement[] = []

  // Group messages by round for threading
  const openingMessages: DialogueMessage[] = []
  const closingMessages: DialogueMessage[] = []
  const roundGroups = new Map<number, DialogueMessage[]>()
  let hasRoundMessages = false

  for (const msg of messages) {
    if (msg.round != null) {
      hasRoundMessages = true
      const group = roundGroups.get(msg.round) || []
      group.push(msg)
      roundGroups.set(msg.round, group)
    } else if (!hasRoundMessages) {
      openingMessages.push(msg)
    } else {
      closingMessages.push(msg)
    }
  }

  // Opening statements
  if (openingMessages.length > 0) {
    feedElements.push({ type: 'divider', label: 'Opening Statements', key: 'div-opening' })
    for (const msg of openingMessages) {
      feedElements.push({ type: 'message', message: msg, depth: 0, key: msg.id })
    }
  }

  // Round messages — thread replies under their parent
  for (const [roundNum, roundMsgs] of roundGroups) {
    const aspect = aspects[roundNum - 1]
    feedElements.push({
      type: 'divider',
      label: `Round ${roundNum}: ${aspect?.label ?? ''}`,
      sublabel: aspect?.description,
      key: `div-round-${roundNum}`,
    })

    // Separate miniround 0 (initial takes) from replies
    const initialTakes = roundMsgs.filter(m => (m.miniround ?? 0) === 0)
    const replies = roundMsgs.filter(m => (m.miniround ?? 0) > 0)

    // Build a map: parentId → replies (sorted by miniround)
    const replyMap = new Map<string, DialogueMessage[]>()
    const unthreaded: DialogueMessage[] = []
    for (const reply of replies) {
      if (reply.replyTo) {
        const existing = replyMap.get(reply.replyTo) || []
        existing.push(reply)
        replyMap.set(reply.replyTo, existing)
      } else {
        unthreaded.push(reply)
      }
    }

    // Emit initial takes, each followed by the full reply chain (recursive)
    function emitThread(parentId: string, depth: number) {
      const children = replyMap.get(parentId)
      if (!children) return
      for (const reply of children) {
        feedElements.push({ type: 'message', message: reply, depth, key: reply.id })
        emitThread(reply.id, depth + 1)
      }
    }

    for (const take of initialTakes) {
      feedElements.push({ type: 'message', message: take, depth: 0, key: take.id })
      emitThread(take.id, 1)
    }

    // Any replies that couldn't be matched to a parent (fallback)
    if (unthreaded.length > 0) {
      for (const reply of unthreaded) {
        feedElements.push({ type: 'message', message: reply, depth: 1, key: reply.id })
      }
    }
  }

  // Closing statements
  if (closingMessages.length > 0) {
    feedElements.push({ type: 'divider', label: 'Closing Statements', key: 'div-closing' })
    for (const msg of closingMessages) {
      feedElements.push({ type: 'message', message: msg, depth: 0, key: msg.id })
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{topic}</h1>
        <div className="flex items-center gap-3 mt-1">
          {/* Status dot */}
          {isRunning && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm text-muted">
                {currentPhase && currentRound
                  ? `Round ${currentRound} — ${currentPhase}`
                  : currentPhase === 'opening'
                  ? 'Opening'
                  : currentPhase === 'closing'
                  ? 'Closing'
                  : 'Live'}
              </span>
            </div>
          )}
          {isComplete && (
            <>
              <span className="text-sm text-muted">Complete</span>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-xs border border-card-border text-muted hover:text-foreground hover:border-foreground/30 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export PDF'}
              </button>
            </>
          )}
          {/* Persona name chips */}
          {personaNamesList.map(name => (
            <span
              key={name}
              className="text-xs text-muted border border-card-border px-2 py-0.5 rounded"
            >
              {name}
            </span>
          ))}
        </div>
        {/* Round topics */}
        {aspects.length > 0 && (
          <div className="mt-3 rounded-xl border border-card-border bg-surface p-4 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Round Topics</p>
            {aspects.map((aspect, i) => {
              const roundNum = i + 1
              const isActive = currentRound === roundNum
              const isDone = isComplete || (currentRound != null && roundNum < currentRound)
              const suit = PHASE_SUITS[i % 4]
              const isRedSuit = suit === '♥' || suit === '♦'
              return (
                <div key={aspect.id} className={`flex items-baseline gap-2 rounded px-2 py-1 transition-colors ${
                  isActive ? 'bg-accent/10' : ''
                }`}>
                  <span className={`text-[10px] flex-shrink-0 ${
                    isActive ? 'text-accent' : isDone ? (isRedSuit ? 'text-accent/50' : 'text-foreground/30') : 'text-muted opacity-30'
                  }`}>{suit}</span>
                  <span className={`text-xs ${
                    isActive ? 'text-foreground font-medium' : isDone ? 'text-foreground/70' : 'text-muted opacity-40'
                  }`}>
                    {aspect.label}
                  </span>
                  {aspect.description && (
                    <span className={`text-[10px] ${
                      isActive ? 'text-muted' : isDone ? 'text-muted/60' : 'text-muted opacity-30'
                    }`}>
                      {aspect.description}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Main grid: 2/3 chat + 1/3 sidebar — fixed height so crux cards start at consistent Y ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:h-[68vh]">

        {/* Chat feed — 2/3 width, fills grid height */}
        <div className="lg:col-span-2 lg:h-full lg:overflow-hidden">
          <div
            ref={feedRef}
            className="rounded-xl border border-card-border bg-card-bg p-4 space-y-1 overflow-y-auto lg:h-full"
            style={{ minHeight: '400px', maxHeight: '68vh' }}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-muted text-sm">Decomposing topic...</p>
              </div>
            ) : (
              <>
                {feedElements.map(el => {
                  if (el.type === 'divider') {
                    return <PhaseDivider key={el.key} label={el.label} sublabel={el.sublabel} />
                  }
                  return (
                    <div key={el.key} className={el.depth > 0 ? 'border-l border-card-border/40 pl-2' : ''} style={el.depth > 0 ? { marginLeft: `${el.depth * 1.5}rem` } : undefined}>
                      <MessageThread
                        messages={[el.message]}
                        allMessages={messages}
                        personaNames={personaNames}
                        personaAvatars={personaAvatars}
                        cruxTriggerMap={cruxTriggerMap}
                      />
                    </div>
                  )
                })}
              </>
            )}
            {isRunning && messages.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-xs text-muted">Thinking...</span>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1/3 width, scrollable, same height as chat */}
        <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:pr-0.5">
          {/* DialoguePolygon: always first in sidebar */}
          <DialoguePolygon
            personaIds={personaIds}
            personaNames={personaNames}
            personaAvatars={personaAvatars}
            activeCruxRooms={activeCruxRooms}
            completedRooms={completedRooms}
            lastSpeakerId={lastSpeakerId}
          />

          {allRooms.size === 0 && (
            <div className="rounded-xl border border-card-border bg-surface p-4 text-center">
              <div className="flex justify-center gap-2 mb-2 opacity-20">
                <span className="text-foreground text-sm">♠</span>
                <span className="text-accent text-sm">♥</span>
                <span className="text-accent text-sm">♦</span>
                <span className="text-foreground text-sm">♣</span>
              </div>
              <p className="text-xs text-muted">Crux rooms will appear here when disagreements emerge.</p>
            </div>
          )}
          {Array.from(allRooms.values()).map(room => {
            const isActive = room.status === 'arguing'
            const isExpanded = expandedRooms.has(room.roomId)
            const p0 = personaNames.get(room.personas[0]) ?? room.personas[0]
            const p1 = personaNames.get(room.personas[1]) ?? room.personas[1]
            const avatar0 = personaAvatars.get(room.personas[0])
            const avatar1 = personaAvatars.get(room.personas[1])

            return (
              <div
                key={room.roomId}
                className="rounded-xl border border-card-border bg-surface p-4"
              >
                {/* Header: two rows — avatars+names+status, then question */}
                <div className="cursor-pointer" onClick={() => toggleRoom(room.roomId)}>
                  {/* Row 1: avatars + first names + status dot */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="relative w-9 h-6 flex-shrink-0">
                      {/* Avatar 0 — hex */}
                      <div className="absolute left-0 w-6 h-6">
                        <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
                        <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg flex items-center justify-center">
                          {avatar0
                            ? <img src={avatar0} alt={p0} className="w-full h-full object-cover" />
                            : <span className="text-[9px] font-bold text-accent">{p0.charAt(0)}</span>
                          }
                        </div>
                      </div>
                      {/* Avatar 1 — hex, offset right */}
                      <div className="absolute left-3 w-6 h-6">
                        <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
                        <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg flex items-center justify-center">
                          {avatar1
                            ? <img src={avatar1} alt={p1} className="w-full h-full object-cover" />
                            : <span className="text-[9px] font-bold text-accent">{p1.charAt(0)}</span>
                          }
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground flex-1 min-w-0 truncate">
                      {p0.split(' ')[0]} <span className="text-muted font-normal">vs</span> {p1.split(' ')[0]}
                    </span>
                    {isActive ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                    ) : (
                      <span className="text-[10px] text-accent flex-shrink-0">done</span>
                    )}
                  </div>
                  {/* Row 2: short label or question fallback */}
                  <p className="text-[11px] text-muted leading-snug line-clamp-2">{room.label || room.question}</p>
                </div>

                {/* Expandable: CruxRoom messages */}
                {isExpanded && (
                  <div className="mt-3 border-t border-card-border pt-3">
                    <CruxRoom
                      roomId={room.roomId}
                      question={room.question}
                      messages={room.messages}
                      personaNames={personaNames}
                      personaAvatars={personaAvatars}
                      status={room.status}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Crux cards — always visible once they appear ── */}
      {cruxCards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-xs">♦</span>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Crux Cards</h2>
            <div className="flex-1 h-px bg-card-border opacity-60" />
            <span className="text-accent text-xs">♦</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {cruxCards.map((card, i) => (
              <PlayingCard key={card.id} card={card} personaNames={personaNames} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Debate Results — shown when complete ── */}
      {isComplete && (() => {
        const resolvedCount = cruxCards.filter(c => c.resolved).length

        return (
          <div className="space-y-5 rounded-xl border border-card-border bg-surface p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="text-accent text-xs">♠</span>
                Debate Results
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{messages.length} messages</span>
                <span>·</span>
                <span>{aspects.length} rounds</span>
                <span>·</span>
                <span>{completedRooms.size} crux room{completedRooms.size !== 1 ? 's' : ''}</span>
                {cruxCards.length > 0 && (
                  <>
                    <span>·</span>
                    <span>{resolvedCount}/{cruxCards.length} resolved</span>
                  </>
                )}
              </div>
            </div>

            {/* ── Claims Under Debate ── */}
            {summary?.claims && summary.claims.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-foreground/30 text-[9px]">♣</span>
                  Claims Under Debate
                </p>
                <div className="space-y-3">
                  {summary.claims.map((claim, ci) => (
                    <div key={ci} className="rounded-lg border border-card-border bg-card-bg p-3">
                      <p className="text-xs font-semibold text-foreground mb-2">{claim.claim}</p>
                      <div className="space-y-1.5">
                        {claim.stances.map((stance, si) => {
                          const name = (personaNames.get(stance.personaId) ?? stance.personaId).split(' ')[0]
                          const posColor =
                            stance.position === 'for' ? 'text-foreground' :
                            stance.position === 'against' ? 'text-accent' :
                            'text-muted'
                          return (
                            <div key={si} className="flex items-start gap-2">
                              <span className={`text-[11px] font-semibold flex-shrink-0 w-16 ${posColor}`}>{name}</span>
                              <span className={`text-[10px] font-bold flex-shrink-0 w-12 uppercase ${posColor}`}>{stance.position}</span>
                              <span className="text-[11px] text-muted">{stance.reasoning}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Agreements ── */}
            {summary?.agreements && summary.agreements.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-accent text-[9px]">♥</span>
                  Points of Agreement
                </p>
                <div className="space-y-1">
                  {summary.agreements.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-foreground opacity-40 flex-shrink-0">—</span>
                      <span className="text-foreground">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Evidence Ledger ── */}
            {summary?.evidenceLedger && summary.evidenceLedger.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-accent text-[9px]">♦</span>
                  Evidence Ledger
                </p>
                <div className="space-y-3">
                  {summary.evidenceLedger.map((el, i) => {
                    const name = (personaNames.get(el.personaId) ?? el.personaId).split(' ')[0]
                    return (
                      <div key={i} className="rounded-lg border border-card-border bg-card-bg p-3">
                        <p className="text-[11px] font-semibold text-accent mb-2">{name}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Accepted column */}
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground mb-1">Accepted</p>
                            {el.accepted.length > 0 ? (
                              <div className="space-y-1.5">
                                {el.accepted.map((a, j) => (
                                  <div key={j} className="pl-2 border-l border-card-border">
                                    <p className="text-[11px] text-foreground">{a.claim}</p>
                                    <p className="text-[10px] text-muted">{a.reason}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted italic">None noted</p>
                            )}
                          </div>
                          {/* Challenged column */}
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-accent mb-1">Challenged</p>
                            {el.challenged.length > 0 ? (
                              <div className="space-y-1.5">
                                {el.challenged.map((c, j) => (
                                  <div key={j} className="pl-2 border-l border-accent/30">
                                    <p className="text-[11px] text-foreground">{c.claim}</p>
                                    <p className="text-[10px] text-muted">{c.reason}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted italic">None noted</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Flip Conditions ── */}
            {summary?.flipConditions && summary.flipConditions.some(fc => fc.conditions.length > 0) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-foreground/30 text-[9px]">♠</span>
                  What Would Change Their Mind
                </p>
                <div className="space-y-2">
                  {summary.flipConditions.filter(fc => fc.conditions.length > 0).map((fc, i) => {
                    const name = (personaNames.get(fc.personaId) ?? fc.personaId).split(' ')[0]
                    return (
                      <div key={i}>
                        <p className="text-[11px] font-semibold text-accent mb-1">{name}</p>
                        <div className="space-y-0.5 pl-3 border-l border-card-border">
                          {fc.conditions.map((c, j) => (
                            <p key={j} className="text-[11px] text-muted">{c}</p>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Position Shifts ── */}
            {shifts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-accent text-[9px]">♦</span>
                  Position Shifts
                </p>
                <div className="space-y-1.5">
                  {shifts.map(shift => {
                    const name = (personaNames.get(shift.personaId) ?? shift.personaId).split(' ')[0]
                    return (
                      <div key={shift.personaId} className="flex items-start gap-2 text-xs">
                        <span className={`font-medium flex-shrink-0 ${shift.shifted ? 'text-accent' : 'text-foreground'}`}>
                          {name}
                        </span>
                        <span className="text-muted">—</span>
                        <span className="text-muted">{shift.summary}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Resolution Paths ── */}
            {summary?.resolutionPaths && summary.resolutionPaths.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-accent text-[9px]">♥</span>
                  Resolution Paths
                </p>
                <div className="space-y-1.5">
                  {summary.resolutionPaths.map((path, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-accent flex-shrink-0 font-bold">{'\u2192'}</span>
                      <span className="text-foreground">{path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Fault Lines (from crux rooms) ── */}
            {completedRooms.size > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-foreground/30 text-[9px]">♠</span>
                  Fault Lines
                </p>
                <div className="space-y-2">
                  {Array.from(completedRooms.values()).map(room => {
                    const p0 = personaNames.get(room.personas[0]) ?? room.personas[0]
                    const p1 = personaNames.get(room.personas[1]) ?? room.personas[1]
                    const card = cruxCards.find(c => c.cruxRoomId === room.roomId)
                    return (
                      <div key={room.roomId} className="rounded-lg border border-card-border bg-card-bg p-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-foreground font-medium">{p0.split(' ')[0]}</span>
                          <span className="text-muted">vs</span>
                          <span className="text-foreground font-medium">{p1.split(' ')[0]}</span>
                          {card && (
                            <>
                              <span className="text-muted">—</span>
                              <span className="text-muted capitalize">{card.disagreementType}</span>
                              {card.resolved
                                ? <span className="text-accent text-[10px]">resolved</span>
                                : <span className="text-muted text-[10px]">unresolved</span>
                              }
                            </>
                          )}
                        </div>
                        {card?.diagnosis && (
                          <p className="text-[10px] text-muted mt-1 leading-snug">{card.diagnosis}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )
      })()}
    </div>
  )
}
