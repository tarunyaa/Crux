// ─── Dialogue Agent ────────────────────────────────────────────

import type { DebateAspect } from './types'
import { completeJSON } from '@/lib/llm/client'
import type { PersonaContract, Persona } from '@/lib/types'
import { buildConsolidatedPrompt } from '@/lib/personas/loader'

// ─── Shared Utilities ─────────────────────────────────────────

const hardBanned = [
  /^(that'?s a (great|good|interesting|valid|fair) (point|question|observation))/i,
  /\bas an AI\b/i,
  /^(firstly|secondly|thirdly)[,\s]/i,
  /\bin (summary|conclusion)[,\s]/i,
  /\blet'?s break this down\b/i,
  /^the ['"]?[\w\s-]+['"]?\s+(argument|critique|framing|claim|thesis|point)\s+(misses|ignores|overlooks|fails)/i,
]

function checkBanned(utterance: string, personaName: string): string | null {
  let cleaned = utterance
  for (const pattern of hardBanned) {
    if (pattern.test(cleaned)) {
      // Strip the banned prefix instead of rejecting the entire message
      cleaned = cleaned.replace(pattern, '').replace(/^[,.\s—-]+/, '').trim()
      console.warn(`[${personaName}] Banned pattern stripped`)
    }
  }
  // Only reject if nothing meaningful remains after stripping
  if (cleaned.length < 20) return null
  // Capitalize first letter after stripping
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

// ─── Opening ─────────────────────────────────────────────────

/**
 * Opening message — persona's first take on the topic.
 */
export async function generateOpeningMicroTurn(
  contract: PersonaContract,
  persona: Persona,
  topic: string,
): Promise<string | null> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  const prompt = `Someone just brought up: "${topic}"

React naturally. What's the first thing that comes to mind? Say it how YOU would actually say it — your words, your style, your angle. 2-3 sentences max.

Output ONLY JSON:
{
  "utterance": "your opening take"
}`

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'sonnet',
      maxTokens: 200,
      temperature: 0.85,
    })

    if (!response.utterance || response.utterance.trim().length === 0) return null
    return checkBanned(response.utterance, persona.name)
  } catch (error) {
    console.error(`[${persona.name}] Error generating opening:`, error)
    return null
  }
}

// ─── Panel Debate: Take ───────────────────────────────────────

/**
 * Generate a take on a specific debate aspect (parallel miniround).
 * previousTakes contains the other agents' messages from the last miniround
 * so agents actually engage each other rather than monologuing.
 */
export async function generateTake(
  contract: PersonaContract,
  persona: Persona,
  aspect: DebateAspect,
  contextText: string,
  previousTakes?: string,
  openingStatements?: string,
): Promise<{ content: string; replyingTo?: string } | null> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  let prompt: string

  if (previousTakes) {
    // Miniround 1+: respond to what others said.
    prompt = `Topic: ${aspect.label} — ${aspect.description}

Others just said:
${previousTakes}

Respond to whoever you have the most tension with. Quote or reference what they actually said, then hit back with YOUR counter-argument. If you agree with someone, build on their point — add what they missed.

DO NOT repeat your opening position. DO NOT start with the person's name. Just argue.
2-3 sentences.

Output ONLY JSON:
{ "utterance": "your response", "replyingTo": "first name of who you're responding to" }`
  } else {
    // Miniround 0: initial take on this specific aspect
    const openingBlock = openingStatements
      ? `\nEveryone's opening statements (DO NOT repeat these — say something NEW):\n${openingStatements}\n`
      : ''

    prompt = `Now discussing: ${aspect.label}
${aspect.description}
${openingBlock}
${contextText}

What's YOUR take on this specific angle? Not your general view — your angle on THIS question. Say it how you'd actually say it.
2-3 sentences.

Output ONLY JSON:
{ "utterance": "your take" }`
  }

  try {
    const response = await completeJSON<{ utterance: string; replyingTo?: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'sonnet',
      maxTokens: 250,
      temperature: 0.85,
    })

    if (!response.utterance || response.utterance.trim().length === 0) return null
    const cleaned = checkBanned(response.utterance, persona.name)
    if (!cleaned) return null
    return { content: cleaned, replyingTo: response.replyingTo }
  } catch (error) {
    console.error(`[${persona.name}] Error generating take:`, error)
    return null
  }
}

// ─── Panel Debate: Reply-to-Reply ────────────────────────────

/**
 * Generate a reply to someone who replied to YOUR earlier message.
 * Used in miniround 2 to create threaded back-and-forth.
 */
export async function generateReplyToReply(
  contract: PersonaContract,
  persona: Persona,
  aspect: DebateAspect,
  myOriginalTake: string,
  challengerName: string,
  challengerReply: string,
): Promise<string | null> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  const prompt = `Topic: ${aspect.label} — ${aspect.description}

You said: "${myOriginalTake}"

${challengerName} replied to you: "${challengerReply}"

Fire back. Defend your position, poke holes in their counter, or concede the specific point and pivot. Don't repeat yourself — respond to what THEY said.
2-3 sentences.

Output ONLY JSON:
{ "utterance": "your response" }`

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'sonnet',
      maxTokens: 250,
      temperature: 0.85,
    })

    if (!response.utterance || response.utterance.trim().length === 0) return null
    return checkBanned(response.utterance, persona.name)
  } catch (error) {
    console.error(`[${persona.name}] Error generating reply-to-reply:`, error)
    return null
  }
}

// ─── Panel Debate: Closing ───────────────────────────────────

/**
 * Generate closing statement after full debate.
 */
export async function generateClosing(
  contract: PersonaContract,
  persona: Persona,
  topic: string,
  contextText: string,
): Promise<string | null> {
  const systemPrompt = buildConsolidatedPrompt(contract, persona)

  const prompt = `The debate on "${topic}" is concluding.

${contextText}

Address the key disagreements directly. Where do you still disagree with others, and why? Where have you genuinely moved or found common ground? Be specific — name who you agree or disagree with and on what.
Length: 3-5 sentences.

Output ONLY JSON:
{ "utterance": "your closing statement" }`

  try {
    const response = await completeJSON<{ utterance: string }>({
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      model: 'sonnet',
      maxTokens: 350,
      temperature: 0.85,
    })

    if (!response.utterance || response.utterance.trim().length === 0) return null
    return checkBanned(response.utterance, persona.name)
  } catch (error) {
    console.error(`[${persona.name}] Error generating closing:`, error)
    return null
  }
}
