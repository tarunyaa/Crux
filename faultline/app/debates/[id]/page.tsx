import { notFound } from 'next/navigation'
import { getDebateById } from '@/lib/db/debates'
import { getPersonas } from '@/lib/personas/loader'
import { hydrateDebateState } from '@/lib/hooks/hydrateDebateState'
import { hydrateDialogueState } from '@/lib/hooks/hydrateDialogueState'
import DebateReplay from '@/components/DebateReplay'
import { DialogueReplay } from '@/components/dialogue/DialogueReplay'
import type { SSEEvent, DebateMode } from '@/lib/types'
import type { DialogueEvent } from '@/lib/dialogue/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DebateDetailPage({ params }: PageProps) {
  const { id } = await params
  const row = await getDebateById(id)
  if (!row) notFound()

  const personas = await getPersonas()
  const personaIds = row.personaIds as string[]
  const personaMap = new Map(personas.map(p => [p.id, p]))

  // Dialogue mode: use dialogue-specific hydration + replay
  if (row.mode === 'dialogue') {
    const events = row.events as DialogueEvent[]
    const state = hydrateDialogueState(events)

    const personaNames = new Map<string, string>()
    const personaAvatars = new Map<string, string>()
    for (const pid of personaIds) {
      const p = personaMap.get(pid)
      if (p) {
        personaNames.set(pid, p.name)
        personaAvatars.set(pid, p.twitterPicture ?? '')
      }
    }

    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <DialogueReplay
            topic={row.topic}
            personaIds={personaIds}
            personaNames={personaNames}
            personaAvatars={personaAvatars}
            state={state}
            createdAt={row.createdAt.toISOString()}
          />
        </div>
      </div>
    )
  }

  // Legacy modes: blitz, graph, v2
  const events = row.events as SSEEvent[]
  const state = hydrateDebateState(events)

  const personaMetas = personaIds.map(pid => {
    const p = personaMap.get(pid)
    return {
      id: pid,
      name: p?.name ?? pid,
      picture: p?.twitterPicture ?? '',
    }
  })

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <DebateReplay
          topic={row.topic}
          mode={row.mode as DebateMode}
          personaMetas={personaMetas}
          state={state}
          createdAt={row.createdAt.toISOString()}
          hasError={row.status === 'error'}
        />
      </div>
    </div>
  )
}
