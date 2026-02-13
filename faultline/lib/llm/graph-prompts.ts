import type { Claim } from '@/lib/types'
import type { AnchorExcerpt } from '@/lib/types'
import type { Argument, Labelling, Label } from '@/lib/types/graph'

// ─── Initial Argument Generation ────────────────────────────

export function initialArgumentPrompt(
  topic: string,
  claims: Claim[],
  anchorExcerpts: AnchorExcerpt[],
): string {
  const claimList = claims
    .map((c, i) => `  ${i + 1}. [${c.id}] ${c.text}`)
    .join('\n')

  const excerptBlock = anchorExcerpts.length > 0
    ? `\n## Your Prior Statements (for reference)\n${anchorExcerpts.slice(0, 3).map(e => `- "${e.content}" (${e.source}, ${e.date})`).join('\n')}\n`
    : ''

  return `You are participating in a structured argumentation debate. Generate 2-4 formal arguments addressing the claims below.

## Topic
"${topic}"

## Claims Under Debate
${claimList}
${excerptBlock}
## Instructions
For each argument:
- **claim**: Your main proposition (one sentence)
- **premises**: 1-3 supporting premises that logically lead to the claim
- **assumptions**: 0-2 underlying assumptions your argument rests on
- **evidence**: 0-2 specific pieces of evidence (name sources)

Each argument should address one or more of the claims above. Be specific and decisive.

Also provide your initial stance on EACH claim under debate.

Respond with ONLY valid JSON:
{
  "stances": [
    {
      "claimId": "claim id",
      "stance": "pro" | "con" | "uncertain",
      "confidence": 0.0-1.0,
      "reasoning": "one sentence explaining your position"
    }
  ],
  "arguments": [
    {
      "claim": "your proposition",
      "relatedClaimId": "the claim ID this argument most directly addresses",
      "premises": ["premise 1", "premise 2"],
      "assumptions": ["assumption if any"],
      "evidence": ["specific evidence if any"]
    }
  ]
}

You MUST include one stance entry for EVERY claim. Return 2-4 arguments. No text outside the JSON.`
}

// ─── Attack Generation ──────────────────────────────────────

export function attackGenerationPrompt(
  allArguments: Argument[],
  ownArgIds: Set<string>,
  topic: string,
  labelling: Labelling,
): string {
  const argList = allArguments.map(arg => {
    const label: Label = labelling.labels.get(arg.id) ?? 'UNDEC'
    const own = ownArgIds.has(arg.id) ? ' (YOUR ARGUMENT)' : ''
    const premises = arg.premises.map((p, i) => `    premise[${i}]: ${p}`).join('\n')
    const assumptions = arg.assumptions.map((a, i) => `    assumption[${i}]: ${a}`).join('\n')
    return `[${arg.id}] [${label}]${own}
  claim: ${arg.claim}
${premises}
${assumptions}`
  }).join('\n\n')

  return `You are attacking arguments in a formal debate. Review all arguments below and generate attacks against arguments you disagree with.

## Topic
"${topic}"

## All Arguments (with current status: IN=accepted, OUT=defeated, UNDEC=undecided)
${argList}

## Rules
- You CANNOT attack your own arguments (marked "YOUR ARGUMENT")
- Target specific components using their index: claim, premise[N], or assumption[N]
- Attack types:
  - **rebut**: Directly oppose the claim with a counter-claim
  - **undermine**: Challenge a specific premise or piece of evidence
  - **undercut**: Show that premises don't support the conclusion (even if premises are true)

## Instructions
Generate 0-4 attacks. For each attack, also provide a counter-argument that supports your attack.

Respond with ONLY valid JSON:
{
  "attacks": [
    {
      "toArgId": "target argument ID",
      "type": "rebut" | "undermine" | "undercut",
      "targetComponent": "claim" | "premise" | "assumption",
      "targetIndex": 0,
      "counterProposition": "your counter-claim (one sentence)",
      "rationale": "why this attack succeeds (one sentence)",
      "evidence": ["evidence if any"],
      "confidence": 0.0-1.0,
      "counterArgument": {
        "claim": "the claim of your new counter-argument",
        "premises": ["premise supporting your counter"],
        "assumptions": [],
        "evidence": []
      }
    }
  ]
}

Return 0-4 attacks. If you agree with all arguments, return {"attacks": []}. No text outside the JSON.`
}

// ─── Batch Validation ───────────────────────────────────────

export function batchValidationPrompt(
  attacks: { id: string; fromArgId: string; toArgId: string; type: string; counterProposition: string; rationale: string; target: { component: string; index: number } }[],
  arguments_: { id: string; claim: string; premises: string[]; assumptions: string[] }[],
): string {
  const argMap = new Map(arguments_.map(a => [a.id, a]))

  const attackDescriptions = attacks.map(atk => {
    const targetArg = argMap.get(atk.toArgId)
    const targetText = targetArg
      ? atk.target.component === 'claim'
        ? targetArg.claim
        : atk.target.component === 'premise'
          ? targetArg.premises[atk.target.index] ?? '(invalid index)'
          : targetArg.assumptions[atk.target.index] ?? '(invalid index)'
      : '(unknown argument)'

    return `[${atk.id}] Type: ${atk.type}
  Attacks: [${atk.toArgId}] ${atk.target.component}[${atk.target.index}] = "${targetText}"
  Counter: "${atk.counterProposition}"
  Rationale: "${atk.rationale}"`
  }).join('\n\n')

  return `You are a logic validator. Evaluate each attack for validity.

## Attacks to Validate
${attackDescriptions}

## Validation Criteria
1. No logical fallacy in the attack
2. The attack is relevant to the target component
3. The attack type is correct (rebut targets claims, undermine targets premises/evidence, undercut targets the inference)
4. The target component exists and the index is valid

For each attack, respond with:
- **valid**: true/false
- **attackStrength**: 0.0-1.0 (how compelling the attack is)
- **corrections**: null if valid, or a brief explanation of what's wrong

Respond with ONLY valid JSON:
{
  "validations": [
    {
      "attackId": "attack ID",
      "valid": true,
      "attackStrength": 0.8,
      "corrections": null
    }
  ]
}

Validate ALL ${attacks.length} attacks. No text outside the JSON.`
}
