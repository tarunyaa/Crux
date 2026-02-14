import type { Argument, Attack, Labelling, Label, ArgumentationGraphState } from '@/lib/types/graph'
import type { DialogueTurn, DialogueMove } from '@/lib/types/debate-engine'

// ─── Opening Statement Prompt ──────────────────────────────

export function openingStatementPrompt(topic: string): string {
  return `You are participating in a structured debate on: "${topic}"

State your position on this topic. Be direct and concise — 4-6 sentences maximum.

Respond with ONLY valid JSON:
{
  "dialogue": "Your opening position in your own voice. 4-6 sentences.",
  "move": "CLAIM"
}

No text outside the JSON.`
}

// ─── Dialogue Turn Prompt ──────────────────────────────────

export function dialogueTurnPrompt(
  topic: string,
  recentDialogue: DialogueTurn[],
  steeringHint: string | null,
  phase: number,
): string {
  const dialogueBlock = recentDialogue
    .map(t => `[${t.move}] ${t.personaId}: ${t.dialogue}`)
    .join('\n')

  const moveList = phase >= 3
    ? `CLAIM, CHALLENGE, CLARIFY, CONCEDE, REFRAME, PROPOSE_CRUX`
    : `CLAIM, CHALLENGE, CLARIFY, CONCEDE, REFRAME`

  const steeringBlock = steeringHint
    ? `\n## Moderator Note\n${steeringHint}\n`
    : ''

  return `You are participating in a structured debate on: "${topic}"

## Recent Conversation
${dialogueBlock}
${steeringBlock}
## Your Task
Respond naturally in your own voice. Keep it short — 2-4 sentences maximum. Respond directly to what was just said.

Available moves: ${moveList}
- CLAIM: Assert a new position
- CHALLENGE: Directly dispute what was just said
- CLARIFY: Ask for or provide precision on a term or claim
- CONCEDE: Grant a point you find compelling (partially or fully)
- REFRAME: Redirect to what you think actually matters${phase >= 3 ? '\n- PROPOSE_CRUX: Name what you believe the core disagreement is' : ''}

You CAN and SHOULD concede points when the evidence or reasoning warrants it. Conceding makes you more credible, not weaker.

Respond with ONLY valid JSON:
{
  "dialogue": "Your response in 2-4 sentences",
  "move": "CHALLENGE"
}

No text outside the JSON.`
}

// ─── Crystallization Prompt ────────────────────────────────

export function crystallizationPrompt(
  topic: string,
  dialogueCluster: DialogueTurn[],
  state: ArgumentationGraphState,
): string {
  // Format current graph as readable table
  const argTable = state.arguments.length > 0
    ? state.arguments.map(a => {
        const label: Label = state.labelling.labels.get(a.id) ?? 'UNDEC'
        const assumptions = a.assumptions.length > 0 ? ` | Assumptions: ${a.assumptions.join('; ')}` : ''
        return `  [${a.id}] [${label}] (${a.speakerId}): ${a.claim}${assumptions}`
      }).join('\n')
    : '  (no arguments yet)'

  const attackTable = state.attacks.length > 0
    ? state.attacks.map(atk => {
        return `  ${atk.fromArgId} → ${atk.toArgId} (${atk.type}, targets ${atk.target.component})`
      }).join('\n')
    : '  (no attacks yet)'

  const dialogueBlock = dialogueCluster
    .map(t => `  [Turn ${t.turnIndex}] ${t.personaId} (${t.move}): ${t.dialogue}`)
    .join('\n')

  return `You are analyzing a debate on "${topic}" to extract formal argument positions from recent conversation.

## Current Argument Graph
Arguments:
${argTable}

Attacks:
${attackTable}

## Recent Dialogue (since last crystallization)
${dialogueBlock}

## Instructions
Extract substantive positions from this dialogue into formal arguments.

Rules:
- Do NOT create a node for every sentence — only for genuine positions with supporting reasoning
- If a speaker conceded a point, mark the relevant existing argument for removal (removedArgIds) or update it (updatedArgs)
- If a speaker narrowed or refined their claim, UPDATE the existing argument rather than creating a new one
- If two speakers are making the same claim, don't create duplicates
- Each new argument needs: claim, premises, assumptions, evidence, speakerId
- Identify attack relationships between arguments (new attacks)
- If an attack is no longer valid (e.g., the attacking argument was conceded), mark it for removal
- Use existing argument IDs when referencing targets (e.g., "arg-0", "arg-1")

For new arguments, use IDs starting from "arg-NEW-0", "arg-NEW-1", etc. The engine will assign real IDs.

Respond with ONLY valid JSON:
{
  "newArgs": [
    {
      "speakerId": "persona-id",
      "claim": "the position",
      "premises": ["supporting premise"],
      "assumptions": ["underlying assumption"],
      "evidence": ["specific evidence"]
    }
  ],
  "updatedArgs": [
    {
      "id": "arg-0",
      "claim": "updated claim text if changed",
      "assumptions": ["updated assumptions if changed"]
    }
  ],
  "removedArgIds": ["arg-1"],
  "newAttacks": [
    {
      "fromArgId": "arg-NEW-0",
      "toArgId": "arg-0",
      "type": "rebut",
      "targetComponent": "claim",
      "targetIndex": 0,
      "counterProposition": "what the attacking argument asserts",
      "rationale": "why this is a valid attack"
    }
  ],
  "removedAttackIds": []
}

If nothing substantive changed in this dialogue cluster, return empty arrays for everything.

No text outside the JSON.`
}

