import { getPersonas } from '@/lib/personas/loader'
import DebateV2Client from '@/components/DebateV2Client'

export default async function DebateV2Page() {
  const personas = await getPersonas()

  // Default personas for demo
  const defaultPersonaIds = personas.slice(0, 2).map(p => p.id)

  return (
    <div className="min-h-screen bg-background">
      <DebateV2Client
        availablePersonas={personas.map(p => ({ id: p.id, name: p.name, picture: p.twitterPicture ?? '' }))}
        defaultPersonaIds={defaultPersonaIds}
      />
    </div>
  )
}
