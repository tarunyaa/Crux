// ─── Crux Room Prompts ────────────────────────────────────────

/**
 * Injected into the persona's system prompt when entering a crux room.
 * Sits below their full personality prompt.
 */
export function cruxRoomSystemPrompt(question: string, opponentName: string): string {
  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRUX ROOM MODE

You are in a focused crux room with ${opponentName}.
You disagree on: "${question}"

Your goal: figure out WHY you disagree. Keep going until you both understand the root cause.

As you argue, push toward:
- Are you using the same timeframe?
- Are you looking at the same evidence?
- Are you defining key terms the same way?
- Is this a factual disagreement or a values disagreement?

When you think you've found the core of it, name it directly.

Rules:
- Keep every message to 2-3 sentences MAX — no monologues
- Be direct and combative — this is where you REALLY argue
- Challenge specific claims, ask pointed questions
- Respond to what was just said, don't repeat your whole position
- No politeness, no hedging
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

/**
 * User-turn prompt for each crux room exchange.
 */
export function cruxTurnPrompt(
  question: string,
  conversationHistory: string,
  lastMessage: string,
  opponentName: string,
): string {
  return `Crux room: "${question}"

Conversation so far:
${conversationHistory}

${opponentName} just said:
"${lastMessage}"

Argue back in 2-3 sentences. Push toward WHY you disagree.

RESPOND WITH JSON:
{
  "content": "your response (2-3 sentences, direct, specific)"
}`
}

/**
 * Checked every 2 full exchanges to see if the crux has been surfaced.
 */
export function cruxExitCheckPrompt(question: string, conversation: string): string {
  return `Crux room conversation about: "${question}"

${conversation}

Has the core disagreement been surfaced? A crux is surfaced when:
- Both personas have named the specific point they can't agree on, OR
- One persona has clearly changed their mind with a stated reason, OR
- They've both acknowledged it comes down to an irreducible values or time-horizon difference

RESPOND WITH JSON:
{
  "cruxSurfaced": boolean,
  "reason": "5 words max"
}`
}

/**
 * Final extraction prompt — reads full conversation, produces card data.
 */
export function cruxExtractionPrompt(
  question: string,
  conversation: string,
  personaIds: string[],
  personaNames: string[],
): string {
  const personasBlock = personaIds.map((id, i) => `"${id}": {
      "position": "YES|NO|NUANCED",
      "reasoning": "their final stance in 1-2 sentences",
      "falsifier": "what would change their mind"
    }`).join(',\n    ')

  return `Extract the crux card from this debate room conversation.

Question: "${question}"

Participants: ${personaNames.join(' vs ')}

Conversation:
${conversation}

Extract faithfully from what was actually said — don't invent positions.

RESPOND WITH JSON:
{
  "cruxStatement": "3-5 word noun phrase naming the crux — like a debate motion title, not a question (e.g. 'Bitcoin as reserve asset', 'AI capex bubble risk', 'Crypto regulatory capture')",
  "disagreementType": "horizon|evidence|values|definition|claim|premise",
  "diagnosis": "1-2 sentence explanation of root cause",
  "resolved": boolean,
  "resolution": "what changed or why it's irreducible (null if unresolved)",
  "personas": {
    ${personasBlock}
  }
}`
}
