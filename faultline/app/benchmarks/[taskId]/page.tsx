import fs from 'fs/promises'
import path from 'path'
import Link from 'next/link'
import type { TaskResultV2 } from '@/lib/benchmark/types'
import type { Condition } from '@/lib/benchmark/cig-conditions'
import ComparisonTable from '@/components/benchmark/ComparisonTable'

interface PageProps {
  params: Promise<{ taskId: string }>
}

async function loadResult(taskId: string): Promise<TaskResultV2 | null> {
  const filePath = path.join(process.cwd(), 'data/benchmarks/cig-results', `${taskId}-v2.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default async function BenchmarkDetailPage({ params }: PageProps) {
  const { taskId } = await params
  const result = await loadResult(taskId)

  if (!result) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href="/benchmarks" className="text-sm text-muted hover:text-foreground">&larr; Back</Link>
          <p className="text-muted">No v2 benchmark found for &ldquo;{taskId}&rdquo;. Run the benchmark first.</p>
        </div>
      </div>
    )
  }

  const conditions = Object.keys(result.conditions) as Condition[]

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <Link href="/benchmarks" className="text-sm text-muted hover:text-foreground">&larr; Back to benchmarks</Link>
          <h1 className="text-2xl font-bold tracking-tight mt-3">{result.topic}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-card-border text-muted uppercase tracking-wider">
              {result.category}
            </span>
            <span className="text-xs text-muted">
              {new Date(result.timestamp).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <div className="h-px bg-card-border" />

        {/* Metrics Summary */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Metrics Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-2 pr-4 text-muted font-medium">Metric</th>
                  {conditions.map(c => (
                    <th key={c} className="text-left py-2 px-4 font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">Assumptions</td>
                  {conditions.map(c => (
                    <td key={c} className="py-2 px-4">{result.conditions[c]?.assumptions.length ?? '-'}</td>
                  ))}
                </tr>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">Unique</td>
                  {conditions.map(c => {
                    const unique = result.overlap.uniqueTo[c] ?? 0
                    return (
                      <td key={c} className={`py-2 px-4 ${unique > 0 ? 'text-accent font-medium' : ''}`}>
                        {unique}
                      </td>
                    )
                  })}
                </tr>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">DFS Flipped</td>
                  {conditions.map(c => {
                    const r = result.conditions[c]
                    if (!r) return <td key={c} className="py-2 px-4">-</td>
                    const flipped = r.flipSensitivity.filter(f => f.flipped).length
                    return <td key={c} className="py-2 px-4">{flipped}/{r.flipSensitivity.length}</td>
                  })}
                </tr>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">Input Tokens</td>
                  {conditions.map(c => (
                    <td key={c} className="py-2 px-4">{result.conditions[c]?.tokenUsage.inputTokens.toLocaleString() ?? '-'}</td>
                  ))}
                </tr>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">Output Tokens</td>
                  {conditions.map(c => (
                    <td key={c} className="py-2 px-4">{result.conditions[c]?.tokenUsage.outputTokens.toLocaleString() ?? '-'}</td>
                  ))}
                </tr>
                <tr className="border-b border-card-border/50">
                  <td className="py-2 pr-4 text-muted">Tokens/Assumption</td>
                  {conditions.map(c => {
                    const tpa = result.conditions[c]?.structuralMetrics?.tokensPerAssumption
                    return <td key={c} className="py-2 px-4">{tpa != null ? tpa.toLocaleString() : '-'}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Side-by-side assumptions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Assumptions Comparison</h2>
          <ComparisonTable
            conditions={conditions}
            conditionAssumptions={Object.fromEntries(
              conditions.map(c => [c, result.conditions[c]?.assumptions ?? []])
            )}
            uniqueAssumptions={result.overlap.uniqueAssumptions}
          />
        </section>

        {/* Crux cards per condition */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Crux Hinge Questions</h2>
          <div className="space-y-6">
            {conditions.map(c => {
              const r = result.conditions[c]
              if (!r || r.cruxCards.length === 0) return null
              return (
                <div key={c}>
                  <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">{c}</h3>
                  <div className="space-y-3">
                    {r.cruxCards.map((card, i) => (
                      <div key={i} className="rounded-lg border border-card-border bg-card-bg p-4 space-y-2">
                        <p className="font-medium text-sm">{card.hingeQuestion}</p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-muted">{card.roleA.id}:</span>{' '}
                            <span>{card.roleA.position}</span>
                            {card.roleA.falsifier && (
                              <p className="text-muted mt-1 italic">Falsifier: {card.roleA.falsifier}</p>
                            )}
                          </div>
                          <div>
                            <span className="text-muted">{card.roleB.id}:</span>{' '}
                            <span>{card.roleB.position}</span>
                            {card.roleB.falsifier && (
                              <p className="text-muted mt-1 italic">Falsifier: {card.roleB.falsifier}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Overlap analysis */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Overlap Analysis</h2>
          <p className="text-sm text-muted mb-2">
            Shared across all conditions: <span className="text-foreground font-medium">{result.overlap.sharedAll}</span>
          </p>
          <p className="text-xs text-muted mb-4 italic">
            Overlap uses approximate token matching (60% threshold). Semantic duplicates may exist — review manually.
          </p>

          <div className="space-y-4">
            {conditions.map(c => {
              const unique = result.overlap.uniqueAssumptions[c]
              if (!unique || unique.length === 0) return null
              return (
                <div key={c}>
                  <h3 className="text-sm font-medium mb-1">
                    Unique to <span className="text-accent">{c}</span> ({unique.length})
                  </h3>
                  <ul className="space-y-1">
                    {unique.map((a, i) => (
                      <li key={i} className="text-sm text-muted pl-4 border-l-2 border-accent/30">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {Object.keys(result.overlap.pairwiseShared).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Pairwise Shared</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(result.overlap.pairwiseShared).map(([pair, count]) => (
                  <span key={pair} className="text-xs bg-surface px-2 py-1 rounded">
                    {pair}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
