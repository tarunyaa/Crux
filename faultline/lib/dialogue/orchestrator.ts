// ─── Dialogue Orchestrator ────────────────────────────────────

import type {
  DialogueConfig,
  DialogueState,
  DialogueMessage,
  DialogueEvent,
  PersonaId,
} from './types'
import type { PersonaContract, Persona } from '@/lib/types'
import { loadContract, getPersona } from '@/lib/personas/loader'
import { generateMicroTurn, generateOpeningMicroTurn } from './agent'
import { assignNextTurn } from './turn-manager'
import { detectDisagreements, CandidateRegistry } from './disagreement-detector'
import { runCruxRoom } from '@/lib/crux/orchestrator'

export async function* runDialogue(
  config: DialogueConfig,
): AsyncGenerator<DialogueEvent> {
  const { topic, personaIds } = config
  const maxMessages = config.maxMessages ?? 50
  const maxDurationMs = config.maxDurationMs ?? 5 * 60 * 1000

  const startTime = Date.now()

  const state: DialogueState = {
    topic,
    messages: [],
    activePersonas: personaIds,
    startTime,
  }

  yield { type: 'dialogue_start', topic, personas: personaIds }

  // Load persona contracts and data
  const contracts = new Map<PersonaId, PersonaContract>()
  const personas = new Map<PersonaId, Persona>()
  const personaNames = new Map<PersonaId, string>()

  for (const id of personaIds) {
    const contract = await loadContract(id)
    const persona = await getPersona(id)
    if (persona) {
      contracts.set(id, contract)
      personas.set(id, persona)
      personaNames.set(id, persona.name)
    }
  }

  // ─── Phase 1: Opening Messages ────────────────────────────

  for (const personaId of personaIds) {
    const contract = contracts.get(personaId)!
    const persona = personas.get(personaId)!
    const content = await generateOpeningMicroTurn(contract, persona, topic)

    if (content) {
      const message: DialogueMessage = {
        id: generateMessageId(personaId, state.messages.length),
        personaId,
        content,
        timestamp: Date.now(),
      }
      state.messages.push(message)
      state.lastSpeakerId = personaId
      yield { type: 'message_posted', message }
    }
  }

  // ─── Phase 2: Conversational Turns ────────────────────────

  const registry = new CandidateRegistry()
  // Track which persona pairs currently have an active crux room
  const activeRoomPairs = new Set<string>()

  let consecutiveSkips = 0
  const maxConsecutiveSkips = personaIds.length * 2

  while (state.messages.length < maxMessages) {
    if (Date.now() - startTime > maxDurationMs) break

    const turn = assignNextTurn(state.messages, personaIds, state.lastSpeakerId)
    const nextContract = contracts.get(turn.personaId)!
    const nextPersona = personas.get(turn.personaId)!

    const replyToMessage = turn.replyToMessageId
      ? state.messages.find(m => m.id === turn.replyToMessageId) ?? null
      : null

    const content = await generateMicroTurn(
      nextContract,
      nextPersona,
      replyToMessage,
      turn.intent,
      personaNames,
      state.messages.slice(-5, -1),
    )

    if (!content) {
      consecutiveSkips++
      if (consecutiveSkips >= maxConsecutiveSkips) break
      state.lastSpeakerId = turn.personaId
      continue
    }

    consecutiveSkips = 0

    const message: DialogueMessage = {
      id: generateMessageId(turn.personaId, state.messages.length),
      personaId: turn.personaId,
      content,
      replyTo: turn.replyToMessageId,
      timestamp: Date.now(),
    }

    state.messages.push(message)
    state.lastSpeakerId = turn.personaId
    yield { type: 'message_posted', message }

    // ─── Check for Disagreements (every 3 messages) ─────────

    if (state.messages.length % 3 === 0) {
      const detected = await detectDisagreements(state.messages, personaNames)

      if (detected) {
        const readyCandidate = registry.update(
          detected.personas,
          detected.topic,
          detected.shortLabel,
          activeRoomPairs,
        )

        // Emit detection event (informational)
        yield {
          type: 'disagreement_detected',
          candidate: {
            messages: state.messages.slice(-6).map(m => m.id),
            personas: detected.personas,
            topic: detected.topic,
            confidence: 1,  // Kept for type compat; boolean decomposition replaces confidence
          },
        }

        if (readyCandidate) {
          const roomId = `crux-${Date.now()}-${readyCandidate.personas.join('-')}`
          const pairKey = [...readyCandidate.personas].sort().join('|')
          activeRoomPairs.add(pairKey)
          registry.recordSpawn(readyCandidate.personas)

          yield {
            type: 'crux_room_spawning',
            roomId,
            question: readyCandidate.topic,
            label: readyCandidate.shortLabel,
            personas: readyCandidate.personas,
          }

          for await (const cruxEvent of runCruxRoom(
            roomId,
            readyCandidate.topic,
            readyCandidate.personas,
            state.messages.slice(-6).map(m => m.id),
            personaNames,
          )) {
            if (cruxEvent.type === 'crux_message') {
              yield { type: 'crux_message', roomId: cruxEvent.roomId, message: cruxEvent.message }
            } else if (cruxEvent.type === 'crux_card_generated') {
              yield { type: 'crux_card_posted', card: cruxEvent.card }
            }
          }

          activeRoomPairs.delete(pairKey)
        }
      }
    }
  }

  yield { type: 'dialogue_complete', finalState: state }
}

function generateMessageId(personaId: string, index: number): string {
  return `msg-${Date.now()}-${personaId}-${index}`
}
