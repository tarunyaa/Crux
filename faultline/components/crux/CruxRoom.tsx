'use client'

// ─── Crux Room — inline expanded view ─────────────────────────
// Used inside the inline crux room box in the main feed.

import { useRef, useEffect } from 'react'
import type { CruxMessage } from '@/lib/crux/types'
import { renderInlineMarkdown } from '@/lib/utils/inline-markdown'

interface CruxRoomProps {
  roomId: string
  question: string
  messages: CruxMessage[]
  personaNames: Map<string, string>
  personaAvatars?: Map<string, string>
  status: 'arguing' | 'complete'
}

export function CruxRoom({ question, messages, personaNames, personaAvatars, status }: CruxRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div ref={scrollRef} className="overflow-y-auto max-h-52 space-y-2.5">
      {messages.length === 0 && (
        <p className="text-[11px] text-muted italic">Starting...</p>
      )}
      {messages.map((msg, idx) => {
        // Show phase label on first message of each phase
        const showPhaseLabel = msg.phase && (idx === 0 || messages[idx - 1]?.phase !== msg.phase)
        const phaseLabel = msg.phase === 'position' ? 'Position' : msg.phase === 'exchange' ? 'Exchange' : msg.phase === 'convergence' ? 'Convergence' : null

        if (msg.type === 'system') {
          return (
            <div key={msg.id}>
              {showPhaseLabel && phaseLabel && (
                <div className="flex items-center gap-1.5 py-0.5 mb-1">
                  <div className="h-px flex-1 bg-accent/20" />
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-accent/60">{phaseLabel}</span>
                  <div className="h-px flex-1 bg-accent/20" />
                </div>
              )}
              <div className="flex items-center gap-2 py-0.5">
                <div className="h-px flex-1 bg-card-border opacity-40" />
                <span className="text-[10px] text-muted italic flex-shrink-0 max-w-[80%] text-center">{msg.content}</span>
                <div className="h-px flex-1 bg-card-border opacity-40" />
              </div>
            </div>
          )
        }
        const name = personaNames.get(msg.personaId!) ?? msg.personaId!
        const firstName = name.split(' ')[0]
        const avatarUrl = personaAvatars?.get(msg.personaId!)
        return (
          <div key={msg.id}>
            {showPhaseLabel && phaseLabel && (
              <div className="flex items-center gap-1.5 py-0.5 mb-1">
                <div className="h-px flex-1 bg-accent/20" />
                <span className="text-[8px] font-semibold uppercase tracking-wider text-accent/60">{phaseLabel}</span>
                <div className="h-px flex-1 bg-accent/20" />
              </div>
            )}
            <div className="flex gap-2">
            {avatarUrl ? (
              <div className="relative w-5 h-5 flex-shrink-0 mt-0.5">
                <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
                <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg">
                  <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                </div>
              </div>
            ) : (
              <div className="relative w-5 h-5 flex-shrink-0 mt-0.5">
                <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
                <div className="absolute inset-0 hex-clip bg-card-bg flex items-center justify-center">
                  <span className="text-[8px] font-bold text-accent">{name.charAt(0)}</span>
                </div>
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-accent">{firstName}</span>
              <p className="text-[11px] text-foreground leading-snug mt-0.5">{renderInlineMarkdown(msg.content)}</p>
            </div>
          </div>
          </div>
        )
      })}
    </div>
  )
}
