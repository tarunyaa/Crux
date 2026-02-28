// ─── PDF Export for Debate Transcript ─────────────────────────
// Uses html2pdf.js to render a hidden, print-styled div and trigger download.

import type { DialogueMessage, DebateAspect, PositionShift, DebateSummary } from '@/lib/dialogue/types'
import type { CruxCard } from '@/lib/crux/types'
import type { ActiveCruxRoom } from '@/lib/hooks/useDialogueStream'

interface ExportDebatePDFParams {
  topic: string
  personaIds: string[]
  messages: DialogueMessage[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  aspects: DebateAspect[]
  cruxCards: CruxCard[]
  completedRooms: Map<string, ActiveCruxRoom>
  shifts: PositionShift[]
  summary: DebateSummary | null
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getName(personaNames: Map<string, string>, id: string): string {
  return personaNames.get(id) ?? id
}

function renderAvatar(src: string | undefined, name: string, size = 18): string {
  if (src) {
    return `<img src="${esc(src)}" alt="${esc(name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;" crossorigin="anonymous" />`
  }
  // Fallback: initial letter circle
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:#eee;color:#c00;font-size:${Math.round(size * 0.5)}px;font-weight:700;flex-shrink:0;">${esc(name.charAt(0))}</span>`
}

export async function exportDebatePDF({
  topic,
  personaIds,
  messages,
  personaNames,
  personaAvatars,
  aspects,
  cruxCards,
  completedRooms,
  shifts,
  summary,
}: ExportDebatePDFParams): Promise<void> {
  // Dynamic import — html2pdf.js is a browser-only UMD module
  const html2pdf = (await import('html2pdf.js')).default

  // ── Group messages by phase ──
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

  // ── Build HTML ──
  const sections: string[] = []

  // Header
  const personaChips = Array.from(personaNames.entries()).map(([id, name]) => {
    const avatar = personaAvatars.get(id)
    return `<span style="display:inline-flex;align-items:center;gap:4px;">${renderAvatar(avatar, name, 16)}<span>${esc(name)}</span></span>`
  }).join(' <span style="color:#ccc;">·</span> ')

  sections.push(`
    <div style="margin-bottom:24px;">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 8px 0;">${esc(topic)}</h1>
      <div style="font-size:11px;color:#666;margin:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        ${personaChips}
        <span style="color:#ccc;">·</span> ${messages.length} messages
        <span style="color:#ccc;">·</span> ${aspects.length} rounds
        <span style="color:#ccc;">·</span> ${cruxCards.length} crux cards
      </div>
    </div>
  `)

  // Alignment graph
  if (personaIds.length >= 2) {
    const size = 220
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2 - 40

    // Compute vertex positions (same geometry as DialoguePolygon)
    const vertices = personaIds.map((_, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / personaIds.length
      return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
    })

    // Build completed pair set
    function pairKey(a: string, b: string): string { return [a, b].sort().join('::') }
    const completedPairs = new Set<string>()
    for (const room of completedRooms.values()) {
      if (room.personas.length >= 2) completedPairs.add(pairKey(room.personas[0], room.personas[1]))
    }

    // Build edges
    const edgeLines: string[] = []
    for (let i = 0; i < personaIds.length; i++) {
      for (let j = i + 1; j < personaIds.length; j++) {
        const key = pairKey(personaIds[i], personaIds[j])
        if (completedPairs.has(key)) {
          // Resolved — dashed gray
          edgeLines.push(`<line x1="${vertices[i].x}" y1="${vertices[i].y}" x2="${vertices[j].x}" y2="${vertices[j].y}" stroke="#999" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>`)
        } else {
          // Default — faint
          edgeLines.push(`<line x1="${vertices[i].x}" y1="${vertices[i].y}" x2="${vertices[j].x}" y2="${vertices[j].y}" stroke="#ddd" stroke-width="1" opacity="0.4"/>`)
        }
      }
    }

    // Axis spokes
    const spokes = vertices.map(v =>
      `<line x1="${cx}" y1="${cy}" x2="${v.x}" y2="${v.y}" stroke="#ddd" stroke-width="1" opacity="0.3"/>`
    ).join('')

    // Vertex labels (name + initial circle)
    const vertexLabels = personaIds.map((id, i) => {
      const v = vertices[i]
      const name = getName(personaNames, id)
      const firstName = name.split(' ')[0]
      const label = firstName.length > 10 ? firstName.slice(0, 9) + '\u2026' : firstName
      return `
        <circle cx="${v.x}" cy="${v.y}" r="14" fill="#f5f5f5" stroke="#ccc" stroke-width="1"/>
        <text x="${v.x}" y="${v.y + 4}" text-anchor="middle" fill="#c00" font-size="11" font-weight="700" font-family="Georgia,serif">${esc(name.charAt(0))}</text>
        <text x="${v.x}" y="${v.y + 28}" text-anchor="middle" fill="#333" font-size="8" font-family="Georgia,serif">${esc(label)}</text>
      `
    }).join('')

    // Legend
    const legendY = size + 5
    const legend = `
      <line x1="10" y1="${legendY}" x2="30" y2="${legendY}" stroke="#999" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
      <text x="34" y="${legendY + 3}" fill="#999" font-size="7" font-family="Georgia,serif">Resolved</text>
      <line x1="80" y1="${legendY}" x2="100" y2="${legendY}" stroke="#ddd" stroke-width="1" opacity="0.5"/>
      <text x="104" y="${legendY + 3}" fill="#999" font-size="7" font-family="Georgia,serif">No crux room</text>
    `

    sections.push(`
      <div style="margin-bottom:20px;padding:12px;border:1px solid #ddd;border-radius:6px;text-align:center;">
        <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#c00;margin:0 0 8px 0;">Alignment</p>
        <svg viewBox="0 0 ${size} ${legendY + 14}" width="${size}" style="margin:0 auto;display:block;">
          ${spokes}
          ${edgeLines.join('')}
          ${vertexLabels}
          ${legend}
        </svg>
      </div>
    `)
  }

  // Round topics
  if (aspects.length > 0) {
    sections.push(`
      <div style="margin-bottom:20px;padding:10px 14px;border:1px solid #ddd;border-radius:6px;">
        <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#999;margin:0 0 6px 0;">Round Topics</p>
        ${aspects.map((a, i) => `
          <p style="font-size:11px;margin:2px 0;color:#333;">
            <strong>Round ${i + 1}:</strong> ${esc(a.label)}${a.description ? ` — <span style="color:#666;">${esc(a.description)}</span>` : ''}
          </p>
        `).join('')}
      </div>
    `)
  }

  // Helper to render a message block
  function renderMessage(msg: DialogueMessage, indent = false): string {
    const name = getName(personaNames, msg.personaId)
    const avatar = personaAvatars.get(msg.personaId)
    const style = indent ? 'margin-left:20px;padding-left:10px;border-left:2px solid #ddd;' : ''
    return `
      <div style="margin-bottom:8px;${style}">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
          ${renderAvatar(avatar, name)}
          <span style="font-size:10px;font-weight:700;color:#c00;">${esc(name)}</span>
        </div>
        <p style="font-size:11px;color:#222;margin:0;line-height:1.5;${avatar ? 'padding-left:23px;' : ''}">${esc(msg.content)}</p>
      </div>
    `
  }

  function renderSectionHeader(label: string): string {
    return `
      <div style="margin:20px 0 10px 0;border-bottom:1px solid #ccc;padding-bottom:4px;">
        <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#333;margin:0;">${esc(label)}</p>
      </div>
    `
  }

  // Opening statements
  if (openingMessages.length > 0) {
    sections.push(renderSectionHeader('Opening Statements'))
    for (const msg of openingMessages) {
      sections.push(renderMessage(msg))
    }
  }

  // Rounds
  for (const [roundNum, roundMsgs] of roundGroups) {
    const aspect = aspects[roundNum - 1]
    const label = `Round ${roundNum}${aspect ? `: ${aspect.label}` : ''}`
    sections.push(renderSectionHeader(label))
    if (aspect?.description) {
      sections.push(`<p style="font-size:10px;color:#666;margin:0 0 8px 0;">${esc(aspect.description)}</p>`)
    }

    const initialTakes = roundMsgs.filter(m => (m.miniround ?? 0) === 0)
    const replies = roundMsgs.filter(m => (m.miniround ?? 0) > 0)

    for (const take of initialTakes) {
      sections.push(renderMessage(take))
    }
    for (const reply of replies) {
      sections.push(renderMessage(reply, true))
    }
  }

  // Closing statements
  if (closingMessages.length > 0) {
    sections.push(renderSectionHeader('Closing Statements'))
    for (const msg of closingMessages) {
      sections.push(renderMessage(msg))
    }
  }

  // ── Crux Cards ──
  if (cruxCards.length > 0) {
    sections.push(renderSectionHeader('Crux Cards'))
    for (const card of cruxCards) {
      const personaEntries = Object.entries(card.personas)
      sections.push(`
        <div style="margin-bottom:14px;padding:10px 14px;border:1px solid #ddd;border-radius:6px;">
          <p style="font-size:11px;font-weight:700;color:#222;margin:0 0 4px 0;">${esc(card.question)}</p>
          <p style="font-size:9px;color:#999;margin:0 0 6px 0;">${esc(card.disagreementType)} · ${card.resolved ? 'Resolved' : 'Unresolved'}</p>
          ${personaEntries.map(([pid, p]) => `
            <div style="margin-bottom:4px;">
              <span style="font-size:10px;font-weight:700;color:#c00;">${esc(getName(personaNames, pid))}</span>
              <span style="font-size:10px;color:#666;"> (${esc(p.position)})</span>
              <p style="font-size:10px;color:#333;margin:2px 0 0 0;">${esc(p.reasoning)}</p>
              ${p.falsifier ? `<p style="font-size:9px;color:#888;margin:2px 0 0 0;font-style:italic;">Falsifier: ${esc(p.falsifier)}</p>` : ''}
            </div>
          `).join('')}
          ${card.diagnosis ? `<p style="font-size:10px;color:#555;margin:6px 0 0 0;"><strong>Diagnosis:</strong> ${esc(card.diagnosis)}</p>` : ''}
          ${card.resolution ? `<p style="font-size:10px;color:#555;margin:2px 0 0 0;"><strong>Resolution:</strong> ${esc(card.resolution)}</p>` : ''}
        </div>
      `)
    }
  }

  // ── Summary Sections ──
  if (summary) {
    sections.push(renderSectionHeader('Debate Summary'))

    // Claims
    if (summary.claims?.length) {
      sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Claims Under Debate</p>`)
      for (const claim of summary.claims) {
        sections.push(`
          <div style="margin-bottom:8px;padding:8px 12px;border:1px solid #eee;border-radius:4px;">
            <p style="font-size:11px;font-weight:600;color:#222;margin:0 0 4px 0;">${esc(claim.claim)}</p>
            ${claim.stances.map(s => {
              const name = getName(personaNames, s.personaId).split(' ')[0]
              const color = s.position === 'for' ? '#222' : s.position === 'against' ? '#c00' : '#666'
              return `<p style="font-size:10px;margin:1px 0;"><span style="font-weight:700;color:${color};">${esc(name)} (${s.position})</span>: <span style="color:#555;">${esc(s.reasoning)}</span></p>`
            }).join('')}
          </div>
        `)
      }
    }

    // Agreements
    if (summary.agreements?.length) {
      sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Points of Agreement</p>`)
      for (const a of summary.agreements) {
        sections.push(`<p style="font-size:11px;color:#333;margin:2px 0;">— ${esc(a)}</p>`)
      }
    }

    // Evidence Ledger
    if (summary.evidenceLedger?.length) {
      sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Evidence Ledger</p>`)
      for (const el of summary.evidenceLedger) {
        const name = getName(personaNames, el.personaId).split(' ')[0]
        sections.push(`<p style="font-size:10px;font-weight:700;color:#c00;margin:6px 0 2px 0;">${esc(name)}</p>`)
        if (el.accepted.length) {
          sections.push(`<p style="font-size:9px;font-weight:600;color:#333;margin:2px 0;">Accepted:</p>`)
          for (const a of el.accepted) {
            sections.push(`<p style="font-size:10px;color:#444;margin:1px 0 1px 10px;">${esc(a.claim)} — <span style="color:#888;">${esc(a.reason)}</span></p>`)
          }
        }
        if (el.challenged.length) {
          sections.push(`<p style="font-size:9px;font-weight:600;color:#c00;margin:2px 0;">Challenged:</p>`)
          for (const c of el.challenged) {
            sections.push(`<p style="font-size:10px;color:#444;margin:1px 0 1px 10px;">${esc(c.claim)} — <span style="color:#888;">${esc(c.reason)}</span></p>`)
          }
        }
      }
    }

    // Flip Conditions
    if (summary.flipConditions?.some(fc => fc.conditions.length > 0)) {
      sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">What Would Change Their Mind</p>`)
      for (const fc of summary.flipConditions.filter(fc => fc.conditions.length > 0)) {
        const name = getName(personaNames, fc.personaId).split(' ')[0]
        sections.push(`<p style="font-size:10px;font-weight:700;color:#c00;margin:4px 0 2px 0;">${esc(name)}</p>`)
        for (const c of fc.conditions) {
          sections.push(`<p style="font-size:10px;color:#444;margin:1px 0 1px 10px;">— ${esc(c)}</p>`)
        }
      }
    }

    // Resolution Paths
    if (summary.resolutionPaths?.length) {
      sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Resolution Paths</p>`)
      for (const path of summary.resolutionPaths) {
        sections.push(`<p style="font-size:11px;color:#333;margin:2px 0;">\u2192 ${esc(path)}</p>`)
      }
    }
  }

  // Position Shifts
  if (shifts.length > 0) {
    sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Position Shifts</p>`)
    for (const shift of shifts) {
      const name = getName(personaNames, shift.personaId).split(' ')[0]
      const color = shift.shifted ? '#c00' : '#333'
      sections.push(`<p style="font-size:10px;margin:2px 0;"><span style="font-weight:700;color:${color};">${esc(name)}</span> — <span style="color:#666;">${esc(shift.summary)}</span></p>`)
    }
  }

