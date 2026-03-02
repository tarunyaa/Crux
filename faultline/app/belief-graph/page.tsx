// ─── Belief Graph Experiment Page ─────────────────────────────

import { BeliefGraphClient } from './BeliefGraphClient'
import { BeliefGraphSetup } from '@/components/belief-graph/BeliefGraphSetup'
import { getPersona, getPersonas, hasBeliefGraph } from '@/lib/personas/loader'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ personas?: string; topic?: string; rounds?: string }>
}

export default async function BeliefGraphPage({ searchParams }: Props) {
  const params = await searchParams

  // If no personas param, show setup page
  if (!params.personas) {
    const allPersonas = await getPersonas()
    const personaOptions = await Promise.all(
      allPersonas.map(async p => ({
        id: p.id,
        name: p.name,
        picture: p.twitterPicture || null,
        hasBeliefGraph: await hasBeliefGraph(p.id),
      }))
    )
    return <BeliefGraphSetup personas={personaOptions} />
  }

  // Experiment mode
  const topic = params.topic
    ? decodeURIComponent(params.topic)
    : 'Will AI cause net job losses in the next decade?'

  const personaIds = params.personas.split(',').map(id => decodeURIComponent(id)) as [string, string]
  const maxRounds = params.rounds ? parseInt(params.rounds, 10) : 3

  if (personaIds.length !== 2) {
    redirect('/belief-graph')
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

  return (
    <BeliefGraphClient
      topic={topic}
      personaIds={personaIds}
      personaNames={personaNames}
      personaAvatars={personaAvatars}
      maxRounds={maxRounds}
    />
  )
}
