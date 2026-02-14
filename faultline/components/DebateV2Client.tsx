'use client'

import { useState, useRef, useEffect } from 'react'
import { useDebateV2Stream } from '@/lib/hooks/useDebateV2Stream'
import type { DialogueTurn, DebatePhase, Concession, DebateEngineOutput } from '@/lib/types/debate-engine'
import HexAvatar from '@/components/HexAvatar'

interface PersonaMeta {
  id: string
  name: string
  picture: string
}

interface DebateV2ClientProps {
  availablePersonas: PersonaMeta[]
  defaultPersonaIds: string[]
}

const PHASE_LABELS: Record<DebatePhase, string> = {
  1: 'Opening Statements',
  2: 'Free Exchange',
  3: 'Crux Seeking',
  4: 'Resolution'
}

const MOVE_COLORS: Record<string, string> = {
  CLAIM: 'text-blue-400',
  CHALLENGE: 'text-red-400',
  CLARIFY: 'text-purple-400',
  CONCEDE: 'text-green-400',
  REFRAME: 'text-yellow-400',
  PROPOSE_CRUX: 'text-orange-400',
}

export default function DebateV2Client({ availablePersonas, defaultPersonaIds }: DebateV2ClientProps) {
  const [topic, setTopic] = useState('Bitcoin is a good store of value')
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(defaultPersonaIds)
  const [maxTurns, setMaxTurns] = useState(30)
  const [state, { start, abort }] = useDebateV2Stream()
  const chatRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const personaMap = new Map(availablePersonas.map(p => [p.id, p]))

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [state.transcript.length, autoScroll])

  const handleStart = () => {
    if (selectedPersonas.length < 2) {
      alert('Select at least 2 personas')
      return
    }
    start({ topic, personaIds: selectedPersonas, maxTurns })
  }

  const handleScroll = () => {
    if (!chatRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    setAutoScroll(atBottom)
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-card-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold mb-4">Debate Engine v2</h1>

          {!state.running && !state.complete && (
            <div className="space-y-4">
              {/* Topic Input */}
              <div>
                <label className="block text-sm text-muted mb-2">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-card-border rounded-lg focus:outline-none focus:border-primary"
                  placeholder="Enter debate topic..."
                />
              </div>

              {/* Persona Selection */}
              <div>
                <label className="block text-sm text-muted mb-2">Select Personas (2 required)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {availablePersonas.map(persona => (
                    <button
                      key={persona.id}
                      onClick={() => {
                        setSelectedPersonas(prev =>
                          prev.includes(persona.id)
                            ? prev.filter(id => id !== persona.id)
                            : prev.length < 2
                              ? [...prev, persona.id]
                              : prev
                        )
                      }}
                      className={`p-3 rounded-lg border transition-all ${
                        selectedPersonas.includes(persona.id)
                          ? 'border-primary bg-primary/10'
                          : 'border-card-border hover:border-card-border-hover'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <HexAvatar src={persona.picture} alt={persona.name} size={40} />
                        <span className="text-xs text-center line-clamp-2">{persona.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Turns */}
              <div className="flex items-center gap-4">
                <label className="text-sm text-muted">Max Turns</label>
                <input
                  type="number"
                  value={maxTurns}
                  onChange={e => setMaxTurns(parseInt(e.target.value))}
                  min={6}
                  max={100}
                  className="w-24 px-3 py-1 bg-background border border-card-border rounded focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleStart}
                  disabled={selectedPersonas.length < 2}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Debate
                </button>
              </div>
            </div>
          )}

          {state.running && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Topic: {state.topic}</p>
                <p className="text-xs text-muted mt-1">
                  Phase {state.currentPhase}: {state.currentPhase ? PHASE_LABELS[state.currentPhase] : ''}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted">
                  Turn {state.transcript.length} / {maxTurns}
                </div>
                <button
                  onClick={abort}
                  className="px-4 py-2 bg-red-900/40 text-red-400 rounded-lg hover:bg-red-900/60"
                >
                  Abort
                </button>
              </div>
            </div>
          )}

          {state.complete && state.output && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Debate Complete</p>
                <p className="text-xs text-muted mt-1">
                  {state.output.regime} • {state.transcript.length} turns • {(state.output.duration / 1000).toFixed(1)}s
                </p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30"
              >
                New Debate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full p-4">
            {/* Chat Area - Takes 2 columns on large screens */}
            <div className="lg:col-span-2 flex flex-col h-full">
              <div
                ref={chatRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto space-y-4 pr-2"
              >
                {state.transcript.length === 0 && !state.running && (
                  <div className="h-full flex items-center justify-center text-muted">
                    Configure and start a debate to begin
                  </div>
                )}

                {state.transcript.map((turn, idx) => {
                  const persona = personaMap.get(turn.personaId)
                  const isPhaseStart = idx === 0 || state.transcript[idx - 1].phase !== turn.phase

                  return (
                    <div key={turn.turnIndex}>
                      {/* Phase Marker */}
                      {isPhaseStart && (
                        <div className="flex items-center gap-3 my-6">
                          <div className="h-px flex-1 bg-card-border" />
                          <span className="text-sm font-medium text-primary px-3 py-1 bg-primary/10 rounded-full">
                            Phase {turn.phase}: {PHASE_LABELS[turn.phase]}
                          </span>
                          <div className="h-px flex-1 bg-card-border" />
                        </div>
                      )}

                      {/* Steering Hint */}
                      {turn.steeringHint && (
                        <div className="mb-3 px-4 py-2 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
                          <p className="text-xs text-yellow-400/80">
                            <span className="font-semibold">Moderator:</span> {turn.steeringHint}
                          </p>
                        </div>
                      )}

                      {/* Chat Message */}
                      <div className="flex gap-3">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          <HexAvatar src={persona?.picture ?? ''} alt={persona?.name ?? turn.personaId} size={40} />
                        </div>

                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-semibold text-sm">{persona?.name ?? turn.personaId}</span>
                            <span className={`text-xs font-mono ${MOVE_COLORS[turn.move] ?? 'text-muted'}`}>
                              {turn.move}
                            </span>
                            <span className="text-xs text-muted">
                              Turn {turn.turnIndex + 1}
                            </span>
                          </div>
                          <div className="bg-card border border-card-border rounded-lg px-4 py-3">
                            <p className="text-sm leading-relaxed">{turn.dialogue}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {state.running && (
                  <div className="flex items-center gap-2 text-muted text-sm py-4">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span>Thinking...</span>
                  </div>
                )}
              </div>

              {!autoScroll && (
                <button
                  onClick={() => {
                    setAutoScroll(true)
                    if (chatRef.current) {
                      chatRef.current.scrollTop = chatRef.current.scrollHeight
                    }
                  }}
                  className="mt-2 px-4 py-2 bg-primary/20 text-primary text-sm rounded-lg hover:bg-primary/30"
                >
                  ↓ Scroll to latest
                </button>
              )}
            </div>

            {/* Sidebar - Insights */}
            <div className="hidden lg:block space-y-4">
              {/* Graph Stats */}
              {state.graph && (
                <div className="bg-card border border-card-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Argument Graph</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Arguments</span>
                      <span>{state.graph.arguments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Attacks</span>
                      <span>{state.graph.attacks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-400">IN</span>
                      <span className="text-green-400">{state.graphStats.inCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-400">OUT</span>
                      <span className="text-red-400">{state.graphStats.outCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-400">UNDEC</span>
                      <span className="text-yellow-400">{state.graphStats.undecCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Preferred Extensions</span>
                      <span>{state.graphStats.preferredCount}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Concessions */}
              {state.concessions.length > 0 && (
                <div className="bg-card border border-card-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Concessions</h3>
                  <div className="space-y-3">
                    {state.concessions.slice(-5).reverse().map((c, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="font-semibold text-green-400">{personaMap.get(c.personaId)?.name}</div>
                        <div className="text-muted mt-1">{c.effect}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crux */}
              {state.cruxProposals.length > 0 && (
                <div className="bg-card border border-card-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Proposed Crux</h3>
                  <div className="space-y-3">
                    {state.cruxProposals.slice(-2).map((crux, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="font-semibold text-orange-400">{personaMap.get(crux.personaId)?.name}</div>
                        <div className="text-muted mt-1 italic">"{crux.statement.slice(0, 150)}..."</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Results */}
              {state.complete && state.output && (
                <div className="bg-card border border-card-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Results</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-muted mb-1">Regime</div>
                      <div className="font-mono text-xs">{state.output.regime}</div>
                      <div className="text-muted text-xs mt-1">{state.output.regimeDescription}</div>
                    </div>

                    {state.output.crux && (
                      <div>
                        <div className="text-muted mb-1">Crux</div>
                        <div className="text-xs italic">"{state.output.crux.statement.slice(0, 200)}..."</div>
                        <div className="text-muted text-xs mt-1">
                          Proposed by: {state.output.crux.proposedBy.map(id => personaMap.get(id)?.name).join(', ')}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-muted mb-1">Common Ground</div>
                      <div className="text-xs">{state.output.commonGround.length} shared arguments</div>
                    </div>

                    <div>
                      <div className="text-muted mb-1">Performance</div>
                      <div className="text-xs space-y-1">
                        <div>Duration: {(state.output.duration / 1000).toFixed(1)}s</div>
                        <div>Tokens: {state.output.tokenUsage.inputTokens.toLocaleString()} in / {state.output.tokenUsage.outputTokens.toLocaleString()} out</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
