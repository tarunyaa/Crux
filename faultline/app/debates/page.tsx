import Link from 'next/link'
import { listDebates } from '@/lib/db/debates'
import { getPersonas } from '@/lib/personas/loader'
import HexAvatar from '@/components/HexAvatar'
import SuitIcon from '@/components/SuitIcon'
import type { DebateOutput } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DebatesPage() {
  const [allRows, personas] = await Promise.all([listDebates(50), getPersonas()])
  const personaMap = new Map(personas.map(p => [p.id, p]))

  // Keep only the most recent debate per topic (allRows is already sorted by created_at DESC)
  const seen = new Set<string>()
  const rows = allRows.filter(row => {
    if (seen.has(row.topic)) return false
    seen.add(row.topic)
    return true
  })

  const suitOrder = ['spade', 'heart', 'diamond', 'club'] as const

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Debate Archive
        </h1>

        {/* Suit divider */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {suitOrder.map((s) => (
              <SuitIcon key={s} suit={s} className="text-xs" />
            ))}
          </div>
          <div className="flex-1 h-px bg-card-border" />
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-muted text-lg">No debates yet</p>
            <Link
              href="/setup"
              className="inline-block rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)]"
            >
              Start a Debate &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const pIds = row.personaIds as string[]
              const output = row.output as DebateOutput | null
              const cruxCount = output?.cruxes?.length ?? 0
              const faultCount = output?.faultLines?.length ?? 0

              return (
                <Link
                  key={row.id}
                  href={`/debates/${row.id}`}
                  className="block rounded-xl border border-card-border bg-card-bg p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <h2 className="font-semibold text-base truncate">{row.topic}</h2>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
                          {row.mode}
                        </span>
                        {row.status === 'error' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-danger/20 text-danger">
                            Error
                          </span>
                        )}
                        {cruxCount > 0 && (
                          <span className="text-xs text-muted">
                            {cruxCount} crux{cruxCount !== 1 ? 'es' : ''}
                          </span>
                        )}
                        {faultCount > 0 && (
                          <span className="text-xs text-muted">
                            {faultCount} fault line{faultCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="text-xs text-muted">
                          {new Date(row.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex -space-x-2 shrink-0">
                      {pIds.slice(0, 5).map((pid) => {
                        const persona = personaMap.get(pid)
                        return (
                          <HexAvatar
                            key={pid}
                            src={persona?.twitterPicture || undefined}
                            alt={persona?.name ?? pid}
                            size={28}
                            fallbackInitial={(persona?.name ?? pid).charAt(0)}
                          />
                        )
                      })}
                      {pIds.length > 5 && (
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-card-border text-xs text-muted">
                          +{pIds.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
