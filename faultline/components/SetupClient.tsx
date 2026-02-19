'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PersonaCard from '@/components/PersonaCard'

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
    if (!canDeal) return
    const personaParam = Array.from(selectedPersonas)
      .map(id => encodeURIComponent(id))
      .join(',')
    const topicParam = encodeURIComponent(topic.trim())
    router.push(`/dialogue?personas=${personaParam}&topic=${topicParam}`)
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
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
