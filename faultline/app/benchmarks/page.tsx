import Link from 'next/link'
import fs from 'fs/promises'
import path from 'path'
import type { TaskResultV2 } from '@/lib/benchmark/types'

export const dynamic = 'force-dynamic'

async function loadV2Results(): Promise<TaskResultV2[]> {
  const dir = path.join(process.cwd(), 'data/benchmarks/cig-results')
  try {
    const files = await fs.readdir(dir)
    const v2Files = files.filter(f => f.endsWith('-v2.json'))

    const results: TaskResultV2[] = []
    for (const file of v2Files) {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      results.push(JSON.parse(raw))
    }

    return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  semiconductor: 'bg-card-border text-muted',
  crypto: 'bg-card-border text-muted',
  ai: 'bg-card-border text-muted',
  'climate-energy': 'bg-card-border text-muted',
  'ai-economics': 'bg-card-border text-muted',
}

export default async function BenchmarksPage() {
  const results = await loadV2Results()

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            CIG Benchmark
          </h1>
          <p className="text-muted mt-2 text-sm">
            Crux Identification & Grounding — side-by-side comparison for human judgment
          </p>
        </div>

        <div className="h-px bg-card-border" />

        {results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted text-lg">No benchmark results yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((result) => {
              const conditions = Object.keys(result.conditions) as Array<keyof typeof result.conditions>

              return (
                <Link
                  key={result.taskId}
                  href={`/benchmarks/${result.taskId}`}
                  className="block rounded-xl border border-card-border bg-card-bg p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-semibold text-base">{result.topic}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${CATEGORY_COLORS[result.category] ?? 'bg-card-border text-muted'}`}>
                        {result.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {conditions.map((cond) => {
                        const r = result.conditions[cond]
                        if (!r) return null
                        const unique = result.overlap.uniqueTo[cond] ?? 0
                        return (
                          <div key={cond} className="flex items-center gap-1.5 text-xs text-muted">
                            <span className="font-medium text-foreground">{cond}</span>
                            <span>{r.assumptions.length} assumptions</span>
                            {unique > 0 && (
                              <span className="text-accent font-medium">{unique} unique</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="text-xs text-muted">
                      {new Date(result.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
