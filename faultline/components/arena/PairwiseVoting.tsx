'use client'

import { useState } from 'react'
import type { ArenaOutput, ArenaMethod } from '@/lib/arena/types'
import { CruxCardDisplay } from './CruxCardDisplay'

function getPairs(methods: ArenaMethod[]): Array<[ArenaMethod, ArenaMethod]> {
  const pairs: Array<[ArenaMethod, ArenaMethod]> = []
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      pairs.push([methods[i], methods[j]])
    }
  }
  return pairs
}

interface Props {
  debateId: string
  outputs: ArenaOutput[]
  sessionId: string
  onComplete: () => void
}

export function PairwiseVoting({ debateId, outputs, sessionId, onComplete }: Props) {
  const methods = outputs.map(o => o.method)
  const pairs = getPairs(methods)

  // Randomize order: randomly assign which output is "A" and "B"
  const [assignments] = useState(() =>
    pairs.map(([m1, m2]) =>
      Math.random() < 0.5 ? { a: m1, b: m2 } : { a: m2, b: m1 },
    ),
  )

  const [current, setCurrent] = useState(0)
  const [votes, setVotes] = useState<Record<number, 'a' | 'b' | 'tie'>>({})
  const [saving, setSaving] = useState(false)

  const outputByMethod = Object.fromEntries(outputs.map(o => [o.method, o]))

  const castVote = async (winner: 'a' | 'b' | 'tie') => {
    setSaving(true)
    const pair = assignments[current]
    const newVotes = { ...votes, [current]: winner }
    setVotes(newVotes)

    try {
      await fetch('/api/arena/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debateId,
          methodA: pair.a,
          methodB: pair.b,
          winner,
          sessionId,
        }),
      })
    } catch {
      // non-blocking — vote still tracked locally
    }

    setSaving(false)

    if (current + 1 >= pairs.length) {
      onComplete()
    } else {
      setCurrent(c => c + 1)
    }
  }

  if (pairs.length === 0) {
    return (
      <div className="text-center text-muted text-sm py-8">
        Need at least 2 methods to compare.
      </div>
    )
  }

  const pair = assignments[current]
  const outputA = outputByMethod[pair.a]
  const outputB = outputByMethod[pair.b]

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Comparison {current + 1} of {pairs.length}
        </span>
        <div className="flex gap-1">
          {pairs.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full ${
                i < current
                  ? 'bg-accent'
                  : i === current
                  ? 'bg-foreground'
                  : 'bg-card-border'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="text-sm text-muted">
        Which output gave you more insight into the key disagreements? Method names are hidden.
      </p>

      {/* Side-by-side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          { label: 'Method A', output: outputA },
          { label: 'Method B', output: outputB },
        ].map(({ label, output }) => (
          <div key={label} className="space-y-3">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider border-b border-card-border pb-2">
              {label}
            </div>
            {output ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {output.cruxCards.length === 0 ? (
                  <p className="text-xs text-muted italic">No crux cards produced.</p>
                ) : (
                  output.cruxCards.map((card, i) => (
                    <CruxCardDisplay key={i} card={card} index={i} />
                  ))
                )}
              </div>
            ) : (
              <p className="text-xs text-muted italic">No output for this method.</p>
            )}
          </div>
        ))}
      </div>

      {/* Vote buttons */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => castVote('a')}
          disabled={saving}
          className="rounded border border-card-border bg-surface px-6 py-2 text-sm font-medium text-foreground hover:border-foreground transition-colors disabled:opacity-50"
        >
          Method A is better
        </button>
        <button
          onClick={() => castVote('tie')}
          disabled={saving}
          className="rounded border border-card-border bg-surface px-5 py-2 text-sm text-muted hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
        >
          Tie
        </button>
        <button
          onClick={() => castVote('b')}
          disabled={saving}
          className="rounded border border-card-border bg-surface px-6 py-2 text-sm font-medium text-foreground hover:border-foreground transition-colors disabled:opacity-50"
        >
          Method B is better
        </button>
      </div>
    </div>
  )
}
