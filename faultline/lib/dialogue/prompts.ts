// ─── Dialogue Prompts ─────────────────────────────────────────

import type { DialogueMessage } from './types'
import type { TurnIntent } from './turn-manager'
import { getIntentInstruction } from './turn-manager'

/**
 * Turn-type guidance passed to the model.
 * No hard character cap — the model decides appropriate length.
 */
const TURN_LENGTH_GUIDE: Record<string, string> = {
  opening: '3-5 sentences. Establish your position with real substance.',
  reply: '2-3 sentences. Engage the specific point directly.',
  challenge: '2-4 sentences. Make a specific counter-claim with reasoning.',
  dismissal: '1 sentence. You wouldn\'t dignify this with more.',
}

/**
 * Generate a dialogue turn response.
 * Intent and turn type are assigned by the orchestrator.
 * HARD RULES and voice constraints are in the consolidated system prompt.
 */
export function microTurnPrompt(
  replyToMessage: DialogueMessage | null,
  intent: TurnIntent,
  personaNames: Map<string, string>,
  recentHistory: string,
): string {
  const targetName = replyToMessage
    ? personaNames.get(replyToMessage.personaId) ?? 'them'
    : null

  const replyContext = replyToMessage
    ? `${targetName} said: "${replyToMessage.content}"`
    : 'Starting the conversation'

  const intentInstruction = getIntentInstruction(intent)

  // Infer turn type from intent for length guidance
  const turnType =
    intent === 'DISAGREE' ? 'challenge' :
    intent === 'AGREE' ? 'reply' :
    'reply'

  const lengthGuide = TURN_LENGTH_GUIDE[turnType]

  const historyBlock = recentHistory
    ? `Recent thread:\n${recentHistory}\n\n---\n`
    : ''

  return `Group chat.

${historyBlock}${replyContext}

Your move: ${intentInstruction}
Length: ${lengthGuide}

Output ONLY JSON:
{
  "utterance": "your response"
}`
}

/**
 * Opening message — each persona's first statement on the topic.
 * Voice constraints are in the consolidated system prompt.
 */
export function openingMicroTurnPrompt(
  topic: string,
): string {
  return `Group chat starting: "${topic}"

Drop your take in 2-4 sentences. Establish your actual position — not a summary, your view.

Output ONLY JSON:
{
  "utterance": "your opening take"
}`
}

/**
 * General tone examples (kept for reference but no longer used in agent.ts)
 */
export const CHAT_TONE_EXAMPLES = `
Example chat (style only — learn the voice, not the content):

Alice: "Remote work killed cities. Migration data is clear."
Bob: "SF rents disagree. That's a lagging indicator."
Alice: "Which market? Austin is up 30%. Pick your data carefully."
Charlie: "Network effects take 5 years to unwind. You're measuring too early."
Bob: "5 years at 7% vacancy is not network effects. That's structural."
`
