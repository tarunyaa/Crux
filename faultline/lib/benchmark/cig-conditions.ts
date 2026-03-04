// ─── CIG Benchmark Condition Runners ──────────────────────
//
// Condition runners for the CIG benchmark.
// Used by scripts/run-cig-benchmark-v2.ts.

import { complete, completeJSON } from '@/lib/llm/client'
import { extractQBAF } from '@/lib/belief-graph/extract-qbaf'
import { structuralDiff, buildCommunityGraph, identifyCruxes } from '@/lib/belief-graph/community-graph'
import { determineTargetStrength, reviseBeliefs, applyRevision } from '@/lib/belief-graph/belief-revision'
import { runDialogue } from '@/lib/dialogue/orchestrator'
import type { DialogueEvent, PersonaId } from '@/lib/dialogue/types'
import type { CruxCard as DialogueCruxCard } from '@/lib/crux/types'
import type { Persona, PersonaContract } from '@/lib/types'
import type { PersonaQBAF } from '@/lib/belief-graph/types'

// ─── Types ──────────────────────────────────────────────────

export interface RoleDefinition {
  id: string
  label: string
  brief: string
}

export interface CIGTask {
  id: string
  topic: string
  category: string
  roles: RoleDefinition[]
}

export type Condition = 'single' | 'cot' | 'dialogue' | 'belief-graph'

export interface CruxCard {
  hingeQuestion: string
  roleA: { id: string; position: string; falsifier: string }
  roleB: { id: string; position: string; falsifier: string }
}

export interface ConditionOutput {
  rawOutput: string
  assumptions: string[]
  cruxCards: CruxCard[]
}

// ─── Helpers ────────────────────────────────────────────────

export async function extractAssumptions(rawText: string): Promise<string[]> {
  const result = await completeJSON<{ assumptions: string[] }>({
    system: 'Extract a clean list of decisive assumptions from the provided analysis. Each should be a single clear sentence stating a specific testable variable.',
    messages: [{
      role: 'user',
      content: `Extract the decisive assumptions from this analysis as a JSON array of strings. Each assumption should be a clear, specific, testable statement.

${rawText}

Output JSON:
{
  "assumptions": ["assumption 1", "assumption 2", ...]
}`,
    }],
    model: 'haiku',
    maxTokens: 1024,
    temperature: 0.2,
  })

  return result.assumptions ?? []
}

export async function deduplicateAssumptions(rawAssumptions: string[], topic: string): Promise<string[]> {
  const result = await completeJSON<{ assumptions: string[] }>({
    system: 'You deduplicate and clean a list of assumptions. Merge semantically identical items. Keep each assumption as a single clear, specific, testable statement. Remove vague or untestable items.',
    messages: [{
      role: 'user',
      content: `Topic: "${topic}"

## Raw assumptions (may contain duplicates)
${rawAssumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Deduplicate this list. Merge items that say the same thing in different words. Keep the most specific wording. Output 8-15 unique assumptions.

Output JSON:
{
  "assumptions": ["assumption 1", "assumption 2", ...]
}`,
    }],
    model: 'haiku',
    maxTokens: 2048,
    temperature: 0.2,
  })

  return result.assumptions ?? []
}

async function extractCruxCardsFromSynthesis(rawOutput: string, task: CIGTask): Promise<CruxCard[]> {
  const roleIds = task.roles.map(r => r.id)
  const result = await completeJSON<{
    cruxes: Array<{
      hingeQuestion: string
      roleA: { id: string; position: string; falsifier: string }
      roleB: { id: string; position: string; falsifier: string }
    }>
  }>({
    system: `Extract structured crux cards from a strategic analysis. Each crux should identify the single hinge question that would settle a disagreement between two roles. Valid role IDs: ${roleIds.join(', ')}`,
    messages: [{
      role: 'user',
      content: `Extract the crux cards from this analysis. For each crux/contradiction identified, output a structured card:

${rawOutput}

Output JSON:
{
  "cruxes": [
    {
      "hingeQuestion": "Whether [specific testable variable]",
      "roleA": { "id": "role-id", "position": "their position in 1 sentence", "falsifier": "evidence that would prove them wrong" },
      "roleB": { "id": "role-id", "position": "their position in 1 sentence", "falsifier": "evidence that would prove them wrong" }
    }
  ]
}`,
    }],
    model: 'haiku',
    maxTokens: 2048,
    temperature: 0.2,
  })

  return (result.cruxes ?? []).map(c => ({
    hingeQuestion: c.hingeQuestion,
    roleA: { id: c.roleA?.id ?? '', position: c.roleA?.position ?? '', falsifier: c.roleA?.falsifier ?? '' },
    roleB: { id: c.roleB?.id ?? '', position: c.roleB?.position ?? '', falsifier: c.roleB?.falsifier ?? '' },
  }))
}

