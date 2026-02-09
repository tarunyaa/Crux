'use client'

import { useState } from 'react'

type SourceType = 'twitter' | 'substack' | 'linkedin' | 'reddit' | 'notes'

interface PersonaEntry {
  id: string
  name: string
  sourceType: SourceType
  sourceValue: string
}

const SOURCE_CONFIG: Record<SourceType, { label: string; placeholder: string; icon: string }> = {
  twitter: { label: 'X / Twitter', placeholder: '@handle', icon: '𝕏' },
  substack: { label: 'Substack', placeholder: 'https://name.substack.com', icon: '▲' },
  linkedin: { label: 'LinkedIn', placeholder: 'linkedin.com/in/username', icon: 'in' },
  reddit: { label: 'Reddit', placeholder: 'u/username', icon: 'r/' },
  notes: { label: 'Personal Notes', placeholder: 'Paste or type notes...', icon: '📋' },
}

let nextId = 0
function createEntry(): PersonaEntry {
  return { id: `entry-${nextId++}`, name: '', sourceType: 'twitter', sourceValue: '' }
}

export default function CreateDeckClient() {
  const [deckName, setDeckName] = useState('')
  const [entries, setEntries] = useState<PersonaEntry[]>([createEntry(), createEntry()])

  function updateEntry(id: string, patch: Partial<PersonaEntry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function addEntry() {
    setEntries(prev => [...prev, createEntry()])
  }

  function removeEntry(id: string) {
    if (entries.length <= 2) return
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-8">
      {/* Coming soon banner */}
      <div className="rounded-xl border border-accent/30 bg-accent-dim/10 px-4 py-3 flex items-center gap-3">
        <span className="text-accent text-lg">&#9888;</span>
        <div>
          <p className="text-sm font-semibold text-foreground">Coming Soon</p>
          <p className="text-xs text-muted">
            Deck creation is not yet functional. This is a preview of the upcoming feature.
          </p>
        </div>
      </div>

      {/* Deck name */}
      <div className="space-y-2">
        <label htmlFor="deck-name" className="text-xs font-semibold uppercase tracking-wider text-muted">
          Deck Name
        </label>
        <input
          id="deck-name"
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="e.g. AI Infrastructure Bulls vs Bears"
          className="w-full rounded-lg border border-card-border bg-card-bg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
        />
      </div>

      {/* Persona entries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">
            Personas
          </label>
          <span className="text-xs text-muted">{entries.length} added</span>
        </div>

        {entries.map((entry, idx) => (
          <div
            key={entry.id}
            className="rounded-xl border border-card-border bg-surface p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">
                Persona {idx + 1}
              </span>
              {entries.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="text-xs text-muted hover:text-danger transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Name */}
            <input
              type="text"
              value={entry.name}
              onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
              placeholder="Display name (e.g. Andreessen Horowitz)"
              className="w-full rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
            />

            {/* Source type tabs */}
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(SOURCE_CONFIG) as SourceType[]).map((type) => {
                const cfg = SOURCE_CONFIG[type]
                const active = entry.sourceType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateEntry(entry.id, { sourceType: type, sourceValue: '' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-accent-dim/20 border border-accent text-foreground'
                        : 'border border-card-border bg-card-bg text-muted hover:text-foreground hover:border-muted'
                    }`}
                  >
                    <span className="opacity-70">{cfg.icon}</span>
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            {/* Source value input */}
            {entry.sourceType === 'notes' ? (
              <textarea
                value={entry.sourceValue}
                onChange={(e) => updateEntry(entry.id, { sourceValue: e.target.value })}
                placeholder={SOURCE_CONFIG[entry.sourceType].placeholder}
                rows={3}
                className="w-full rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors resize-none"
              />
            ) : (
              <input
                type="text"
                value={entry.sourceValue}
                onChange={(e) => updateEntry(entry.id, { sourceValue: e.target.value })}
                placeholder={SOURCE_CONFIG[entry.sourceType].placeholder}
                className="w-full rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
              />
            )}
          </div>
        ))}

        {/* Add persona button */}
        <button
          type="button"
          onClick={addEntry}
          className="w-full rounded-xl border border-dashed border-card-border py-3 text-sm text-muted hover:text-foreground hover:border-muted transition-colors"
        >
          + Add Persona
        </button>
      </div>

      {/* Build button (disabled) */}
      <button
        disabled
        className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white opacity-40 cursor-not-allowed"
      >
        Build Deck — Coming Soon
      </button>
    </div>
  )
}
