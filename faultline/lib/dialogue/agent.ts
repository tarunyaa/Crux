// ─── Dialogue Agent ────────────────────────────────────────────

import type { DialogueMessage, PersonaId } from './types'
import type { TurnIntent } from './turn-manager'
import { completeJSON } from '@/lib/llm/client'
import { microTurnPrompt, openingMicroTurnPrompt, CHAT_TONE_EXAMPLES } from './prompts'
import { buildVoiceConstraints, getChatStyleHint } from './speech-roles'
import type { PersonaContract, Persona } from '@/lib/types'
import { buildSystemPrompt } from '@/lib/personas/loader'

/**
 * Generate a dialogue turn.
 * Uses the full persona system prompt + voice constraints.
 * No hard character cap — length is guided by turn type in the prompt.
 */
export async function generateMicroTurn(
  contract: PersonaContract,
  persona: Persona,
  replyToMessage: DialogueMessage | null,
  intent: TurnIntent,
  personaNames: Map<string, string>,
  recentMessages: DialogueMessage[] = [],
): Promise<string | null> {
  const fullPersonality = buildSystemPrompt(contract, persona)
  const voiceConstraints = buildVoiceConstraints(persona.name)
  const chatStyleHint = getChatStyleHint(persona.name)

  const systemPrompt = `${fullPersonality}${voiceConstraints}

${CHAT_TONE_EXAMPLES}`

  const recentHistory = recentMessages
    .map(m => `> ${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
    .join('\n')

  const prompt = microTurnPrompt(replyToMessage, intent, personaNames, chatStyleHint, recentHistory)

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 200,
      temperature: 1.0,
    })

    if (!response.utterance || response.utterance.trim().length === 0) {
      return null
    }

    // Block pure AI politeness patterns — everything else is acceptable
    const hardBanned = [
      /^(that'?s a (great|good|interesting|valid|fair) (point|question|observation))/i,
      /\bas an AI\b/i,
      /^(firstly|secondly|thirdly)[,\s]/i,
      /\bin (summary|conclusion)[,\s]/i,
      /\blet'?s break this down\b/i,
    ]

    for (const pattern of hardBanned) {
      if (pattern.test(response.utterance)) {
        console.warn(`[${persona.name}] Banned pattern detected, rejecting`)
        return null
      }
    }

    return response.utterance
  } catch (error) {
    console.error(`[${persona.name}] Error generating turn:`, error)
    return null
  }
}

/**
 * Opening message — persona's first take on the topic.
 */
export async function generateOpeningMicroTurn(
  contract: PersonaContract,
  persona: Persona,
  topic: string,
): Promise<string | null> {
  const fullPersonality = buildSystemPrompt(contract, persona)
  const voiceConstraints = buildVoiceConstraints(persona.name)
  const chatStyleHint = getChatStyleHint(persona.name)

  const systemPrompt = `${fullPersonality}${voiceConstraints}`

  const prompt = openingMicroTurnPrompt(topic, chatStyleHint)

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 200,
      temperature: 1.0,
    })

    if (!response.utterance || response.utterance.trim().length === 0) {
      return null
    }

    return response.utterance
  } catch (error) {
    console.error(`[${persona.name}] Error generating opening:`, error)
    return null
  }
}
