// ─── Panel Debate Orchestrator ────────────────────────────────

import type {
  DialogueConfig,
  DialogueState,
  DialogueMessage,
  DialogueEvent,
  PersonaId,
  DebateContext,
  PositionShift,
} from './types'
import type { PersonaContract, Persona } from '@/lib/types'
import { loadContract, getPersona } from '@/lib/personas/loader'
import { generateOpeningMicroTurn, generateTake, generateReplyToReply, generateClosing } from './agent'
import { decomposeTopicIntoAspects } from './topic-decomposer'
import { buildTurnContext, summarizeRound } from './context-builder'
import { detectDisagreementFromTakes } from './disagreement-detector'
import { runCruxRoom } from '@/lib/crux/orchestrator'
import { summarizeDebate } from './summarizer'
import { completeJSON } from '@/lib/llm/client'

export async function* runDialogue(
  config: DialogueConfig,
): AsyncGenerator<DialogueEvent> {
  const { topic, personaIds } = config

  const state: DialogueState = {
    topic,
    messages: [],
    activePersonas: personaIds,
    startTime: Date.now(),
  }

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

  // ─── Topic Decomposition ────────────────────────────────────

  const aspects = await decomposeTopicIntoAspects(topic, 3)

  yield { type: 'dialogue_start', topic, personas: personaIds }
  yield { type: 'debate_start', topic, aspects, personas: personaIds }

  // Initialize debate context
  const debateContext: DebateContext = {
    originalTopic: topic,
    aspects,
    rounds: [],
    contestedClaims: [],
    cruxCards: [],
  }

  // ─── Opening Round ──────────────────────────────────────────

  const openingMessages = await Promise.all(
    personaIds.map(async (personaId) => {
      const contract = contracts.get(personaId)!
      const persona = personas.get(personaId)!
      const content = await generateOpeningMicroTurn(contract, persona, topic)
      if (!content) return null
      return {
        id: generateMessageId(personaId, state.messages.length),
        personaId,
        content,
        timestamp: Date.now(),
      } as DialogueMessage
    })
  )

  for (const msg of openingMessages) {
    if (msg) {
      state.messages.push(msg)
      yield { type: 'message_posted', message: msg, phase: 'opening' }
    }
  }

  // ─── Aspect Rounds ─────────────────────────────────────────

  const activeRoomPairs = new Set<string>()
  const MAX_MINIROUNDS = 3  // Per themed round: initial take + 2 reaction rounds

  // Build opening statements text for context (prevents repetition in round 1)
  const openingStatementsText = openingMessages
    .filter(Boolean)
    .map(m => `${personaNames.get(m!.personaId) ?? m!.personaId}: "${m!.content}"`)
    .join('\n')

  for (let roundIdx = 0; roundIdx < aspects.length; roundIdx++) {
    const aspect = aspects[roundIdx]

    yield { type: 'round_start', aspect, roundNumber: roundIdx + 1 }

    const roundMessages: DialogueMessage[] = []
    let lastMiniroundTakes: DialogueMessage[] = []
    const allMiniroundTakes: DialogueMessage[][] = []  // Track each miniround's messages

    // ── Parallel Minirounds ─────────────────────────────────
    // Miniround 0: initial takes (no previous context within this round)
    // Miniround 1: respond to others' miniround 0 takes
    // Miniround 2: reply to whoever replied to YOU in miniround 1

    // ── All minirounds run first, then disagreement detection ──
    for (let mini = 0; mini < MAX_MINIROUNDS; mini++) {

      // ── Miniround 2: reply-to-reply (threaded) ──────────
      if (mini === 2 && allMiniroundTakes.length >= 2) {
        const mini0 = allMiniroundTakes[0]
        const mini1 = allMiniroundTakes[1]

        const takes = await Promise.all(
          personaIds.map(async (personaId) => {
            const contract = contracts.get(personaId)!
            const persona = personas.get(personaId)!

            // Find my miniround 0 message
            const myMini0 = mini0.find(m => m.personaId === personaId)
            if (!myMini0) return null

            // Find miniround 1 messages that replied to me
            const repliesToMe = mini1.filter(m =>
              m.personaId !== personaId && m.replyTo === myMini0.id
            )

            if (repliesToMe.length === 0) {
              return null // Nobody replied to me — skip miniround 2
            }

            // Pick the first reply (most direct challenger)
            const challenger = repliesToMe[0]
            const challengerName = personaNames.get(challenger.personaId) ?? challenger.personaId

            const result = await generateReplyToReply(
              contract, persona, aspect,
              myMini0.content,
              challengerName,
              challenger.content,
            )
            if (!result) return null

            return {
              id: generateMessageId(personaId, state.messages.length + roundMessages.length),
              personaId,
              content: result,
              replyTo: challenger.id,
              round: roundIdx + 1,
              miniround: mini,
              timestamp: Date.now(),
            } as DialogueMessage
          })
        )

        const thisMiniTakes: DialogueMessage[] = []
        for (const msg of takes) {
          if (msg) {
            state.messages.push(msg)
            roundMessages.push(msg)
            thisMiniTakes.push(msg)
            yield { type: 'message_posted', message: msg, phase: 'take' }
          }
        }
        allMiniroundTakes.push(thisMiniTakes)
        lastMiniroundTakes = thisMiniTakes
        continue
      }

      // ── Miniround 0-1: standard behavior ────────────────
      // Miniround 0: full context + opening statements. Miniround 1+: only previous takes.
      const contextText = mini === 0
        ? buildTurnContext(debateContext, [], personaNames)
        : ''

      const previousTakesText = lastMiniroundTakes.length > 0
        ? lastMiniroundTakes
            .map(m => `${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
            .join('\n\n')
        : undefined

      const takes = await Promise.all(
        personaIds.map(async (personaId) => {
          const contract = contracts.get(personaId)!
          const persona = personas.get(personaId)!

          // For miniround 1+, build previousTakes EXCLUDING this persona's own message
          let filteredPreviousTakes = previousTakesText
          if (previousTakesText && mini > 0) {
            filteredPreviousTakes = lastMiniroundTakes
              .filter(m => m.personaId !== personaId)
              .map(m => `${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
              .join('\n\n') || undefined
          }

          const result = await generateTake(
            contract, persona, aspect, contextText,
            filteredPreviousTakes,
            mini === 0 ? openingStatementsText : undefined,
          )
          if (!result) return null

          // Resolve replyTo: find the message ID from the previous miniround
          // that matches the persona name — EXCLUDING self
          const replyTo = result.replyingTo
            ? resolveReplyTarget(result.replyingTo, lastMiniroundTakes, personaId, personaNames)
            : undefined

          return {
            id: generateMessageId(personaId, state.messages.length + roundMessages.length),
            personaId,
            content: result.content,
            replyTo,
            round: roundIdx + 1,
            miniround: mini,
            timestamp: Date.now(),
          } as DialogueMessage
        })
      )

      const thisMiniTakes: DialogueMessage[] = []
      for (const msg of takes) {
        if (msg) {
          state.messages.push(msg)
          roundMessages.push(msg)
          thisMiniTakes.push(msg)
          yield { type: 'message_posted', message: msg, phase: 'take' }
        }
      }

      allMiniroundTakes.push(thisMiniTakes)
      lastMiniroundTakes = thisMiniTakes
    }

    // ── Disagreement detection after all minirounds for this round ──
    // Uses the final miniround's takes (most refined positions)
    if (lastMiniroundTakes.length >= 2) {
      const detected = await detectDisagreementFromTakes(
        lastMiniroundTakes, personaNames, topic,
      )

      if (detected && detected.spawnCruxRoom) {
        yield {
          type: 'disagreement_detected',
          candidate: {
            messages: lastMiniroundTakes.map(m => m.id),
            personas: detected.personas,
            topic: detected.topic,
            confidence: 1,
          },
        }

        const roomId = `crux-${Date.now()}-${detected.personas.join('-')}`
        const pairKey = [...detected.personas].sort().join('|')

        if (!activeRoomPairs.has(pairKey)) {
          activeRoomPairs.add(pairKey)

          debateContext.contestedClaims.push({
            claim: detected.topic,
            personas: [detected.personas[0], detected.personas[1]],
            status: 'unresolved',
            source: 'detection',
          })

          const sourceMessageIds = lastMiniroundTakes.map(m => m.id)
          console.log('[trigger-debug] yielding crux_room_spawning with sourceMessages:', sourceMessageIds)
          yield {
            type: 'crux_room_spawning',
            roomId,
            question: detected.topic,
            label: detected.shortLabel,
            personas: detected.personas,
            sourceMessages: sourceMessageIds,
          }

          for await (const cruxEvent of runCruxRoom(
            roomId,
            detected.topic,
            detected.personas,
            lastMiniroundTakes.map(m => m.id),
            personaNames,
            topic,
          )) {
            if (cruxEvent.type === 'crux_message') {
              yield { type: 'crux_message', roomId: cruxEvent.roomId, message: cruxEvent.message }
            } else if (cruxEvent.type === 'crux_card_generated') {
              debateContext.cruxCards.push(cruxEvent.card)
              yield { type: 'crux_card_posted', card: cruxEvent.card }
            }
          }

          activeRoomPairs.delete(pairKey)
        }
      }
    }

    // ── Round Summary ───────────────────────────────────────

    const summary = await summarizeRound(aspect.label, roundMessages, personaNames)
    debateContext.rounds.push({
      aspect,
      summary,
      takes: roundMessages,
      clashMessages: [],
    })

    yield { type: 'round_end', aspect }
  }

  // ─── Closing Round ──────────────────────────────────────────

  const closingContext = buildTurnContext(debateContext, [], personaNames)

  const closingMessages = await Promise.all(
    personaIds.map(async (personaId) => {
      const contract = contracts.get(personaId)!
      const persona = personas.get(personaId)!
      const content = await generateClosing(contract, persona, topic, closingContext)
      if (!content) return null
      return {
        id: generateMessageId(personaId, state.messages.length),
        personaId,
        content,
        timestamp: Date.now(),
      } as DialogueMessage
    })
  )

  for (const msg of closingMessages) {
    if (msg) {
      state.messages.push(msg)
      yield { type: 'message_posted', message: msg, phase: 'closing' }
    }
  }

  // ─── Shift Detection + Summary ─────────────────────────────

  const [shifts, summary] = await Promise.all([
    detectShifts(
      personaIds,
      openingMessages.filter(Boolean) as DialogueMessage[],
      closingMessages.filter(Boolean) as DialogueMessage[],
      personaNames,
    ),
    summarizeDebate(
      topic,
      state.messages,
      debateContext.cruxCards,
      personaIds,
      personaNames,
    ),
  ])

  yield { type: 'dialogue_complete', finalState: state, shifts, summary: summary ?? undefined }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Fuzzy-match a name the LLM returned against persona messages, excluding self. */
