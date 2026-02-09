import type { BlackboardState, Claim, AgentStance, PersonaId } from '@/lib/types'

// ─── Claim Decomposition ─────────────────────────────────────

export function claimDecompositionPrompt(topic: string): string {
  return `You are a debate analyst. Given a topic, decompose it into 2-4 specific, testable claims that capture the core disagreements.

Each claim should:
- Be a concrete proposition (not a question)
- Have a clear pro/con framing
- Be independently evaluable

Topic: "${topic}"

Respond with ONLY valid JSON matching this schema:
{
  "claims": [
    { "text": "claim text here" }
  ]
}

Return 2-4 claims. Keep each claim to one sentence. No commentary outside the JSON.`
}

// ─── Agent Turn ──────────────────────────────────────────────

export interface AgentTurnContext {
  blackboardSummary: string
  localNeighborhood: string
  claims: Claim[]
  currentStances: AgentStance[]
}

export function agentTurnPrompt(ctx: AgentTurnContext): string {
  const claimList = ctx.claims
    .map((c, i) => `  ${i + 1}. [${c.id}] ${c.text}`)
    .join('\n')

  const stanceList = ctx.currentStances.length > 0
    ? ctx.currentStances
        .map(s => `  - Claim ${s.claimId}: ${s.stance} (confidence: ${s.confidence})`)
        .join('\n')
    : '  (no prior stances)'

  return `You are participating in a structured debate. Respond to the current state of discussion.

## Claims Under Debate
${claimList}

## Your Previous Stances
${stanceList}

## Blackboard (Shared State)
${ctx.blackboardSummary}

## Recent Discussion
${ctx.localNeighborhood || '(opening round)'}

## Instructions
Respond to EACH claim individually. For each claim, write a focused 1-2 sentence response (~40-60 words) that engages with that specific claim. Reference specific evidence. Address disagreements with other participants on that point. Update your stance if new arguments warrant it.

Respond with ONLY valid JSON matching this schema:
{
  "claimResponses": [
    {
      "claimId": "claim id",
      "response": "Your 1-2 sentence response addressing this specific claim (~40-60 words). Plain text ONLY — no markdown, no asterisks, no bold/italic formatting.",
      "stance": "pro" | "con" | "uncertain",
      "confidence": 0.0-1.0
    }
  ],
  "newCruxes": ["any new disputed propositions you identify"],
  "flipTriggers": ["any of your flip conditions that were triggered this round"]
}

You MUST include one entry in claimResponses for EVERY claim listed above. Be specific and concise. No text outside the JSON. No markdown formatting anywhere.`
}

// ─── Blackboard Summary ──────────────────────────────────────

export function blackboardSummaryPrompt(
  blackboard: BlackboardState,
  tokenBudget: number,
): string {
  const bb = JSON.stringify(blackboard, null, 2)

  return `Compress the following debate blackboard state into a concise summary of approximately ${tokenBudget} tokens. Preserve:
- All active claims and their current dispute status
- Key cruxes (especially unresolved ones)
- Current stance distribution per claim (who is pro/con/uncertain)
- Any triggered flip conditions
- Open questions

Blackboard state:
${bb}

Respond with a plain text summary. No JSON, no markdown headers.`
}

// ─── Initial Stance Generation ───────────────────────────────

export function initialStancePrompt(claims: Claim[]): string {
  const claimList = claims
    .map((c, i) => `  ${i + 1}. [${c.id}] ${c.text}`)
    .join('\n')

  return `Based on your profile, values, and epistemology, take an initial position on each of the following claims.

## Claims
${claimList}

Respond with ONLY valid JSON matching this schema:
{
  "stances": [
    {
      "claimId": "claim id",
      "stance": "pro" | "con" | "uncertain",
      "confidence": 0.0-1.0,
      "reasoning": "one sentence explaining your position"
    }
  ]
}

Stay in character. Be decisive — avoid defaulting to "uncertain" unless your profile genuinely supports ambiguity on that claim.`
}

// ─── Final Output Extraction ─────────────────────────────────

