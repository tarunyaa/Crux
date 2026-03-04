// ─── Dialogue Page ────────────────────────────────────────────

import { DialogueClient } from './DialogueClient'
import { getPersona } from '@/lib/personas/loader'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ personas?: string; topic?: string; mode?: string }>
}

export default async function DialoguePage({ searchParams }: Props) {
  const params = await searchParams

  // Parse personas from URL or fall back to defaults for direct navigation
  const rawPersonas = params.personas
  const topic = params.topic
    ? decodeURIComponent(params.topic)
    : 'Bitcoin vs Ethereum: Which will dominate in 2026?'

  const personaIds = rawPersonas
    ? rawPersonas.split(',').map(id => decodeURIComponent(id))
    : ['Michael Saylor', 'Arthur Hayes', 'Brian Armstrong']

  if (personaIds.length < 2) {
    redirect('/')
  }

  // Load persona names + avatars
  const personaNames = new Map<string, string>()
  const personaAvatars = new Map<string, string>()
  for (const id of personaIds) {
    const persona = await getPersona(id)
    if (persona) {
      personaNames.set(id, persona.name)
      if (persona.twitterPicture) personaAvatars.set(id, persona.twitterPicture)
    }
  }

  const mode = params.mode === 'graph' ? 'graph' as const : 'dialogue' as const

  return (
    <DialogueClient
      topic={topic}
      personaIds={personaIds}
      personaNames={personaNames}
      personaAvatars={personaAvatars}
      mode={mode}
    />
  )
}
