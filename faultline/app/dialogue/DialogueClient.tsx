'use client'

// ─── Client Component Wrapper ────────────────────────────────

import { DialogueView } from '@/components/dialogue/DialogueView'
import { BeliefGraphView } from '@/components/belief-graph/BeliefGraphView'

interface DialogueClientProps {
  topic: string
  personaIds: string[]
  personaNames: Map<string, string>
  personaAvatars: Map<string, string>
  mode: 'dialogue' | 'graph'
}

export function DialogueClient({ topic, personaIds, personaNames, personaAvatars, mode }: DialogueClientProps) {
  if (mode === 'graph') {
    return <BeliefGraphView topic={topic} personaIds={personaIds} personaNames={personaNames} personaAvatars={personaAvatars} />
  }
  return <DialogueView topic={topic} personaIds={personaIds} personaNames={personaNames} personaAvatars={personaAvatars} />
}