export function finalOutputPrompt(blackboard: BlackboardState): string {
  const bb = JSON.stringify(blackboard, null, 2)

  return `You are a debate analyst. Review the full blackboard from a multi-agent debate and extract a structured analysis.

## Blackboard State
${bb}

Extract the following into valid JSON:

{
  "cruxes": [
    {
      "id": "crux-N",
      "proposition": "the contested proposition",
      "weight": 0.0-1.0,
      "resolved": true/false
    }
  ],
  "faultLines": [
    {
      "category": "time_horizon" | "assumptions" | "identity_values" | "epistemology" | "stakes",
      "description": "what drives this disagreement",
      "relatedCruxIds": ["crux-N"]
    }
  ],
  "flipConditions": [
    {
      "personaId": "agent id",
      "condition": "what would change their mind",
      "claimId": "related claim",
      "triggered": true/false
    }
  ],
  "evidenceLedger": [
    {
      "personaId": "agent id",
      "accepted": ["evidence they accepted"],
      "rejected": [{ "evidence": "what was rejected", "reason": "why" }]
    }
  ],
  "resolutionPaths": [
    {
      "description": "experiment or data that could settle this",
      "relatedCruxIds": ["crux-N"]
    }
  ]
}

Be thorough but concise. Focus on the most significant disagreements and their root causes. Return ONLY valid JSON.`
}

// ─── Action Plan (Classical Mode) ───────────────────────────

export interface ActionPlanContext {
  blackboardSummary: string
  recentMessages: string
  claims: Claim[]
  currentStances: AgentStance[]
  personaId: PersonaId
}

export function actionPlanPrompt(ctx: ActionPlanContext): string {
  const claimList = ctx.claims
    .map((c, i) => `  ${i + 1}. [${c.id}] ${c.text}`)
    .join('\n')

  const stanceList = ctx.currentStances.length > 0
    ? ctx.currentStances
        .map(s => `  - Claim ${s.claimId}: ${s.stance} (confidence: ${s.confidence})`)
        .join('\n')
    : '  (no prior stances)'

  return `You are deciding whether to speak in a structured debate. Based on the current state, decide your next action.

## Claims Under Debate
${claimList}

## Your Current Stances
${stanceList}

## Blackboard (Shared State)
${ctx.blackboardSummary}

## Recent Discussion
${ctx.recentMessages || '(no messages yet)'}

## Instructions
Decide what to do next:
- **speak**: You have a new argument, evidence, or rebuttal to contribute.
- **interrupt**: Someone made an urgent factual error or logical fallacy that must be corrected immediately.
- **listen**: The current thread is productive and you have nothing new to add right now.

Set urgency from 0.0 (no desire to speak) to 1.0 (critical that you speak next).
- 0.0-0.3: Low urgency — you could speak but others may have more to say
- 0.4-0.6: Moderate — you have a meaningful contribution
- 0.7-0.9: High — you have important evidence or a strong rebuttal
- 1.0: Maximum — urgent correction or critical new information

Respond with ONLY valid JSON:
{
  "action": "speak" | "interrupt" | "listen",
  "urgency": 0.0-1.0,
  "intent": "one sentence describing what you would say if selected"
}

No text outside the JSON.`
}

// ─── Classical Agent Turn (Classical Mode) ──────────────────

export interface ClassicalAgentTurnContext {
  blackboardSummary: string
  localNeighborhood: string
  claims: Claim[]
  currentStances: AgentStance[]
  intent: string
}

export function classicalAgentTurnPrompt(ctx: ClassicalAgentTurnContext): string {
  const claimList = ctx.claims
    .map((c, i) => `  ${i + 1}. [${c.id}] ${c.text}`)
    .join('\n')

  const stanceList = ctx.currentStances.length > 0
    ? ctx.currentStances
        .map(s => `  - Claim ${s.claimId}: ${s.stance} (confidence: ${s.confidence})`)
        .join('\n')
    : '  (no prior stances)'

  return `You are participating in a structured debate. You have been selected as the next speaker.

## Your Intent
You indicated you want to: ${ctx.intent}

## Claims Under Debate
${claimList}

## Your Previous Stances
${stanceList}

## Blackboard (Shared State)
${ctx.blackboardSummary}

## Recent Discussion
${ctx.localNeighborhood || '(opening round)'}

## Instructions
Deliver your contribution, staying focused on your stated intent. Respond to EACH claim individually. For each claim, write a focused 1-2 sentence response (~40-60 words) that engages with that specific claim. Reference specific evidence. Address disagreements with other participants on that point. Update your stance if new arguments warrant it.

Respond with ONLY valid JSON matching this schema:
{
  "claimResponses": [
    {
      "claimId": "claim id",
      "response": "Your 1-2 sentence response addressing this specific claim (~40-60 words). Plain text ONLY — no markdown, no asterisks, no bold/italic formatting.",
      "stance": "pro" | "con" | "uncertain",
      "confidence": 0.0-1.0
    }
  ],
  "newCruxes": ["any new disputed propositions you identify"],
  "flipTriggers": ["any of your flip conditions that were triggered this round"]
}

You MUST include one entry in claimResponses for EVERY claim listed above. Be specific and concise. No text outside the JSON. No markdown formatting anywhere.`
}
