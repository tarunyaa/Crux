'use client'

// ─── Message Thread ───────────────────────────────────────────
// Compact group-chat style. Avatar + name + message, tight rows.

import type { DialogueMessage } from '@/lib/dialogue/types'

interface MessageThreadProps {
  messages: DialogueMessage[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

export function MessageThread({ messages, personaNames, personaAvatars }: MessageThreadProps) {
  return (
    <div className="space-y-1.5">
      {messages.map(msg => (
        <MessageRow
          key={msg.id}
          message={msg}
          messages={messages}
          personaNames={personaNames}
          personaAvatars={personaAvatars}
        />
      ))}
    </div>
  )
}

interface MessageRowProps {
  message: DialogueMessage
  messages: DialogueMessage[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

function MessageRow({ message, messages, personaNames, personaAvatars }: MessageRowProps) {
  const name = personaNames.get(message.personaId) ?? message.personaId
  const avatarUrl = personaAvatars.get(message.personaId)

  const replyTarget = message.replyTo
    ? messages.find(m => m.id === message.replyTo)
    : null
  const replyTargetName = replyTarget
    ? (personaNames.get(replyTarget.personaId) ?? replyTarget.personaId)
    : null

  return (
    <div className="group flex gap-2 px-3 py-1 hover:bg-surface rounded-md transition-colors">
      {/* Avatar — 24px compact */}
      <div className="flex-shrink-0 mt-0.5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-6 h-6 rounded-full object-cover border border-card-border"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-card-bg border border-card-border flex items-center justify-center">
            <span className="text-[10px] font-bold text-accent">{name.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-accent leading-none">{name}</span>
          {replyTargetName && (
            <span className="text-[10px] text-muted">→ {replyTargetName}</span>
          )}
          <span className="text-[10px] text-muted opacity-40 ml-auto">
            {formatTime(message.timestamp)}
          </span>
        </div>
        {/* Message text — tight line height */}
        <p className="text-xs text-foreground leading-snug mt-0.5">
          {message.content}
        </p>
      </div>
    </div>
  )
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
