'use client'

// ─── Dialogue Replay ─────────────────────────────────────────
// Renders a saved dialogue debate using the same ThreeColumnLayout.

import { ThreeColumnLayout } from './ThreeColumnLayout'
import type { HydratedDialogueState } from '@/lib/hooks/hydrateDialogueState'

interface DialogueReplayProps {
  topic: string
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  state: HydratedDialogueState
  createdAt: string
}

export function DialogueReplay({
  topic,
  personaIds,
  personaNames,
  personaAvatars,
  state,
  createdAt,
}: DialogueReplayProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span>Debate complete</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
          dialogue
        </span>
        <span className="text-xs">
          {new Date(createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <ThreeColumnLayout
        topic={topic}
        personaIds={personaIds}
        messages={state.messages}
        cruxCards={state.cruxCards}
        activeCruxRooms={new Map()}
        completedRooms={state.completedRooms}
        cruxTriggerMap={state.cruxTriggerMap}
        personaNames={personaNames}
        personaAvatars={personaAvatars}
        isRunning={false}
        isComplete={true}
        aspects={state.aspects}
        currentRound={null}
        currentPhase={null}
        shifts={state.shifts}
        summary={state.summary}
      />
    </div>
  )
}
