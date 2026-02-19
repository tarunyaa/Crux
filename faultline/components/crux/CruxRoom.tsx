'use client'

// ─── Crux Room — inline expanded view ─────────────────────────
// Used inside the inline crux room box in the main feed.

import { useRef, useEffect } from 'react'
import type { CruxMessage } from '@/lib/crux/types'

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
      {messages.map(msg => {
        if (msg.type === 'system') {
          return (
            <div key={msg.id} className="flex items-center gap-2 py-0.5">
              <div className="h-px flex-1 bg-card-border opacity-40" />
              <span className="text-[10px] text-muted italic flex-shrink-0 max-w-[80%] text-center">{msg.content}</span>
              <div className="h-px flex-1 bg-card-border opacity-40" />
            </div>
          )
        }
        const name = personaNames.get(msg.personaId!) ?? msg.personaId!
        const firstName = name.split(' ')[0]
        const avatarUrl = personaAvatars?.get(msg.personaId!)
        return (
          <div key={msg.id} className="flex gap-2">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-5 h-5 rounded-full object-cover border border-card-border flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-card-bg border border-card-border flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[8px] font-bold text-accent">{name.charAt(0)}</span>
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-accent">{firstName}</span>
              <p className="text-[11px] text-foreground leading-snug mt-0.5">{msg.content}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
