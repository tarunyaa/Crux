'use client'

import { useState } from 'react'
import type { Condition } from '@/lib/benchmark/cig-conditions'

const BLIND_LABELS: Record<string, string> = {
  single: 'Condition A',
  cot: 'Condition B',
  dialogue: 'Condition C',
  'belief-graph': 'Condition D',
}

interface ComparisonTableProps {
  conditions: Condition[]
  conditionAssumptions: Record<string, string[]>
  uniqueAssumptions: Record<string, string[]>
}

export default function ComparisonTable({
  conditions,
  conditionAssumptions,
  uniqueAssumptions,
}: ComparisonTableProps) {
  const [activeTab, setActiveTab] = useState<Condition | 'all'>('all')
  const [blinded, setBlinded] = useState(false)

  const maxRows = Math.max(...conditions.map(c => conditionAssumptions[c]?.length ?? 0))

  const label = (c: string): string => blinded ? (BLIND_LABELS[c] ?? c) : c

  const isUnique = (cond: string, assumption: string): boolean => {
    return uniqueAssumptions[cond]?.includes(assumption) ?? false
  }

  return (
    <div>
      {/* Blind toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setBlinded(!blinded)}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            blinded
              ? 'bg-accent text-white'
              : 'bg-surface text-muted hover:text-foreground'
          }`}
        >
          {blinded ? 'Reveal Labels' : 'Blind Mode'}
        </button>
        {blinded && (
          <span className="text-xs text-muted">Condition names hidden for unbiased comparison</span>
        )}
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-1 mb-3 md:hidden overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            activeTab === 'all'
              ? 'bg-accent text-white'
              : 'bg-surface text-muted hover:text-foreground'
          }`}
        >
          All
        </button>
        {conditions.map(c => (
          <button
            key={c}
            onClick={() => setActiveTab(c)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              activeTab === c
                ? 'bg-accent text-white'
                : 'bg-surface text-muted hover:text-foreground'
            }`}
          >
            {label(c)}
          </button>
        ))}
      </div>

      {/* Mobile: single column for selected tab */}
      <div className="md:hidden">
        {activeTab === 'all' ? (
          <div className="space-y-4">
            {conditions.map(c => (
              <div key={c}>
                <h4 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">{label(c)}</h4>
                <ol className="space-y-1.5">
                  {(conditionAssumptions[c] ?? []).map((a, i) => (
                    <li
                      key={i}
                      className={`text-sm pl-3 border-l-2 ${
                        isUnique(c, a) ? 'border-accent text-accent' : 'border-card-border text-foreground'
                      }`}
                    >
                      {a}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <ol className="space-y-1.5">
            {(conditionAssumptions[activeTab] ?? []).map((a, i) => (
              <li
                key={i}
                className={`text-sm pl-3 border-l-2 ${
                  isUnique(activeTab, a) ? 'border-accent text-accent' : 'border-card-border text-foreground'
                }`}
              >
                {a}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-card-border">
              <th className="text-left py-2 pr-2 text-muted font-medium w-8">#</th>
              {conditions.map(c => (
                <th key={c} className="text-left py-2 px-3 font-medium">{label(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, i) => (
              <tr key={i} className="border-b border-card-border/30">
                <td className="py-2 pr-2 text-muted text-xs">{i + 1}</td>
                {conditions.map(c => {
                  const assumption = conditionAssumptions[c]?.[i]
                  if (!assumption) return <td key={c} className="py-2 px-3 text-muted">&mdash;</td>
                  const unique = isUnique(c, assumption)
                  return (
                    <td
                      key={c}
                      className={`py-2 px-3 ${unique ? 'text-accent font-medium' : ''}`}
                    >
                      {assumption}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
