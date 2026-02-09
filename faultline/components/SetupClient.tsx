'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PersonaCard from '@/components/PersonaCard'
import type { DebateMode } from '@/lib/types'

interface PersonaInfo {
  id: string
  name: string
  handle: string
  picture: string
  hasContract: boolean
}

interface DeckInfo {
  id: string
  name: string
  personaIds: string[]
}

interface SetupClientProps {
  decks: DeckInfo[]
  personas: PersonaInfo[]
}

export default function SetupClient({ decks, personas }: SetupClientProps) {
  const router = useRouter()
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id ?? '')
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set())
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<DebateMode>('blitz')
  const [saveGame, setSaveGame] = useState(false)

  const deck = decks.find(d => d.id === selectedDeckId)
  const deckPersonaIds = deck?.personaIds ?? []

  const canDeal = selectedPersonas.size >= 2 && topic.trim().length > 0

  function togglePersona(id: string) {
    setSelectedPersonas(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleDeal() {
    if (!canDeal || !deck) return
    const personaParam = Array.from(selectedPersonas)
      .map(id => encodeURIComponent(id))
      .join(',')
    const topicParam = encodeURIComponent(topic.trim())
    const deckParam = encodeURIComponent(deck.id)
    router.push(`/match/new?deck=${deckParam}&personas=${personaParam}&topic=${topicParam}&mode=${mode}${saveGame ? '&save=1' : ''}`)
  }

  return (
    <div className="space-y-8">
      {/* Deck selector (if multiple decks) */}
      {decks.length > 1 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Deck</label>
          <select
            value={selectedDeckId}
            onChange={(e) => {
              setSelectedDeckId(e.target.value)
              setSelectedPersonas(new Set())
            }}
            className="w-full rounded-lg border border-card-border bg-card-bg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
          >
            {decks.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Deck title for single deck */}
      {decks.length === 1 && deck && (
        <div>
          <h2 className="text-lg font-semibold">{deck.name}</h2>
          <p className="text-muted text-sm">Select 2 or more personas for the debate.</p>
        </div>
      )}

      {/* Persona grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {deckPersonaIds.map((pid) => {
          const persona = personas.find(p => p.id === pid)
          if (!persona) {
            return (
              <PersonaCard
                key={pid}
                id={pid}
                name={pid}
                handle=""
                picture=""
                locked
                selectable
              />
            )
          }
          return (
            <PersonaCard
              key={pid}
              id={persona.id}
              name={persona.name}
              handle={persona.handle}
              picture={persona.picture}
              selected={selectedPersonas.has(persona.id)}
              disabled={!persona.hasContract}
              selectable
              onToggle={persona.hasContract ? togglePersona : undefined}
            />
          )
        })}
      </div>

      {/* Selected count */}
      <p className="text-sm text-muted">
        <span className="text-accent font-semibold">{selectedPersonas.size}</span>
        {' '}persona{selectedPersonas.size !== 1 ? 's' : ''} selected
        {selectedPersonas.size < 2 && ' (need at least 2)'}
      </p>

      {/* Topic input */}
      <div className="space-y-2">
        <label htmlFor="topic" className="text-xs font-semibold uppercase tracking-wider text-muted">
          Topic
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Is the AI bubble about to pop?"
          className="w-full rounded-lg border border-card-border bg-card-bg px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canDeal) handleDeal()
          }}
        />
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('blitz')}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              mode === 'blitz'
                ? 'border-accent bg-accent-dim/20 text-foreground shadow-[0_0_8px_rgba(220,38,38,0.15)]'
                : 'border-card-border bg-card-bg text-muted hover:text-foreground hover:border-muted'
            }`}
          >
            <span className="block text-sm font-semibold">Blitz</span>
            <span className="block text-xs mt-1 opacity-70">
              Fast parallel debate — all agents respond each round
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode('classical')}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              mode === 'classical'
                ? 'border-accent bg-accent-dim/20 text-foreground shadow-[0_0_8px_rgba(220,38,38,0.15)]'
                : 'border-card-border bg-card-bg text-muted hover:text-foreground hover:border-muted'
            }`}
          >
            <span className="block text-sm font-semibold">Classical</span>
            <span className="block text-xs mt-1 opacity-70">
              Sequential turns — agents choose when to speak based on urgency
            </span>
          </button>
        </div>
      </div>

      {/* Save toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={saveGame}
          onClick={() => setSaveGame(prev => !prev)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            saveGame ? 'bg-accent' : 'bg-card-border'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              saveGame ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm text-foreground">Save to archive</span>
      </label>

      {/* Deal button */}
      <button
        disabled={!canDeal}
        onClick={handleDeal}
        className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(220,38,38,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
      >
        Deal
      </button>
    </div>
  )
}