// ─── Condition 1: Single Model (Role-Voiced) ────────────────

export async function runSingleCondition(task: CIGTask): Promise<ConditionOutput> {
  const rolesBlock = task.roles
    .map(r => `- **${r.label}** (${r.id}): ${r.brief}`)
    .join('\n')

  const rawOutput = await complete({
    system: `You are a strategic analyst. You will adopt multiple expert personas to analyze a decision question, then synthesize their views into a single defining crux.`,
    messages: [{
      role: 'user',
      content: `Decision question: "${task.topic}"

## Step 1: Role Perspectives
Adopt each of these expert personas and state their position on the question. For each role, write 2-3 sentences of opinionated analysis and list 2-3 decisive assumptions from their domain:

${rolesBlock}

## Step 2: Identify Contradictions
Where do these roles genuinely disagree? Identify 2-4 specific contradictions between the role perspectives.

## Step 3: Synthesize the Defining Crux
From the contradictions, identify the single most decisive variable — the one assumption that, if resolved, would settle the question. State it as:
- A specific, testable hinge question
- Each side's position on it
- What observable evidence would falsify each side

## Step 4: List Decisive Assumptions
List 5-8 decisive assumptions drawn from all role perspectives. Each should be a specific, testable variable.`,
    }],
    model: 'sonnet',
    maxTokens: 4096,
    temperature: 0.7,
  })

  const cruxCards = await extractCruxCardsFromSynthesis(rawOutput, task)
  const assumptions = await extractAssumptions(rawOutput)
  return { rawOutput, assumptions, cruxCards }
}

// ─── Condition 2: Chain-of-Thought (Role-Voiced) ────────────

export async function runCoTCondition(task: CIGTask): Promise<ConditionOutput> {
  const rolesBlock = task.roles
    .map(r => `- **${r.label}** (${r.id}): ${r.brief}`)
    .join('\n')

  const rawOutput = await complete({
    system: `You are a strategic analyst. Think step by step. You will adopt multiple expert personas, reason through their positions in detail, then synthesize into a single defining crux.`,
    messages: [{
      role: 'user',
      content: `Decision question: "${task.topic}"

## Step 1: Deep Role Analysis
For each expert role below, think step by step through their domain. What data and evidence would they cite? What are the strongest arguments from their perspective? What are their blind spots? Write a detailed analysis (3-5 sentences) and list 3-4 decisive assumptions:

${rolesBlock}

## Step 2: Cross-Role Contradictions
Think step by step about where these experts genuinely disagree. For each contradiction:
- Which roles conflict?
- What specific variable do they predict differently?
- Why can't both be right?

Identify 3-5 genuine contradictions.

## Step 3: Synthesize the Defining Crux
Reason through which contradiction is most decisive — the one where resolving the disagreement would most change the answer to the question. State:
- The hinge question as a specific, testable variable
- Each side's position with supporting evidence
- What observable data would settle it within 2 years
- Why this crux matters more than the others

## Step 4: List Decisive Assumptions
List 5-8 decisive assumptions drawn from all role perspectives. Each should be a specific, testable variable with clear evidence that would falsify it.`,
    }],
    model: 'sonnet',
    maxTokens: 6144,
    temperature: 0.7,
  })

  const cruxCards = await extractCruxCardsFromSynthesis(rawOutput, task)
  const assumptions = await extractAssumptions(rawOutput)
  return { rawOutput, assumptions, cruxCards }
}

// ─── Condition 3: Real Dialogue + Crux Room ─────────────────