function resolveReplyTarget(
  replyingTo: string,
  candidates: DialogueMessage[],
  selfId: string,
  personaNames: Map<string, string>,
): string | undefined {
  const needle = replyingTo.toLowerCase().trim()
  const target = candidates.find(m => {
    if (m.personaId === selfId) return false
    const name = personaNames.get(m.personaId) ?? m.personaId
    const lower = name.toLowerCase()
    const parts = lower.split(' ')
    return lower === needle                     // exact: "michael saylor"
      || parts[0] === needle                    // first name: "michael"
      || (parts.length > 1 && parts[parts.length - 1] === needle) // last name: "saylor"
      || lower.startsWith(needle)               // prefix: "michael s"
      || lower.includes(needle)                 // substring: "chamath"
  })
  return target?.id
}

function generateMessageId(personaId: string, index: number): string {
  return `msg-${Date.now()}-${personaId}-${index}`
}

async function detectShifts(
  personaIds: PersonaId[],
  openings: DialogueMessage[],
  closings: DialogueMessage[],
  personaNames: Map<string, string>,
): Promise<PositionShift[]> {
  const pairs: string[] = []
  for (const id of personaIds) {
    const opening = openings.find(m => m.personaId === id)
    const closing = closings.find(m => m.personaId === id)
    if (opening && closing) {
      const name = personaNames.get(id) ?? id
      pairs.push(`${name}:\n  Opening: "${opening.content}"\n  Closing: "${closing.content}"`)
    }
  }

  if (pairs.length === 0) return []

  try {
    const result = await completeJSON<{ shifts: Array<{ name: string; shifted: boolean; summary: string }> }>({
      system: 'You detect position shifts in debate participants by comparing their opening and closing statements.',
      messages: [{
        role: 'user',
        content: `Compare each participant's opening and closing statements. Did they shift their position?

${pairs.join('\n\n')}

Output JSON:
{
  "shifts": [
    { "name": "participant name", "shifted": true/false, "summary": "1 sentence describing shift or lack thereof" }
  ]
}`,
      }],
      model: 'haiku',
      maxTokens: 300,
      temperature: 0.2,
    })

    return result.shifts.map(s => {
      // Map name back to ID
      let personaId = s.name
      for (const [id, name] of personaNames.entries()) {
        if (name === s.name) { personaId = id; break }
      }
      return { personaId, shifted: s.shifted, summary: s.summary }
    })
  } catch (error) {
    console.error('[shifts] Error detecting shifts:', error)
    return []
  }
}
