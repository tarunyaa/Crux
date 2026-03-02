'use client'

// ─── Client Component Wrapper ────────────────────────────────

import { BeliefGraphView } from '@/components/belief-graph/BeliefGraphView'

interface BeliefGraphClientProps {
  topic: string
  personaIds: [string, string]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  maxRounds?: number
}

export function BeliefGraphClient({ topic, personaIds, personaNames, personaAvatars, maxRounds }: BeliefGraphClientProps) {
  return (
    <BeliefGraphView
      topic={topic}
      personaIds={personaIds}
      personaNames={personaNames}
      personaAvatars={personaAvatars}
      maxRounds={maxRounds}
    />
  )
}