export async function runDialogueCondition(task: CIGTask): Promise<ConditionOutput> {
  console.log(`    Running real dialogue with ${task.roles.length} synthetic personas...`)

  // Build synthetic personas from roles
  const synths = task.roles.map(role => ({ role, ...buildSyntheticPersona(role) }))
  const personaIds = synths.map(s => s.persona.id) as PersonaId[]

  const preloadedPersonas = new Map<PersonaId, { persona: Persona; contract: PersonaContract }>()
  for (const s of synths) {
    preloadedPersonas.set(s.persona.id, { persona: s.persona, contract: s.contract })
  }

  // Collect all events from the real dialogue system
  const events: DialogueEvent[] = []
  const cruxCards: DialogueCruxCard[] = []
  const messages: Array<{ personaId: string; content: string; phase?: string }> = []

  for await (const event of runDialogue({
    topic: task.topic,
    personaIds,
    preloadedPersonas,
  })) {
    events.push(event)

    if (event.type === 'message_posted') {
      messages.push({
        personaId: event.message.personaId,
        content: event.message.content,
        phase: event.phase,
      })
    } else if (event.type === 'crux_card_posted') {
      cruxCards.push(event.card)
    }
  }

  // Build raw output from messages + crux cards
  const rawParts: string[] = []
  const pidToLabel = new Map(synths.map(s => [s.persona.id, s.role.label]))

  rawParts.push(`## Dialogue: ${synths.map(s => s.role.label).join(' / ')}\n`)

  // Opening messages
  const openings = messages.filter(m => m.phase === 'opening')
  if (openings.length > 0) {
    rawParts.push('### Opening Statements')
    for (const m of openings) {
      rawParts.push(`**${pidToLabel.get(m.personaId) ?? m.personaId}:** ${m.content}\n`)
    }
  }

  // Takes
  const takes = messages.filter(m => m.phase === 'take')
  if (takes.length > 0) {
    rawParts.push('### Discussion')
    for (const m of takes) {
      rawParts.push(`**${pidToLabel.get(m.personaId) ?? m.personaId}:** ${m.content}\n`)
    }
  }

  // Crux cards
  if (cruxCards.length > 0) {
    rawParts.push('### Crux Cards')
    for (const card of cruxCards) {
      rawParts.push(`**${card.question}**`)
      rawParts.push(`- Diagnosis: ${card.diagnosis}`)
      rawParts.push(`- Personas: ${Object.keys(card.personas).join(', ')}`)
      for (const [pid, info] of Object.entries(card.personas)) {
        rawParts.push(`  - ${pidToLabel.get(pid) ?? pid}: ${info.position} — ${info.reasoning}`)
      }
      rawParts.push('')
    }
  }

  // Closings
  const closings = messages.filter(m => m.phase === 'closing')
  if (closings.length > 0) {
    rawParts.push('### Closing Statements')
    for (const m of closings) {
      rawParts.push(`**${pidToLabel.get(m.personaId) ?? m.personaId}:** ${m.content}\n`)
    }
  }

  const rawOutput = rawParts.join('\n')

  // Extract assumptions from crux cards + closing messages
  const assumptionSources: string[] = [
    ...cruxCards.map(c => c.question),
    ...cruxCards.flatMap(c =>
      Object.values(c.personas).map(p => p.falsifier).filter((f): f is string => !!f)
    ),
    ...closings.map(m => m.content),
  ]

  const assumptions = await deduplicateAssumptions(
    assumptionSources.length > 0 ? assumptionSources : messages.map(m => m.content),
    task.topic,
  )

  // Convert dialogue crux cards to benchmark CruxCard format
  const benchmarkCruxCards: CruxCard[] = cruxCards.map(card => {
    const personaEntries = Object.entries(card.personas)
    const [pidA, infoA] = personaEntries[0] ?? ['', { position: 'unknown', reasoning: '', falsifier: '' }]
    const [pidB, infoB] = personaEntries[1] ?? ['', { position: 'unknown', reasoning: '', falsifier: '' }]
    return {
      hingeQuestion: card.question,
      roleA: {
        id: pidA.replace('bench-', ''),
        position: `${infoA.position}: ${infoA.reasoning}`,
        falsifier: infoA.falsifier ?? '',
      },
      roleB: {
        id: pidB.replace('bench-', ''),
        position: `${infoB.position}: ${infoB.reasoning}`,
        falsifier: infoB.falsifier ?? '',
      },
    }
  })

  return { rawOutput, assumptions, cruxCards: benchmarkCruxCards }
}

