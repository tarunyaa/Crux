// ─── Dialogue Agent ────────────────────────────────────────────

import type { DialogueMessage } from './types'
import type { TurnIntent } from './turn-manager'
import { completeJSON } from '@/lib/llm/client'
import { microTurnPrompt, openingMicroTurnPrompt } from './prompts'
import type { PersonaContract, Persona } from '@/lib/types'
import { buildConsolidatedPrompt } from '@/lib/personas/loader'

/**
 * Generate a dialogue turn.
 * Uses the consolidated persona system prompt (identity + voice + grounding).
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
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  const recentHistory = recentMessages
    .map(m => `> ${personaNames.get(m.personaId) ?? m.personaId}: "${m.content}"`)
    .join('\n')

  const prompt = microTurnPrompt(replyToMessage, intent, personaNames, recentHistory)

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 200,
      temperature: 0.85,
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
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  const prompt = openingMicroTurnPrompt(topic)

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'haiku',
      maxTokens: 200,
      temperature: 0.85,
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