// ─── Centralized Discovery Prompt ──────────────────────────
// Reused from v1 — discovers initial attack relationships

export function centralizedDiscoveryPrompt(
  allArgs: Argument[],
  topic: string,
): string {
  const argList = allArgs.map(arg => {
    const premises = arg.premises.map((p, i) => `    premise[${i}]: ${p}`).join('\n')
    const assumptions = arg.assumptions.map((a, i) => `    assumption[${i}]: ${a}`).join('\n')
    return `[${arg.id}] (by ${arg.speakerId})
  claim: ${arg.claim}
${premises}
${assumptions}`
  }).join('\n\n')

  return `You are a neutral judge analyzing arguments in a structured debate. Your job is to discover ALL valid attack relationships between the arguments below.

## Topic
"${topic}"

## All Arguments
${argList}

## Instructions
For each pair of arguments that conflict, identify the attack:
- **rebut**: Directly opposing claims
- **undermine**: One argument challenges a specific premise or evidence of another
- **undercut**: One argument shows that another's premises don't actually support its conclusion

Rules:
- Arguments by the SAME speaker can still be in tension (but this is rare)
- Be thorough — find ALL genuine conflicts
- Each attack must target a specific component (claim, premise[N], or assumption[N])
- Rate confidence 0.0-1.0 (how clear-cut is the conflict?)
- Also validate each attack (is it logically sound?)

Respond with ONLY valid JSON:
{
  "attacks": [
    {
      "fromArgId": "attacking argument ID",
      "toArgId": "target argument ID",
      "type": "rebut" | "undermine" | "undercut",
      "targetComponent": "claim" | "premise" | "assumption",
      "targetIndex": 0,
      "counterProposition": "what the attacking argument asserts against the target",
      "rationale": "why this is a valid attack",
      "evidence": [],
      "confidence": 0.8,
      "valid": true,
      "attackStrength": 0.8
    }
  ]
}

Find ALL attacks. No text outside the JSON.`
}

// ─── Resolution Prompt ─────────────────────────────────────

export function resolutionPrompt(
  topic: string,
  recentDialogue: DialogueTurn[],
): string {
  const dialogueBlock = recentDialogue
    .map(t => `[${t.move}] ${t.personaId}: ${t.dialogue}`)
    .join('\n')

  return `You are wrapping up a structured debate on: "${topic}"

## Full Conversation
${dialogueBlock}

## Your Task
Summarize in 3-5 sentences:
1. What you agree with the other speaker on
2. What you still disagree about
3. What you think the core unresolved question is

Be honest and concise. If you changed your mind on anything during this debate, say so.

Respond with ONLY valid JSON:
{
  "dialogue": "Your summary in 3-5 sentences",
  "move": "CLAIM"
}

No text outside the JSON.`
}