// ─── Condition 4: Belief Graph ──────────────────────────────

function buildSyntheticPersona(role: RoleDefinition): { persona: Persona; contract: PersonaContract } {
  const persona: Persona = {
    id: `bench-${role.id}`,
    name: role.label,
    twitterHandle: '',
    twitterPicture: '',
    deckIds: [],
    suite: null,
    locked: false,
  }

  const contract: PersonaContract = {
    personaId: persona.id,
    version: new Date().toISOString(),
    personality: `You are a ${role.label}. Your expertise: ${role.brief}. Be opinionated and take clear positions.`,
    bias: `You prioritize factors within your domain: ${role.brief}. You believe your domain holds the decisive variables.`,
    stakes: `Your professional credibility depends on correctly identifying the decisive assumptions within ${role.brief}.`,
    epistemology: 'Evidence-based, data-driven. You demand specific numbers, timelines, and testable predictions.',
    timeHorizon: '2-5 year forward outlook. Focus on what is testable within this window.',
    flipConditions: 'You change your mind when presented with concrete data that contradicts your core assumptions.',
    evidencePolicy: {
      acceptableSources: ['industry data', 'company filings', 'expert analysis', 'empirical studies'],
      unacceptableSources: ['speculation', 'anecdotal evidence'],
      weightingRules: 'Prioritize recent data (last 12 months) and first-party sources.',
      toolPullTriggers: 'When quantitative claims are made, pull primary data sources for verification.',
    },
    anchorExcerpts: [],
  }

  return { persona, contract }
}

function getRootStrength(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0
}

