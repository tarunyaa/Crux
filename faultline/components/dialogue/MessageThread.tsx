'use client'

// ─── Message Thread ───────────────────────────────────────────
// Compact group-chat style. Avatar + name + message, tight rows.

import type { DialogueMessage } from '@/lib/dialogue/types'
import type { CruxTriggerInfo } from '@/lib/hooks/useDialogueStream'
import { renderInlineMarkdown } from '@/lib/utils/inline-markdown'

interface MessageThreadProps {
  messages: DialogueMessage[]
  allMessages?: DialogueMessage[]  // For cross-message reply lookups
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  cruxTriggerMap?: Map<string, CruxTriggerInfo>
}

export function MessageThread({ messages, allMessages, personaNames, personaAvatars, cruxTriggerMap }: MessageThreadProps) {
  const lookupPool = allMessages ?? messages
  return (
    <div className="space-y-1.5">
      {messages.map(msg => (
        <MessageRow
          key={msg.id}
          message={msg}
          messages={lookupPool}
          personaNames={personaNames}
          personaAvatars={personaAvatars}
          triggerInfo={cruxTriggerMap?.get(msg.id)}
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
  triggerInfo?: CruxTriggerInfo
}

function MessageRow({ message, messages, personaNames, personaAvatars, triggerInfo }: MessageRowProps) {
  const isCruxTrigger = !!triggerInfo
  const name = personaNames.get(message.personaId) ?? message.personaId
  const avatarUrl = personaAvatars.get(message.personaId)

  const replyTarget = message.replyTo
    ? messages.find(m => m.id === message.replyTo)
    : null
  const replyTargetName = replyTarget
    ? (personaNames.get(replyTarget.personaId) ?? replyTarget.personaId)
    : null

  return (
    <div className={`group flex gap-2 px-3 py-1 rounded-md transition-colors ${
      isCruxTrigger
        ? 'border-l-2 border-l-accent bg-accent/5'
        : 'hover:bg-surface'
    }`}>
      {/* Avatar — 24px compact, hexagonal */}
      <div className="flex-shrink-0 mt-0.5">
        {avatarUrl ? (
          <div className="relative w-6 h-6 flex-shrink-0">
            <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
            <div className="absolute inset-0 hex-clip overflow-hidden bg-card-bg">
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            </div>
          </div>
        ) : (
          <div className="relative w-6 h-6 flex-shrink-0">
            <div className="absolute inset-[-1px] hex-clip" style={{ background: 'var(--card-border)' }} />
            <div className="absolute inset-0 hex-clip bg-card-bg flex items-center justify-center">
              <span className="text-[9px] font-bold text-accent">{name.charAt(0).toUpperCase()}</span>
            </div>
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
          {triggerInfo && (
            <>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-accent opacity-70">{triggerInfo.label}</span>
              {triggerInfo.disagreementType && (
                <span className="text-[8px] font-medium uppercase tracking-wider text-muted bg-surface px-1 py-px rounded">{triggerInfo.disagreementType}</span>
              )}
            </>
          )}
          <span className="text-[10px] text-muted opacity-40 ml-auto">
            {formatTime(message.timestamp)}
          </span>
        </div>
        {/* Message text — tight line height */}
        <p className="text-xs text-foreground leading-snug mt-0.5">
          {renderInlineMarkdown(message.content)}
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
