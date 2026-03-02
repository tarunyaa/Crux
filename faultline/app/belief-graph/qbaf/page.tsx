// ─── Stage 2 QBAF Viewer ──────────────────────────────────────
// Loads experiment QBAFs from data/experiments/ and renders side-by-side trees.

import * as fs from 'fs/promises'
import * as path from 'path'
import Link from 'next/link'
import { QBAFTreeView } from '@/components/belief-graph/QBAFTreeView'
import type { PersonaQBAF } from '@/lib/belief-graph/types'
import { getPersona } from '@/lib/personas/loader'

interface Props {
  searchParams: Promise<{ topic?: string; personas?: string }>
}

async function loadExperimentQBAF(slug: string, personaId: string): Promise<PersonaQBAF | null> {
  const filePath = path.join(process.cwd(), 'data', 'experiments', slug, `qbaf-${personaId}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as PersonaQBAF
  } catch {
    return null
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

export default async function QBAFViewerPage({ searchParams }: Props) {
  const params = await searchParams
  const topic = params.topic
    ? decodeURIComponent(params.topic)
    : 'Will AI cause net job losses in the next decade?'

  const personaIds = params.personas
    ? params.personas.split(',').map(s => decodeURIComponent(s.trim()))
    : ['Citrini', 'Citadel']

  const slug = slugify(topic)

  // Load QBAFs and persona data
  const qbafs: Array<{ qbaf: PersonaQBAF; name: string; avatar?: string }> = []
  for (const id of personaIds) {
    const qbaf = await loadExperimentQBAF(slug, id)
    const persona = await getPersona(id)
    if (qbaf) {
      qbafs.push({
        qbaf,
        name: persona?.name ?? id,
        avatar: persona?.twitterPicture || undefined,
      })
    }
  }

  if (qbafs.length === 0) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link href="/belief-graph" className="text-muted hover:text-foreground text-sm transition-colors">
            &larr; Back
          </Link>
          <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center">
            <p className="text-muted">No QBAFs found for topic: &ldquo;{topic}&rdquo;</p>
            <p className="text-muted text-sm mt-2">
              Run: <code className="text-foreground">npx tsx scripts/extract-qbafs-from-beliefs.ts --topic &quot;{topic}&quot;</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
        <Link href="/belief-graph" className="text-muted hover:text-foreground text-sm transition-colors">
          &larr; Back
        </Link>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">Stage 2: Topic-Scoped QBAFs</h1>
          <p className="text-sm text-muted">&ldquo;{topic}&rdquo;</p>
        </div>

        <div className={`grid gap-6 ${qbafs.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {qbafs.map(({ qbaf, name, avatar }) => (
            <div key={qbaf.personaId} className="rounded-xl border border-card-border bg-card-bg p-6 card-shadow space-y-4">
              <div className="flex items-center gap-3">
                {avatar && (
                  <img src={avatar} alt={name} className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <h2 className="font-semibold">{name}</h2>
                  <p className="text-xs text-muted">
                    {qbaf.nodes.length} nodes · {qbaf.edges.length} edges ·
                    root σ = {qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength.toFixed(3)}
                  </p>
                </div>
              </div>
              <QBAFTreeView qbaf={qbaf} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