export async function runBeliefGraphCondition(task: CIGTask): Promise<ConditionOutput> {
  const synths = task.roles.map(role => ({ role, ...buildSyntheticPersona(role) }))
  console.log(`    Using ${synths.length} roles: ${synths.map(s => s.role.label).join(', ')}`)

  console.log(`    Phase 1: QBAF extraction (${synths.length} roles)...`)
  const qbafs = await Promise.all(
    synths.map(s => extractQBAF(s.persona, s.contract, task.topic))
  )
  for (let i = 0; i < synths.length; i++) {
    console.log(`      ${synths[i].role.label}: ${qbafs[i].nodes.length} nodes, root σ=${getRootStrength(qbafs[i]).toFixed(3)}`)
  }

  console.log(`    Phase 2: Structural diffs...`)
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < synths.length; i++) {
    for (let j = i + 1; j < synths.length; j++) {
      pairs.push([i, j])
    }
  }
  const diffs = await Promise.all(
    pairs.map(([i, j]) => structuralDiff(qbafs[i], qbafs[j]))
  )
  for (let p = 0; p < pairs.length; p++) {
    const [i, j] = pairs[p]
    const d = diffs[p]
    console.log(`      ${synths[i].role.label} vs ${synths[j].role.label}: ${d.contradictions.length} contradictions, ${d.agreements.length} agreements, ${d.gaps.length} gaps`)
  }

  const currentQbafs = [...qbafs]
  for (let i = 0; i < synths.length; i++) {
    const pid = currentQbafs[i].personaId
    const contradictionClaims: string[] = []

    for (const diff of diffs) {
      if (diff.personaA === pid) {
        for (const c of diff.contradictions) {
          const opponentQbaf = currentQbafs.find(q => q.personaId === diff.personaB)
          const node = opponentQbaf?.nodes.find(n => n.id === c.nodeIdB)
          if (node) contradictionClaims.push(node.claim)
        }
      } else if (diff.personaB === pid) {
        for (const c of diff.contradictions) {
          const opponentQbaf = currentQbafs.find(q => q.personaId === diff.personaA)
          const node = opponentQbaf?.nodes.find(n => n.id === c.nodeIdA)
          if (node) contradictionClaims.push(node.claim)
        }
      }
    }

    if (contradictionClaims.length > 0) {
      const { target } = await determineTargetStrength(currentQbafs[i], contradictionClaims, synths[i].role.label, synths[i].contract)
      const revision = reviseBeliefs(currentQbafs[i], target)
      currentQbafs[i] = applyRevision(currentQbafs[i], revision)
    }
  }
  console.log(`      Post-revision: ${synths.map((s, i) => `${s.role.label} σ=${getRootStrength(currentQbafs[i]).toFixed(3)}`).join(', ')}`)

  console.log(`    Phase 3: Community graph...`)
  const communityGraph = await buildCommunityGraph(currentQbafs, 0.3, 0.1)
  console.log(`      ${communityGraph.nodes.length} community nodes, ${communityGraph.cruxNodes.length} crux nodes`)

  console.log(`    Phase 4: Structural crux identification...`)
  const cruxes = await identifyCruxes(communityGraph, currentQbafs, 5)
  console.log(`      ${cruxes.length} structural cruxes identified`)

  const rawParts: string[] = []
  const pidToLabel = new Map(synths.map(s => [`bench-${s.role.id}`, s.role.label]))

  rawParts.push(`## Belief Graph Analysis: ${synths.map(s => s.role.label).join(' / ')}\n`)

  for (let i = 0; i < synths.length; i++) {
    const root = currentQbafs[i].nodes.find(n => n.id === currentQbafs[i].rootClaim)
    rawParts.push(`### ${synths[i].role.label} Root`)
    rawParts.push(`Claim: ${root?.claim}`)
    rawParts.push(`Dialectical strength: σ=${getRootStrength(currentQbafs[i]).toFixed(3)}`)
    rawParts.push(`Arguments: ${currentQbafs[i].nodes.length} nodes\n`)
  }

  if (cruxes.length > 0) {
    rawParts.push('## Structural Cruxes\n')
    for (const crux of cruxes) {
      rawParts.push(`### ${crux.claim}`)
      rawParts.push(`Crux score: ${crux.cruxScore.toFixed(3)}`)
      rawParts.push(`Disagreement type: ${crux.disagreementType}`)
      rawParts.push(`Settling question: ${crux.settlingQuestion}`)
      for (const [pid, pos] of Object.entries(crux.personaPositions)) {
        const label = pidToLabel.get(pid) ?? pid
        rawParts.push(`- ${label}: τ=${pos.baseScore.toFixed(2)}, σ=${pos.dialecticalStrength.toFixed(2)}, impact=${pos.contribution.toFixed(3)}`)
      }
      rawParts.push('')
    }
  }

  const rawOutput = rawParts.join('\n')

  const cruxCards: CruxCard[] = cruxes.map(crux => {
    const positions = Object.entries(crux.personaPositions)
    let maxDiff = 0
    let bestA = positions[0]
    let bestB = positions[1] ?? positions[0]
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const diff = Math.abs(positions[i][1].contribution - positions[j][1].contribution)
        if (diff > maxDiff) {
          maxDiff = diff
          bestA = positions[i]
          bestB = positions[j]
        }
      }
    }

    const roleIdA = bestA[0].replace('bench-', '')
    const roleIdB = bestB[0].replace('bench-', '')
    return {
      hingeQuestion: crux.settlingQuestion || crux.claim,
      roleA: { id: roleIdA, position: `τ=${bestA[1].baseScore.toFixed(2)}, impact=${bestA[1].contribution.toFixed(3)}`, falsifier: crux.counterfactual },
      roleB: { id: roleIdB, position: `τ=${bestB[1].baseScore.toFixed(2)}, impact=${bestB[1].contribution.toFixed(3)}`, falsifier: '' },
    }
  })

  const assumptionSources = [
    ...cruxes.map(c => c.claim),
    ...cruxes.map(c => c.settlingQuestion).filter(Boolean),
    ...currentQbafs.flatMap(q => q.nodes.filter(n => n.depth <= 1).map(n => n.claim)),
  ]

  const assumptions = await deduplicateAssumptions(assumptionSources, task.topic)

  return { rawOutput, assumptions, cruxCards }
}
