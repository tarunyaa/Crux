'use client'

import HexAvatar from '@/components/HexAvatar'
import type { Stance } from '@/lib/types'
import type { DivergenceMap } from '@/lib/argument/types'

interface AgentMeta {
  id: string
  name: string
  picture: string
}

interface AgentMessage {
  personaId: string
  content: string
  stance: { stance: Stance; confidence: number }
}

interface AgentPolygonProps {
  agents: AgentMeta[]
  messages: AgentMessage[]
  activeSpeakerId: string | null
  divergenceMap?: DivergenceMap
  expertNameToPersonaId?: Record<string, string>
}

interface Point {
  x: number
  y: number
}

interface LatestStance {
  stance: Stance
  confidence: number
}

// ─── Geometry ────────────────────────────────────────────────

function getVertexPositions(count: number, cx: number, cy: number, radius: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    // Start from top (-PI/2) and go clockwise
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }
  return points
}

function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
}

// ─── Stance Logic ────────────────────────────────────────────

function getLatestStances(agents: AgentMeta[], messages: AgentMessage[]): Map<string, LatestStance> {
  const map = new Map<string, LatestStance>()
  // Initialize all agents as uncertain/0.5
  for (const a of agents) {
    map.set(a.id, { stance: 'uncertain', confidence: 0.5 })
  }
  // Walk messages in order — last one per agent wins
  for (const msg of messages) {
    map.set(msg.personaId, {
      stance: msg.stance.stance,
      confidence: msg.stance.confidence,
    })
  }
  return map
}

function alignmentScore(a: LatestStance, b: LatestStance): number {
  if (a.stance === 'uncertain' || b.stance === 'uncertain') return 0
  const minConf = Math.min(a.confidence, b.confidence)
  if (a.stance === b.stance) return minConf
  return -minConf // opposite stances
}

// ─── Edge Color ──────────────────────────────────────────────

function edgeStyle(score: number): { stroke: string; opacity: number } {
  if (score > 0.3) {
    return { stroke: 'var(--accent)', opacity: Math.min(score, 0.9) }
  }
  if (score < -0.3) {
    return { stroke: 'var(--danger)', opacity: Math.min(Math.abs(score), 0.7) }
  }
  return { stroke: 'var(--card-border)', opacity: 0.3 }
}

// ─── Component ───────────────────────────────────────────────

