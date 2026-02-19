'use client'

// ─── Dialogue Layout ──────────────────────────────────────────
// Matches the old MatchClient layout: 2-col grid (2/3 chat + 1/3 sidebar),
// crux cards full-width strip below the grid.
// Scrollable page — no h-screen or viewport locking.

import { useState, useRef, useEffect } from 'react'
import { MessageThread } from './MessageThread'
import { PlayingCard, PlayingCardExpanded } from '@/components/crux/PlayingCard'
import { CruxRoom } from '@/components/crux/CruxRoom'
import HexAvatar from '@/components/HexAvatar'
import type { DialogueMessage } from '@/lib/dialogue/types'
import type { CruxCard as CruxCardType } from '@/lib/crux/types'
import type { ActiveCruxRoom } from '@/lib/hooks/useDialogueStream'

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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">Alignment</h2>
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

// ─── DialogueLayout ───────────────────────────────────────────

interface DialogueLayoutProps {
  topic: string
  personaIds: string[]
  messages: DialogueMessage[]
  cruxCards: CruxCardType[]
  activeCruxRooms: Map<string, ActiveCruxRoom>
  completedRooms: Map<string, ActiveCruxRoom>
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  isRunning: boolean
  isComplete: boolean
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
  isRunning,
  isComplete,
}: DialogueLayoutProps) {
  // Track which crux room cards are expanded
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)

  // Auto-scroll feed to bottom as messages arrive
  useEffect(() => {
    if (feedRef.current) {
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

  const allRooms = new Map([...completedRooms, ...activeCruxRooms])
  const personaNamesList = Array.from(personaNames.values())
  const lastSpeakerId = messages.length > 0 ? messages[messages.length - 1].personaId : undefined

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground truncate">{topic}</h1>
        <div className="flex items-center gap-3 mt-1">
          {/* Status dot */}
          {isRunning && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm text-muted">Live</span>
            </div>
          )}
          {isComplete && (
            <span className="text-sm text-muted">Complete</span>
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
      </div>

      {/* ── Main grid: 2/3 chat + 1/3 sidebar — fixed height so crux cards start at consistent Y ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:h-[68vh]">

        {/* Chat feed — 2/3 width, fills grid height */}
        <div className="lg:col-span-2 lg:h-full lg:overflow-hidden">
          <div
            ref={feedRef}
            className="rounded-xl border border-card-border bg-card-bg p-4 space-y-4 overflow-y-auto lg:h-full"
            style={{ minHeight: '400px', maxHeight: '68vh' }}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-muted text-sm">Starting conversation...</p>
              </div>
            ) : (
              <MessageThread
                messages={messages}
                personaNames={personaNames}
                personaAvatars={personaAvatars}
              />
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
            <div className="rounded-xl border border-card-border bg-surface p-4">
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
                      {avatar0 ? (
                        <img src={avatar0} alt={p0} className="w-6 h-6 rounded-full object-cover absolute left-0 border border-card-border" />
                      ) : (
                        <div className="absolute left-0 w-6 h-6 rounded-full bg-card-bg border border-card-border flex items-center justify-center">
                          <span className="text-[10px] font-bold text-accent">{p0.charAt(0)}</span>
                        </div>
                      )}
                      {avatar1 ? (
                        <img src={avatar1} alt={p1} className="w-6 h-6 rounded-full object-cover absolute left-3 border border-card-border" />
                      ) : (
                        <div className="absolute left-3 w-6 h-6 rounded-full bg-card-bg border border-card-border flex items-center justify-center">
                          <span className="text-[10px] font-bold text-accent">{p1.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-foreground flex-1 min-w-0 truncate">
                      {p0.split(' ')[0]} <span className="text-muted font-normal">vs</span> {p1.split(' ')[0]}
                    </span>
                    {isActive ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                    ) : (
                      <span className="text-[10px] text-accent flex-shrink-0">✓</span>
                    )}
                  </div>
                  {/* Row 2: short label, muted */}
                  <p className="text-[11px] text-muted leading-snug">{room.label || room.question}</p>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            Crux Cards
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {cruxCards.map((card, i) => (
              <PlayingCard key={card.id} card={card} personaNames={personaNames} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Debate Results — shown when complete ── */}
      {isComplete && (() => {
        // ── Derived metrics ──────────────────────────────────────
        const msgCountByPersona = new Map<string, number>()
        for (const m of messages) {
          msgCountByPersona.set(m.personaId, (msgCountByPersona.get(m.personaId) ?? 0) + 1)
        }
        const mostActiveId = [...msgCountByPersona.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        const mostActiveName = mostActiveId ? (personaNames.get(mostActiveId) ?? mostActiveId).split(' ')[0] : '—'
        const mostActiveCount = mostActiveId ? msgCountByPersona.get(mostActiveId)! : 0

        const resolvedCount = cruxCards.filter(c => c.resolved).length
        const resolutionPct = cruxCards.length > 0 ? Math.round((resolvedCount / cruxCards.length) * 100) : 0

        const typeCounts = new Map<string, number>()
        for (const c of cruxCards) typeCounts.set(c.disagreementType, (typeCounts.get(c.disagreementType) ?? 0) + 1)
        const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

        const roomMsgCounts = new Map<string, number>()
        for (const room of completedRooms.values()) roomMsgCounts.set(room.roomId, room.messages.filter(m => m.type === 'persona').length)
        const deepestRoomId = [...roomMsgCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        const deepestRoom = deepestRoomId ? completedRooms.get(deepestRoomId) : undefined
        const deepestRoomLabel = deepestRoom
          ? `${(personaNames.get(deepestRoom.personas[0]) ?? deepestRoom.personas[0]).split(' ')[0]} vs ${(personaNames.get(deepestRoom.personas[1]) ?? deepestRoom.personas[1]).split(' ')[0]}`
          : '—'

        // Disagreement Entropy: H = -sum(p_i * ln(p_i)) over disagreementType distribution
        const entropy = cruxCards.length > 0
          ? -[...typeCounts.values()].reduce((sum, count) => {
              const p = count / cruxCards.length
              return sum + p * Math.log(p)
            }, 0)
          : 0
        // CCR: C_t / (D_0 + C_t) — approximated as resolved / total cards this session
        const ccr = cruxCards.length > 0 ? resolvedCount / cruxCards.length : 0

        const allPersonaIds = Array.from(new Set(cruxCards.flatMap(c => Object.keys(c.personas))))

        return (
          <div className="space-y-5 rounded-xl border border-card-border bg-surface p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Debate Results</h2>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{messages.length} messages</span>
                <span>·</span>
                <span>{completedRooms.size} crux room{completedRooms.size !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* ── Metrics row ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Resolution rate */}
              <div className="rounded-lg border border-card-border bg-card-bg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Resolution</p>
                <p className="text-lg font-bold text-foreground leading-none mb-1.5">{resolutionPct}%</p>
                <div className="h-1 w-full rounded-full bg-card-border overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${resolutionPct}%` }} />
                </div>
                <p className="text-[10px] text-muted mt-1">{resolvedCount}/{cruxCards.length} cruxes</p>
              </div>

              {/* Most active */}
              <div className="rounded-lg border border-card-border bg-card-bg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Most Active</p>
                <p className="text-lg font-bold text-foreground leading-none truncate">{mostActiveName}</p>
                <p className="text-[10px] text-muted mt-1">{mostActiveCount} messages</p>
              </div>

              {/* Dominant fault type */}
              <div className="rounded-lg border border-card-border bg-card-bg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Root Cause</p>
                <p className="text-sm font-bold text-foreground leading-snug capitalize">{dominantType}</p>
                <p className="text-[10px] text-muted mt-1">Disagreement type</p>
              </div>

              {/* Deepest clash */}
              <div className="rounded-lg border border-card-border bg-card-bg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Deepest Clash</p>
                <p className="text-sm font-bold text-foreground leading-snug truncate">{deepestRoomLabel}</p>
                {deepestRoomId && <p className="text-[10px] text-muted mt-1">{roomMsgCounts.get(deepestRoomId)} exchanges</p>}
              </div>
            </div>

            {/* ── Benchmark Metrics (from whitepaper §8) ── */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
                Benchmark Metrics
                <span className="ml-2 text-[9px] font-normal normal-case opacity-60">§8 evaluation suite</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {/* H — Disagreement Entropy */}
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">H</p>
                  <p className="text-lg font-bold text-foreground leading-none">{entropy.toFixed(2)}</p>
                  <p className="text-[10px] text-muted mt-1">Disagreement entropy</p>
                  <p className="text-[9px] text-muted opacity-60 mt-0.5">Lower = more focused</p>
                </div>
                {/* CCR — Crux Compression Rate */}
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">CCR</p>
                  <p className="text-lg font-bold text-foreground leading-none">{(ccr * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-muted mt-1">Crux compression rate</p>
                  <p className="text-[9px] text-muted opacity-60 mt-0.5">Target ≥ 50%</p>
                </div>
                {/* IQS — Insight Quality Score */}
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">IQS</p>
                  <p className="text-lg font-bold text-muted leading-none opacity-40">—</p>
                  <p className="text-[10px] text-muted mt-1">Insight quality score</p>
                  <p className="text-[9px] text-muted opacity-60 mt-0.5">Needs expert raters</p>
                </div>
                {/* CRR — Crux Recurrence Rate */}
                <div className="rounded-lg border border-card-border bg-card-bg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">CRR</p>
                  <p className="text-lg font-bold text-muted leading-none opacity-40">—</p>
                  <p className="text-[10px] text-muted mt-1">Crux recurrence rate</p>
                  <p className="text-[9px] text-muted opacity-60 mt-0.5">Needs multi-session</p>
                </div>
              </div>
            </div>

            {/* ── Position matrix ── */}
            {cruxCards.length > 0 && allPersonaIds.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Position Matrix</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-muted font-normal pb-2 pr-3 min-w-[80px]">Persona</th>
                        {cruxCards.map(card => (
                          <th key={card.id} className="text-center text-muted font-normal pb-2 px-2 min-w-[80px]">
                            <span className="line-clamp-2 leading-snug">{card.question}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allPersonaIds.map(personaId => {
                        const name = personaNames.get(personaId) ?? personaId
                        return (
                          <tr key={personaId} className="border-t border-card-border">
                            <td className="py-2 pr-3 font-medium text-foreground">{name.split(' ')[0]}</td>
                            {cruxCards.map(card => {
                              const pos = card.personas[personaId]?.position
                              const color =
                                pos === 'YES' ? 'text-foreground font-bold' :
                                pos === 'NO' ? 'text-accent font-bold' :
                                pos === 'NUANCED' ? 'text-muted' :
                                'text-muted opacity-30'
                              return (
                                <td key={card.id} className={`py-2 px-2 text-center ${color}`}>
                                  {pos ?? '—'}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Fault lines ── */}
            {completedRooms.size > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Fault Lines</p>
                <div className="space-y-1.5">
                  {Array.from(completedRooms.values()).map(room => {
                    const p0 = personaNames.get(room.personas[0]) ?? room.personas[0]
                    const p1 = personaNames.get(room.personas[1]) ?? room.personas[1]
                    const card = cruxCards.find(c => c.cruxRoomId === room.roomId)
                    return (
                      <div key={room.roomId} className="flex items-center gap-2 text-xs">
                        <span className="text-foreground font-medium">{p0.split(' ')[0]}</span>
                        <span className="text-muted">vs</span>
                        <span className="text-foreground font-medium">{p1.split(' ')[0]}</span>
                        {card && (
                          <>
                            <span className="text-muted">·</span>
                            <span className="text-muted capitalize">{card.disagreementType}</span>
                            {card.resolved
                              ? <span className="text-accent text-[10px]">✓ resolved</span>
                              : <span className="text-muted text-[10px]">unresolved</span>
                            }
                          </>
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
