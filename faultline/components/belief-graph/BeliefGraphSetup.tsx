'use client'

// ─── Belief Graph Setup: Persona + Topic Selection ──────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface PersonaOption {
  id: string
  name: string
  picture: string | null
  hasBeliefGraph: boolean
}

interface BeliefGraphSetupProps {
  personas: PersonaOption[]
}

export function BeliefGraphSetup({ personas }: BeliefGraphSetupProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [topic, setTopic] = useState('Will AI cause net job losses in the next decade?')

  function handlePersonaClick(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  function handleRun() {
    if (selected.length !== 2 || !topic.trim()) return
    const params = new URLSearchParams({
      personas: selected.join(','),
      topic,
    })
    router.push(`/belief-graph?${params.toString()}`)
  }

  const anyWithoutGraph = selected.some(
    id => !personas.find(p => p.id === id)?.hasBeliefGraph
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-card-border px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs font-mono text-accent uppercase tracking-wider">
            Belief Graph Experiment
          </span>
          <h1 className="text-lg text-foreground font-medium mt-1">Setup</h1>
          <p className="text-xs text-muted mt-1">
            Select 2 personas and a topic to run a belief graph experiment.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Persona grid */}
        <div>
          <h2 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
            Select 2 Personas
            {selected.length > 0 && (
              <span className="text-accent ml-2">{selected.length}/2</span>
            )}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {personas.map(p => {
              const isSelected = selected.includes(p.id)
              const order = isSelected ? selected.indexOf(p.id) + 1 : null
              return (
                <button
                  key={p.id}
                  onClick={() => handlePersonaClick(p.id)}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-card-border bg-card-bg hover:border-muted'
                  }`}
                >
                  {/* Selection order badge */}
                  {order && (
                    <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-mono flex items-center justify-center">
                      {order}
                    </span>
                  )}

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-surface flex-shrink-0">
                    {p.picture ? (
                      <Image
                        src={p.picture}
                        alt={p.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-xs font-mono">
                        {p.name[0]}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <span className="text-[11px] text-foreground text-center leading-tight truncate w-full">
                    {p.name}
                  </span>

                  {/* Belief graph badge */}
                  {p.hasBeliefGraph && (
                    <span className="text-[9px] font-mono text-accent">
                      graph ready
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Warning for missing belief graphs */}
        {anyWithoutGraph && selected.length > 0 && (
          <div className="bg-card-bg border border-card-border rounded-lg p-3 text-xs text-muted">
            Some selected personas don&apos;t have pre-extracted belief graphs. The first run will be slower as beliefs are extracted via LLM.
          </div>
        )}

        {/* Topic input */}
        <div>
          <label className="text-xs font-mono text-muted uppercase tracking-wider block mb-2">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full bg-card-bg border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
            placeholder="Enter a debatable topic..."
          />
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={selected.length !== 2 || !topic.trim()}
          className="w-full py-3 rounded-lg font-mono text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-accent text-white hover:bg-accent/90"
        >
          Run Experiment
        </button>
      </main>
    </div>
  )
}