  // Fault Lines
  if (completedRooms.size > 0) {
    sections.push(`<p style="font-size:10px;font-weight:700;color:#666;margin:12px 0 4px 0;text-transform:uppercase;">Fault Lines</p>`)
    for (const room of completedRooms.values()) {
      const p0 = getName(personaNames, room.personas[0]).split(' ')[0]
      const p1 = getName(personaNames, room.personas[1]).split(' ')[0]
      const card = cruxCards.find(c => c.cruxRoomId === room.roomId)
      let line = `${p0} vs ${p1}`
      if (card) {
        line += ` — ${card.disagreementType} (${card.resolved ? 'resolved' : 'unresolved'})`
        if (card.diagnosis) line += `: ${card.diagnosis}`
      }
      sections.push(`<p style="font-size:10px;color:#333;margin:2px 0;">${esc(line)}</p>`)
    }
  }

  // ── Create container and render ──
  const container = document.createElement('div')
  container.style.cssText = 'font-family:Georgia,serif;color:#222;background:#fff;padding:20px;max-width:700px;'
  container.innerHTML = sections.join('')
  document.body.appendChild(container)

  const sanitized = topic.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').slice(0, 50).toLowerCase()
  const filename = `debate-${sanitized || 'export'}.pdf`

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (html2pdf() as any)
      .set({
        margin: [10, 12, 10, 12],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(container)
      .save()
  } finally {
    document.body.removeChild(container)
  }
}
