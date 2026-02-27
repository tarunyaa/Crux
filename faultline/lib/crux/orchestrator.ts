// ─── Crux Room Orchestrator ──────────────────────────────────
// Personas argue freely until the crux is surfaced or cap reached.
// No phases, no external moderator — the crux must emerge from the conversation.

import type { CruxRoom, CruxMessage, CruxCard, CruxEvent, PersonaId, DisagreementType, Position } from './types'
import type { PersonaContract, Persona } from '@/lib/types'
import { loadContract, getPersona, buildSystemPrompt } from '@/lib/personas/loader'
import { completeJSON } from '@/lib/llm/client'
import {
  cruxRoomSystemPrompt,
  cruxTurnPrompt,
  cruxExitCheckPrompt,
  cruxExtractionPrompt,
} from './prompts'

const MAX_TURNS = 20  // Safety cap — room runs until crux surfaced or this limit

export async function* runCruxRoom(
  roomId: string,
  question: string,
  personaIds: PersonaId[],
  sourceMessages: string[],
  personaNames: Map<PersonaId, string>,
): AsyncGenerator<CruxEvent> {
  const room: CruxRoom = {
    id: roomId,
    question,
    personas: personaIds,
    status: 'arguing',
    messages: [],
    resolved: false,
    sourceMessages,
    startTime: Date.now(),
  }

  yield { type: 'crux_room_spawned', room }

  // Load personas
  const contracts = new Map<PersonaId, PersonaContract>()
  const personas = new Map<PersonaId, Persona>()

  for (const id of personaIds) {
    const contract = await loadContract(id)
    const persona = await getPersona(id)
    if (persona) {
      contracts.set(id, contract)
      personas.set(id, persona)
    }
  }

  // Entry system message
  const entryMsg: CruxMessage = {
    id: `${roomId}-sys-entry`,
    type: 'system',
    content: `"${question}"`,
    timestamp: Date.now(),
  }
  room.messages.push(entryMsg)
  yield { type: 'crux_message', roomId, message: entryMsg }

  // ─── Opening Statements ─────────────────────────────────────

  for (const personaId of personaIds) {
    const contract = contracts.get(personaId)
    const persona = personas.get(personaId)
    if (!contract || !persona) continue

    const opponentId = personaIds.find(id => id !== personaId) ?? personaIds[0]
    const opponentName = personaNames.get(opponentId) ?? opponentId

    const systemPrompt = buildSystemPrompt(contract, persona) + cruxRoomSystemPrompt(question, opponentName)

    try {
      const result = await completeJSON<{ content: string }>({
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `You're entering the crux room about: "${question}"\n\nState your position clearly in 2-3 sentences. What do you believe and why?\n\nRESPOND WITH JSON:\n{\n  "content": "your position statement"\n}`,
        }],
        model: 'sonnet',
        maxTokens: 150,
        temperature: 0.75,
      })

      const msg: CruxMessage = {
        id: `${roomId}-${personaId}-opening`,
        type: 'persona',
        personaId,
        content: result.content,
        timestamp: Date.now(),
      }
      room.messages.push(msg)
      yield { type: 'crux_message', roomId, message: msg }
    } catch (err) {
      console.error(`[crux] Opening error for ${personaId}:`, err)
    }
  }

  // ─── Free Exchange Loop ──────────────────────────────────────

  let turn = 0
  let speakerIdx = 0  // alternates 0/1

  while (turn < MAX_TURNS) {
    const speakerId = personaIds[speakerIdx]
    const listenerId = personaIds[1 - speakerIdx] ?? personaIds[0]
    const listenerName = personaNames.get(listenerId) ?? listenerId

    const contract = contracts.get(speakerId)
    const persona = personas.get(speakerId)
    if (!contract || !persona) { speakerIdx = 1 - speakerIdx; turn++; continue }

    // Last message from opponent
    const lastOpponentMsg = [...room.messages]
      .reverse()
      .find(m => m.type === 'persona' && m.personaId === listenerId)

    if (!lastOpponentMsg) { speakerIdx = 1 - speakerIdx; turn++; continue }

    // Build readable history
    const history = room.messages
      .filter(m => m.type === 'persona')
      .map(m => `${personaNames.get(m.personaId!) ?? m.personaId!}: ${m.content}`)
      .join('\n\n')

    const systemPrompt = buildSystemPrompt(contract, persona) + cruxRoomSystemPrompt(question, listenerName)

    try {
      const result = await completeJSON<{ content: string }>({
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: cruxTurnPrompt(question, history, lastOpponentMsg.content, listenerName),
        }],
        model: 'sonnet',
        maxTokens: 200,
        temperature: 0.75,
      })

      const msg: CruxMessage = {
        id: `${roomId}-${speakerId}-t${turn}`,
        type: 'persona',
        personaId: speakerId,
        content: result.content,
        timestamp: Date.now(),
      }
      room.messages.push(msg)
      yield { type: 'crux_message', roomId, message: msg }
    } catch (err) {
      console.error(`[crux] Turn error for ${speakerId}:`, err)
    }

    // ─── Exit check every 2 full exchanges (after turn 3) ──────
    if (turn >= 3 && turn % 2 === 1) {
      const conversationText = room.messages
        .filter(m => m.type === 'persona')
        .map(m => `${personaNames.get(m.personaId!) ?? m.personaId!}: ${m.content}`)
        .join('\n\n')

      try {
        const exitCheck = await completeJSON<{ cruxSurfaced: boolean; reason: string }>({
          system: 'You analyze debate conversations to determine if the core disagreement has been surfaced.',
          messages: [{ role: 'user', content: cruxExitCheckPrompt(question, conversationText) }],
          model: 'haiku',
          maxTokens: 200,
          temperature: 0.2,
        })

        if (exitCheck.cruxSurfaced) {
          const doneMsg: CruxMessage = {
            id: `${roomId}-sys-done`,
            type: 'system',
            content: `Crux surfaced. Closing room.`,
            timestamp: Date.now(),
          }
          room.messages.push(doneMsg)
          yield { type: 'crux_message', roomId, message: doneMsg }
          break
        }
      } catch (_) {
        // Continue if exit check fails
      }
    }

    speakerIdx = 1 - speakerIdx
    turn++
  }

  // ─── Extract Card from Conversation ─────────────────────────

  room.status = 'complete'

  const conversationText = room.messages
    .filter(m => m.type === 'persona')
    .map(m => `${personaNames.get(m.personaId!) ?? m.personaId!}: ${m.content}`)
    .join('\n\n')

  const personaNamesList = personaIds.map(id => personaNames.get(id) ?? id)

  let card: CruxCard

  try {
    const extraction = await completeJSON<{
      cruxStatement: string
      disagreementType: DisagreementType
      diagnosis: string
      resolved: boolean
      resolution?: string | null
      personas: Record<string, { position: Position; reasoning: string; falsifier: string }>
    }>({
      system: 'You extract crux cards from debate transcripts. Be precise and faithful to what was said.',
      messages: [{
        role: 'user',
        content: cruxExtractionPrompt(question, conversationText, personaIds, personaNamesList),
      }],
      model: 'sonnet',
      maxTokens: 600,
      temperature: 0.3,
    })

    card = {
      id: `card-${roomId}`,
      question: extraction.cruxStatement || question,
      personas: extraction.personas,
      disagreementType: extraction.disagreementType,
      diagnosis: extraction.diagnosis,
      resolved: extraction.resolved,
      resolution: extraction.resolution ?? undefined,
      sourceMessages: room.sourceMessages,
      cruxRoomId: roomId,
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('[crux] Card extraction error:', err)
    card = {
      id: `card-${roomId}`,
      question,
      personas: Object.fromEntries(
        personaIds.map(id => [id, { position: 'NUANCED' as Position, reasoning: 'See transcript', falsifier: undefined }])
      ),
      disagreementType: 'claim',
      diagnosis: 'See crux room transcript',
      resolved: false,
      sourceMessages: room.sourceMessages,
      cruxRoomId: roomId,
      timestamp: Date.now(),
    }
  }

  yield { type: 'crux_card_generated', card }
  yield { type: 'crux_room_complete', roomId }
}
