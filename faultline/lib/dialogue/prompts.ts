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
 */
export function microTurnPrompt(
  replyToMessage: DialogueMessage | null,
  intent: TurnIntent,
  personaNames: Map<string, string>,
  chatStyleHint: string,
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

Your style: ${chatStyleHint}
Your move: ${intentInstruction}
Length: ${lengthGuide}

HARD RULES — violating these makes you sound like an AI, not a person:
- Never start with acknowledgment ("Good point", "That's interesting", "I see")
- Never hedge ("perhaps", "might", "could be", "I think", "I believe")
- Never use passive voice
- No lists, no "firstly/secondly", no "in conclusion"
- Just say the thing directly in your own voice

Good examples:
- "Wrong. That correlation breaks during liquidity crises. Check 2008."
- "Show me the data. I see the opposite in every cycle."
- "Zoom out — 10 year view is the only one that matters for a savings asset."
- "So your whole thesis requires zero volatility tolerance? That's not most portfolios."

Output ONLY JSON:
{
  "utterance": "your response"
}`
}

/**
 * Opening message — each persona's first statement on the topic.
 */
export function openingMicroTurnPrompt(
  topic: string,
  chatStyleHint: string,
): string {
  return `Group chat starting: "${topic}"

Your style: ${chatStyleHint}

Drop your take in 2-4 sentences. Establish your actual position — not a summary, your view.

BANNED:
- "I think" / "In my view" / "Here's my take"
- Any preamble or throat-clearing
- Vague statements that don't commit to a position

Output ONLY JSON:
{
  "utterance": "your opening take"
}`
}

/**
 * General tone examples (used for calibration)
 */
export const CHAT_TONE_EXAMPLES = `
Example chat (style only — learn the voice, not the content):

Alice: "Remote work killed cities. Migration data is clear."
Bob: "SF rents disagree. That's a lagging indicator."
Alice: "Which market? Austin is up 30%. Pick your data carefully."
Charlie: "Network effects take 5 years to unwind. You're measuring too early."
Bob: "5 years at 7% vacancy is not network effects. That's structural."
`
