'use client'

// ─── Main Dialogue View ───────────────────────────────────────

import { ThreeColumnLayout } from './ThreeColumnLayout'
import { useDialogueStream } from '@/lib/hooks/useDialogueStream'
import { useEffect, useRef, useState, useCallback } from 'react'

interface DialogueViewProps {
  topic: string
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
}

export function DialogueView({ topic, personaIds, personaNames, personaAvatars }: DialogueViewProps) {
  const {
    messages,
    cruxCards,
    activeCruxRooms,
    completedRooms,
    cruxTriggerMap,
    isRunning,
    isComplete,
    error,
    aspects,
    currentRound,
    currentPhase,
    shifts,
    summary,
    collectedEvents,
    start,
  } = useDialogueStream(topic, personaIds)

  const hasStartedRef = useRef(false)
  const [isSaved, setIsSaved] = useState(false)

  const handleSave = useCallback(async () => {
    const res = await fetch('/api/dialogue/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, personaIds, events: collectedEvents }),
    })
    if (!res.ok) throw new Error('Failed to save')
    setIsSaved(true)
  }, [topic, personaIds, collectedEvents])

  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      start()
    }
    // start is stable (useRef-guarded), only needs to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="max-w-md p-6 bg-card-bg border border-accent/40 rounded-xl text-accent">
          <h2 className="font-bold mb-2">Error</h2>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <ThreeColumnLayout
        topic={topic}
        personaIds={personaIds}
        messages={messages}
        cruxCards={cruxCards}
        activeCruxRooms={activeCruxRooms}
        completedRooms={completedRooms}
        cruxTriggerMap={cruxTriggerMap}
        personaNames={personaNames}
        personaAvatars={personaAvatars}
        isRunning={isRunning}
        isComplete={isComplete}
        aspects={aspects}
        currentRound={currentRound}
        currentPhase={currentPhase}
        shifts={shifts}
        summary={summary}
        onSave={handleSave}
        isSaved={isSaved}
      />
    </div>
  )
}
