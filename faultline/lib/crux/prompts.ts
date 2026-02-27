// ─── Crux Room Prompts ────────────────────────────────────────

/**
 * Injected into the persona's system prompt when entering a crux room.
 * Sits below their full personality prompt.
 */
export function cruxRoomSystemPrompt(
  cruxQuestion: string,
  opponentName: string,
  originalTopic?: string,
): string {
  const topicLine = originalTopic
    ? `\nThis arose in a debate about: "${originalTopic}". Stay relevant to the wider topic.`
    : ''

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRUX ROOM MODE

You are in a focused crux room about: "${cruxQuestion}"${topicLine}
Your opponent is ${opponentName}. Find the root of your disagreement.
Do NOT be agreeable just to end the conversation. If you disagree, say why.

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
 * Phase 1: Position statement prompt
 */
export function positionStatementPrompt(cruxQuestion: string): string {
  return `State your position on: "${cruxQuestion}"
WHY do you hold this position? What evidence or reasoning supports it?
Length: 2-3 sentences.

Output ONLY JSON:
{ "content": "your position statement" }`
}

/**
 * Phase 2 early: Directed exchange — finding the specific disagreement
 */
export function earlyExchangePrompt(
  cruxQuestion: string,
  positionSummary: string,
  recentExchanges: string,
  lastOpponentStatement: string,
  opponentName: string,
): string {
  return `Crux room: "${cruxQuestion}"

Positions so far:
${positionSummary}

Recent exchange:
${recentExchanges}

${opponentName} just said: "${lastOpponentStatement}"

Where SPECIFICALLY do you disagree with ${opponentName}'s reasoning? What evidence or assumption do they rely on that you reject?
Length: 2-3 sentences.

Output ONLY JSON:
{ "content": "your response" }`
}

/**
 * Phase 2 late: Steelman + update — after initial exchanges have mapped the disagreement
 */
export function lateExchangePrompt(
  cruxQuestion: string,
  positionSummary: string,
  recentExchanges: string,
  lastOpponentStatement: string,
  opponentName: string,
): string {
  return `Crux room: "${cruxQuestion}"

Positions so far:
${positionSummary}

Recent exchange:
${recentExchanges}

${opponentName} just said: "${lastOpponentStatement}"

Consider ${opponentName}'s strongest argument. Steelman it briefly. Then explain why you STILL disagree — or where you've genuinely updated your view.
Length: 2-4 sentences.

Output ONLY JSON:
{ "content": "your response" }`
}

/**
 * Phase 3: Convergence check — classify the disagreement type
 */
export function convergenceCheckPrompt(
  cruxQuestion: string,
  conversationText: string,
): string {
  return `Crux room about: "${cruxQuestion}"

Full exchange:
${conversationText}

In ONE sentence: what is the core thing these two cannot agree on?
Is it a FACTUAL question (they disagree about what's true), a VALUES difference (they prioritize different things), or a DEFINITIONAL issue (they mean different things by the same word)?

Output ONLY JSON:
{
  "coreDisagreement": "one sentence",
  "type": "factual|values|definitional",
  "converged": true
}`
}

/**
 * Exit check — run every 2 full exchanges after turn 3
 */
export function cruxExitCheckPrompt(question: string, conversationText: string): string {
  return `Crux room about: "${question}"

${conversationText}

Has the core disagreement been clearly surfaced? The crux is surfaced when:
1. Both parties have identified the SPECIFIC claim, value, or definition they disagree on
2. They're no longer discovering new ground — they're repeating positions

RESPOND WITH JSON:
{
  "cruxSurfaced": boolean,
  "reason": "brief explanation"
}`
}

/**
 * Final extraction — reads full conversation, produces card data
 */
export function cruxExtractionPrompt(
  question: string,
  conversation: string,
  personaIds: string[],
  personaNames: string[],
): string {
  const personasBlock = personaIds.map((id, i) => `"${id}": {
      "position": "YES|NO|NUANCED",
      "reasoning": "their key argument in 1-2 sentences",
      "falsifier": "what would change their mind"
    }`).join(',\n    ')

  return `Extract a crux card from this debate room.

Room topic: "${question}"

Transcript:
${conversation}

Participants: ${personaNames.join(', ')}

Extract:
1. The precise crux statement (the specific thing they disagree on)
2. Disagreement type: "empirical" (factual), "values" (priorities), "definition" (meaning), "claim" (logical), "premise" (assumption), "horizon" (timeframe)
3. Each persona's position, reasoning, and what would change their mind (falsifier)
4. Whether it was resolved
5. A brief diagnosis of the root cause

RESPOND WITH JSON:
{
  "cruxStatement": "3-5 word noun phrase naming the crux",
  "disagreementType": "horizon|evidence|values|definition|claim|premise",
  "diagnosis": "1-2 sentence root cause",
  "resolved": boolean,
  "resolution": "if resolved, what was agreed (null if unresolved)",
  "personas": {
    ${personasBlock}
  }
}`
}