export default function AgentPolygon({ agents, messages, activeSpeakerId, divergenceMap, expertNameToPersonaId }: AgentPolygonProps) {
  const n = agents.length
  if (n < 2) return null

  const size = 280
  const cx = size / 2
  const cy = size / 2
  const outerRadius = size / 2 - 44 // leave room for avatars + labels
  const vertices = getVertexPositions(n, cx, cy, outerRadius)
  const latestStances = getLatestStances(agents, messages)

  // Build reverse map: personaId → expertName
  const personaIdToExpert: Record<string, string> = {}
  if (expertNameToPersonaId) {
    for (const [expertName, personaId] of Object.entries(expertNameToPersonaId)) {
      personaIdToExpert[personaId] = expertName
    }
  }

  // Radar inner polygon — use divergenceMap root_strength when available, else confidence
  const radarPoints = agents.map((agent, i) => {
    let r: number
    if (divergenceMap) {
      const expertName = personaIdToExpert[agent.id]
      r = (expertName ? (divergenceMap.per_expert?.[expertName]?.root_strength ?? 0.5) : 0.5) * outerRadius
    } else {
      const stance = latestStances.get(agent.id)!
      r = stance.confidence * outerRadius
    }
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  })

  // All pairwise edges
  const edges: { i: number; j: number; score: number }[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sa = latestStances.get(agents[i].id)!
      const sb = latestStances.get(agents[j].id)!
      edges.push({ i, j, score: alignmentScore(sa, sb) })
    }
  }

  // Last speaker highlight — brighten edges from active speaker
  const lastSpeakerId = activeSpeakerId ?? (messages.length > 0 ? messages[messages.length - 1].personaId : null)

  // Edge style override when divergenceMap is provided
  function getDivergenceEdgeStyle(i: number, j: number): { stroke: string; opacity: number; strokeWidth: number; dashArray?: string } | null {
    if (!divergenceMap) return null
    const expertA = personaIdToExpert[agents[i].id]
    const expertB = personaIdToExpert[agents[j].id]
    if (!expertA || !expertB) return null
    const pair = divergenceMap.pairwise?.find(p =>
      (p.expert_a === expertA || p.expert_b === expertA) &&
      (p.expert_a === expertB || p.expert_b === expertB)
    )
    if (!pair) return { stroke: 'var(--card-border)', opacity: 0.15, strokeWidth: 1 }
    if (pair.is_crux) return { stroke: 'var(--accent)', opacity: 0.8, strokeWidth: 2 }
    if (pair.gap > 0.2) return { stroke: 'var(--muted)', opacity: 0.4, strokeWidth: 1, dashArray: '4 4' }
    return { stroke: 'var(--card-border)', opacity: 0.15, strokeWidth: 1 }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, maxHeight: size }}
        className="overflow-visible"
      >
        {/* Axis lines from center to each vertex (subtle guide) */}
        {vertices.map((v, i) => (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={v.x}
            y2={v.y}
            stroke="var(--card-border)"
            strokeWidth={1}
            opacity={0.25}
          />
        ))}

        {/* Pairwise edges */}
        {edges.map(({ i, j, score }) => {
          const divStyle = getDivergenceEdgeStyle(i, j)
          if (divStyle) {
            const isActive = lastSpeakerId === agents[i].id || lastSpeakerId === agents[j].id
            return (
              <line
                key={`edge-${i}-${j}`}
                x1={vertices[i].x}
                y1={vertices[i].y}
                x2={vertices[j].x}
                y2={vertices[j].y}
                stroke={divStyle.stroke}
                strokeWidth={isActive ? divStyle.strokeWidth + 1 : divStyle.strokeWidth}
                opacity={isActive ? Math.min(divStyle.opacity + 0.2, 1) : divStyle.opacity}
                strokeDasharray={divStyle.dashArray}
                strokeLinecap="round"
              />
            )
          }
          const style = edgeStyle(score)
          // Brighten if last speaker is one of the endpoints
          const isActive = lastSpeakerId === agents[i].id || lastSpeakerId === agents[j].id
          return (
            <line
              key={`edge-${i}-${j}`}
              x1={vertices[i].x}
              y1={vertices[i].y}
              x2={vertices[j].x}
              y2={vertices[j].y}
              stroke={style.stroke}
              strokeWidth={isActive && lastSpeakerId ? 2 : 1}
              opacity={isActive && lastSpeakerId ? Math.min(style.opacity + 0.3, 1) : style.opacity}
              strokeLinecap="round"
            />
          )
        })}

        {/* Inner radar polygon (confidence / root_strength) */}
        {radarPoints.length >= 2 && (
          <path
            d={pointsToSvgPath(radarPoints)}
            fill="var(--accent)"
            fillOpacity={0.1}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeOpacity={0.6}
            strokeLinejoin="round"
          />
        )}

        {/* Radar dots */}
        {radarPoints.map((p, i) => (
          <circle
            key={`radar-dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--accent)"
            opacity={0.8}
          />
        ))}

        {/* Vertex nodes — avatar + label */}
        {agents.map((agent, i) => {
          const v = vertices[i]
          const isActive = lastSpeakerId === agent.id
          const avatarSize = 32
          // Offset label below avatar
          const labelOffsetY = avatarSize / 2 + 14

          return (
            <g key={agent.id} className={isActive ? 'vertex-pulse' : ''}>
              {/* Avatar — rendered via foreignObject */}
              <foreignObject
                x={v.x - avatarSize / 2}
                y={v.y - avatarSize / 2}
                width={avatarSize}
                height={avatarSize}
              >
                <HexAvatar
                  src={agent.picture || undefined}
                  alt={agent.name}
                  size={avatarSize}
                  fallbackInitial={agent.name.charAt(0)}
                />
              </foreignObject>
              {/* Name label */}
              <text
                x={v.x}
                y={v.y + labelOffsetY}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={10}
                fontFamily="var(--font-sans)"
              >
                {agent.name.length > 12 ? agent.name.slice(0, 11) + '…' : agent.name}
              </text>
            </g>
          )
        })}
      </svg>
      </div>

      {/* Legend */}
      {divergenceMap ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted px-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span>Disagreement drivers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4" viewBox="0 0 16 4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
            <span>Some divergence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="10" viewBox="0 0 14 10">
              <polygon points="2,1 12,1 12,9 2,9" fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.6} />
            </svg>
            <span>Argument strength (&sigma;)</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted px-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span>Aligned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: 'var(--danger)' }} />
            <span>Opposed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="10" viewBox="0 0 14 10">
              <polygon points="2,1 12,1 12,9 2,9" fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.6} />
            </svg>
            <span>Confidence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
            <span>Speaking</span>
          </div>
        </div>
      )}
    </div>
  )
}
