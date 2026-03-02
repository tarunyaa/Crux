#!/usr/bin/env tsx
// ─── CIG Benchmark Runner ──────────────────────────────────
//
// Compares 3 conditions: single model, chain-of-thought, and
// role-based crux extraction. Scores with DAR/ANS/DFS/blindJudge.
//
// The crux condition uses role-based agents (Demand, Supply, etc.)
// instead of personality personas — cleaner signal for measuring
// whether structured disagreement extraction improves assumption discovery.
//
// Usage:
//   npx tsx scripts/run-cig-benchmark.ts
//   npx tsx scripts/run-cig-benchmark.ts --task hbm-pricing
//   npx tsx scripts/run-cig-benchmark.ts --task hbm-pricing --condition single

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { complete, completeJSON, resetUsage, getTotalUsage, type TokenUsage } from '@/lib/llm/client'
import { scoreDAR, scoreANS, scoreDFS, blindJudge } from '@/lib/benchmark/cig-scoring'
import type { DARResult, ANSResult, DFSResult, JudgeScores } from '@/lib/benchmark/cig-scoring'
import type { Persona, PersonaContract } from '@/lib/types'
import { extractQBAF } from '@/lib/belief-graph/extract-qbaf'
import { runDebateRound } from '@/lib/belief-graph/debate-round'
import { buildCommunityGraph, identifyCruxes } from '@/lib/belief-graph/community-graph'
import type { PersonaQBAF } from '@/lib/belief-graph/types'

// ─── Types ──────────────────────────────────────────────────

interface RoleDefinition {
  id: string
  label: string
  brief: string
}

interface CIGTask {
  id: string
  topic: string
  category: string
  roles: RoleDefinition[]
  decisiveAssumptions: string[]
}

type Condition = 'single' | 'cot' | 'crux' | 'belief-graph'

interface CruxCard {
  hingeQuestion: string
  roleA: { id: string; position: string; falsifier: string }
  roleB: { id: string; position: string; falsifier: string }
}

interface ConditionResult {
  rawOutput: string
  assumptions: string[]
  cruxCards?: CruxCard[]
  dar: DARResult
  dfs: DFSResult
  judge: JudgeScores
  ans?: ANSResult
  tokenUsage: TokenUsage
}

interface TaskResult {
  taskId: string
  topic: string
  timestamp: string
  conditions: Partial<Record<Condition, ConditionResult>>
  winner: string
}

interface SummaryResult {
  timestamp: string
  taskCount: number
  meanDAR: Record<string, number>
  winRates: Record<string, number>
  totalTokens: Record<string, TokenUsage>
}

// ─── CLI Args ───────────────────────────────────────────────

function parseArgs(): { taskId?: string; condition: Condition | 'all' } {
  const args = process.argv.slice(2)
  let taskId: string | undefined
  let condition: Condition | 'all' = 'all'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task' && args[i + 1]) {
      taskId = args[++i]
    } else if (args[i] === '--condition' && args[i + 1]) {
      condition = args[++i] as Condition | 'all'
    }
  }

  return { taskId, condition }
}

// ─── Condition 1: Single Model ──────────────────────────────

async function runSingleCondition(task: CIGTask): Promise<{ rawOutput: string; assumptions: string[] }> {
  const rawOutput = await complete({
    system: 'You are a strategic analyst identifying decisive assumptions — specific variables that, if they turned out differently than expected, would flip the conclusion.',
    messages: [{
      role: 'user',
      content: `Decision question: "${task.topic}"

Identify the decisive assumptions for this question. For each assumption:
1. State it clearly as a specific, testable variable
2. Explain why it's load-bearing (if wrong, the conclusion changes)

List 5-8 decisive assumptions.`,
    }],
    model: 'sonnet',
    maxTokens: 2048,
    temperature: 0.7,
  })

  const assumptions = await extractAssumptions(rawOutput)
  return { rawOutput, assumptions }
}

// ─── Condition 2: Chain-of-Thought ──────────────────────────

async function runCoTCondition(task: CIGTask): Promise<{ rawOutput: string; assumptions: string[] }> {
  const rawOutput = await complete({
    system: 'You are a strategic analyst. Think step by step, considering multiple perspectives before identifying decisive assumptions.',
    messages: [{
      role: 'user',
      content: `Decision question: "${task.topic}"

Think step by step. Consider multiple perspectives:
- For each major stakeholder, what assumptions are they making?
- What data or evidence could each side point to?
- Which assumptions are load-bearing — if wrong, the entire conclusion changes?
- What are the non-obvious second-order effects?

After your analysis, list 5-8 decisive assumptions. For each, explain:
1. The specific testable variable
2. Why it's load-bearing
3. Who is most exposed if this assumption is wrong`,
    }],
    model: 'sonnet',
    maxTokens: 4096,
    temperature: 0.7,
  })

  const assumptions = await extractAssumptions(rawOutput)
  return { rawOutput, assumptions }
}

// ─── Condition 3: Role-Based Crux Extraction ────────────────

interface RolePerspective {
  role: RoleDefinition
  analysis: string
  assumptions: string[]
}

interface Disagreement {
  roleA: string
  roleB: string
  topic: string
  roleAPosition: string
  roleBPosition: string
}

/**
 * Step 1: Each role agent produces their perspective in parallel.
 */
async function gatherRolePerspectives(
  task: CIGTask,
): Promise<RolePerspective[]> {
  const perspectives = await Promise.all(
    task.roles.map(async (role) => {
      const result = await completeJSON<{ analysis: string; assumptions: string[] }>({
        system: `You are a ${role.label} specializing in: ${role.brief}.

You are analyzing a decision question from your specific domain expertise. Be opinionated — take clear positions on what you think the decisive variables are. Don't hedge.`,
        messages: [{
          role: 'user',
          content: `Decision question: "${task.topic}"

From your domain (${role.brief}), identify the 3-4 decisive assumptions that would flip the answer to this question. For each:
1. State it as a specific, testable variable
2. Explain WHY it's load-bearing from your domain perspective
3. State what observable evidence would falsify it

Output JSON:
{
  "analysis": "2-3 paragraph analysis from your domain perspective",
  "assumptions": ["assumption 1", "assumption 2", "assumption 3"]
}`,
        }],
        model: 'sonnet',
        maxTokens: 2048,
        temperature: 0.7,
      })

      return {
        role,
        analysis: result.analysis ?? '',
        assumptions: result.assumptions ?? [],
      }
    })
  )

  return perspectives
}

/**
 * Step 2: Detect disagreements between role perspectives.
 */
async function detectDisagreements(
  task: CIGTask,
  perspectives: RolePerspective[],
): Promise<Disagreement[]> {
  const perspectivesText = perspectives
    .map(p => `### ${p.role.label} (${p.role.id})\n${p.analysis}\n\nAssumptions:\n${p.assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`)
    .join('\n\n---\n\n')

  const result = await completeJSON<{ disagreements: Array<{ roleA: string; roleB: string; topic: string; roleAPosition: string; roleBPosition: string }> }>({
    system: `You identify genuine disagreements between domain analysts. A disagreement exists when:
- One analyst's assumption directly contradicts another's
- Two analysts identify the same variable but predict opposite outcomes
- One analyst considers a factor decisive while another dismisses it

Do NOT manufacture disagreements. Only flag ones where the analysts genuinely conflict.`,
    messages: [{
      role: 'user',
      content: `Decision question: "${task.topic}"

## Analyst Perspectives
${perspectivesText}

Identify 3-5 genuine disagreements between these analysts. For each:
- roleA / roleB: the role IDs (e.g. "demand", "supply")
- topic: what they disagree about (1 sentence)
- roleAPosition: what Role A believes (1 sentence)
- roleBPosition: what Role B believes (1 sentence)

Output JSON:
{
  "disagreements": [
    { "roleA": "...", "roleB": "...", "topic": "...", "roleAPosition": "...", "roleBPosition": "..." }
  ]
}`,
    }],
    model: 'sonnet',
    maxTokens: 2048,
    temperature: 0.3,
  })

  return result.disagreements ?? []
}

/**
 * Step 3: For each disagreement, extract the crux — hinge question + falsifiers.
 */
async function extractCruxes(
  task: CIGTask,
  disagreements: Disagreement[],
  perspectives: RolePerspective[],
): Promise<CruxCard[]> {
  const roleMap = new Map(perspectives.map(p => [p.role.id, p]))

  const cruxCards = await Promise.all(
    disagreements.map(async (d) => {
      const roleALabel = roleMap.get(d.roleA)?.role.label ?? d.roleA
      const roleBLabel = roleMap.get(d.roleB)?.role.label ?? d.roleB

      const result = await completeJSON<{
        hingeQuestion: string
        roleA: { position: string; falsifier: string }
        roleB: { position: string; falsifier: string }
      }>({
        system: `You extract the crux of a disagreement between two domain analysts. The crux is the single testable variable that, if resolved, would settle the disagreement. Be specific and concrete.`,
        messages: [{
          role: 'user',
          content: `Decision question: "${task.topic}"

## Disagreement
**${roleALabel}** believes: ${d.roleAPosition}
**${roleBLabel}** believes: ${d.roleBPosition}
**Topic**: ${d.topic}

What is the single hinge question that would settle this? State it as a specific, testable variable.

For each side, provide a falsifier — what observable evidence would prove them wrong?

Output JSON:
{
  "hingeQuestion": "Whether [specific testable variable]",
  "roleA": {
    "position": "${roleALabel}'s position in 1 sentence",
    "falsifier": "Observable evidence that would prove ${roleALabel} wrong"
  },
  "roleB": {
    "position": "${roleBLabel}'s position in 1 sentence",
    "falsifier": "Observable evidence that would prove ${roleBLabel} wrong"
  }
}`,
        }],
        model: 'sonnet',
        maxTokens: 1024,
        temperature: 0.3,
      })

      return {
        hingeQuestion: result.hingeQuestion ?? d.topic,
        roleA: { id: d.roleA, position: result.roleA?.position ?? d.roleAPosition, falsifier: result.roleA?.falsifier ?? '' },
        roleB: { id: d.roleB, position: result.roleB?.position ?? d.roleBPosition, falsifier: result.roleB?.falsifier ?? '' },
      }
    })
  )

  return cruxCards
}

/**
 * Full crux condition: role perspectives → disagreements → crux extraction.
 */
async function runCruxCondition(task: CIGTask): Promise<{ rawOutput: string; assumptions: string[]; cruxCards: CruxCard[] }> {
  // Step 1: Gather role perspectives (parallel)
  console.log(`    Step 1: Role perspectives (${task.roles.length} roles)...`)
  const perspectives = await gatherRolePerspectives(task)

  for (const p of perspectives) {
    console.log(`      ${p.role.label}: ${p.assumptions.length} assumptions`)
  }

  // Step 2: Detect disagreements
  console.log(`    Step 2: Disagreement detection...`)
  const disagreements = await detectDisagreements(task, perspectives)
  console.log(`      Found ${disagreements.length} disagreements`)

  // Step 3: Extract cruxes
  console.log(`    Step 3: Crux extraction...`)
  const cruxCards = await extractCruxes(task, disagreements, perspectives)

  // Build raw output
  const rawParts: string[] = []

  rawParts.push('## Role Perspectives\n')
  for (const p of perspectives) {
    rawParts.push(`### ${p.role.label}`)
    rawParts.push(p.analysis)
    rawParts.push(`Assumptions: ${p.assumptions.join('; ')}\n`)
  }

  if (cruxCards.length > 0) {
    rawParts.push('## Crux Cards\n')
    for (const card of cruxCards) {
      rawParts.push(`### ${card.hingeQuestion}`)
      rawParts.push(`- ${card.roleA.id}: ${card.roleA.position}`)
      rawParts.push(`  Falsifier: ${card.roleA.falsifier}`)
      rawParts.push(`- ${card.roleB.id}: ${card.roleB.position}`)
      rawParts.push(`  Falsifier: ${card.roleB.falsifier}`)
      rawParts.push('')
    }
  }

  const rawOutput = rawParts.join('\n')

  // Collect all assumptions: role assumptions + crux hinge questions + falsifiers
  const allAssumptionSources = [
    ...perspectives.flatMap(p => p.assumptions),
    ...cruxCards.map(c => c.hingeQuestion),
  ]

  // Deduplicate and clean via Haiku
  const assumptions = await deduplicateAssumptions(allAssumptionSources, task.topic)

  return { rawOutput, assumptions, cruxCards }
}

// ─── Condition 4: Belief Graph (QBAF + DF-QuAD + Structural Crux) ──

/**
 * Create a synthetic Persona + PersonaContract for a role-based agent.
 * Minimal scaffolding so we can feed roles through the QBAF pipeline.
 */
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

/**
 * Belief graph condition: QBAF extraction → debate rounds → community graph → structural crux.
 * Uses 2 opposing roles (first 2 in the task config).
 */
async function runBeliefGraphCondition(task: CIGTask): Promise<{ rawOutput: string; assumptions: string[]; cruxCards: CruxCard[] }> {
  // Pick 2 most opposed roles (first and last by convention: typically demand vs competition)
  const roleA = task.roles[0]
  const roleB = task.roles[task.roles.length - 1]
  console.log(`    Using roles: ${roleA.label} vs ${roleB.label}`)

  const synthA = buildSyntheticPersona(roleA)
  const synthB = buildSyntheticPersona(roleB)

  // Phase 1: Extract QBAFs (parallel)
  console.log(`    Phase 1: QBAF extraction...`)
  const [qbafA, qbafB] = await Promise.all([
    extractQBAF(synthA.persona, synthA.contract, task.topic),
    extractQBAF(synthB.persona, synthB.contract, task.topic),
  ])
  console.log(`      ${roleA.label}: ${qbafA.nodes.length} nodes, root σ=${getRootStrength(qbafA).toFixed(3)}`)
  console.log(`      ${roleB.label}: ${qbafB.nodes.length} nodes, root σ=${getRootStrength(qbafB).toFixed(3)}`)

  // Phase 2: Debate rounds (3 rounds)
  console.log(`    Phase 2: Debate rounds...`)
  let currentA = qbafA
  let currentB = qbafB
  const MAX_ROUNDS = 3

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const result = await runDebateRound(
      currentA, currentB,
      synthA.persona, synthB.persona,
      synthA.contract, synthB.contract,
      round,
    )
    currentA = result.qbafA
    currentB = result.qbafB
    console.log(`      Round ${round}: A=${currentA.nodes.length} nodes (σ=${getRootStrength(currentA).toFixed(3)}), B=${currentB.nodes.length} nodes (σ=${getRootStrength(currentB).toFixed(3)})`)
  }

  // Phase 3: Community graph
  console.log(`    Phase 3: Community graph...`)
  const communityGraph = await buildCommunityGraph(currentA, currentB, 0.3, 0.1)
  console.log(`      ${communityGraph.nodes.length} community nodes, ${communityGraph.cruxNodes.length} crux nodes`)

  // Phase 4: Structural crux identification
  console.log(`    Phase 4: Structural crux identification...`)
  const cruxes = await identifyCruxes(communityGraph, currentA, currentB, 5)
  console.log(`      ${cruxes.length} structural cruxes identified`)

  // Build raw output
  const rawParts: string[] = []

  rawParts.push(`## Belief Graph Debate: ${roleA.label} vs ${roleB.label}\n`)

  rawParts.push(`### ${roleA.label} Root`)
  const rootA = currentA.nodes.find(n => n.id === currentA.rootClaim)
  rawParts.push(`Claim: ${rootA?.claim}`)
  rawParts.push(`Dialectical strength: σ=${getRootStrength(currentA).toFixed(3)}`)
  rawParts.push(`Arguments: ${currentA.nodes.length} nodes\n`)

  rawParts.push(`### ${roleB.label} Root`)
  const rootB = currentB.nodes.find(n => n.id === currentB.rootClaim)
  rawParts.push(`Claim: ${rootB?.claim}`)
  rawParts.push(`Dialectical strength: σ=${getRootStrength(currentB).toFixed(3)}`)
  rawParts.push(`Arguments: ${currentB.nodes.length} nodes\n`)

  if (cruxes.length > 0) {
    rawParts.push('## Structural Cruxes\n')
    for (const crux of cruxes) {
      rawParts.push(`### ${crux.claim}`)
      rawParts.push(`Crux score: ${crux.cruxScore.toFixed(3)}`)
      rawParts.push(`Disagreement type: ${crux.disagreementType}`)
      rawParts.push(`Settling question: ${crux.settlingQuestion}`)
      for (const [pid, pos] of Object.entries(crux.personaPositions)) {
        const label = pid === synthA.persona.id ? roleA.label : roleB.label
        rawParts.push(`- ${label}: τ=${pos.baseScore.toFixed(2)}, σ=${pos.dialecticalStrength.toFixed(2)}, impact=${pos.contribution.toFixed(3)}`)
      }
      rawParts.push('')
    }
  }

  const rawOutput = rawParts.join('\n')

  // Convert structural cruxes to CruxCards for output consistency
  const cruxCards: CruxCard[] = cruxes.map(crux => {
    const positions = Object.entries(crux.personaPositions)
    const [pidA, posA] = positions[0] ?? ['', { baseScore: 0, dialecticalStrength: 0, contribution: 0 }]
    const [pidB, posB] = positions[1] ?? ['', { baseScore: 0, dialecticalStrength: 0, contribution: 0 }]
    const labelA = pidA === synthA.persona.id ? roleA.id : roleB.id
    const labelB = pidB === synthA.persona.id ? roleA.id : roleB.id
    return {
      hingeQuestion: crux.settlingQuestion || crux.claim,
      roleA: { id: labelA, position: `τ=${posA.baseScore.toFixed(2)}, impact=${posA.contribution.toFixed(3)}`, falsifier: crux.counterfactual },
      roleB: { id: labelB, position: `τ=${posB.baseScore.toFixed(2)}, impact=${posB.contribution.toFixed(3)}`, falsifier: '' },
    }
  })

  // Extract assumptions from cruxes + settling questions + QBAF claims
  const assumptionSources = [
    ...cruxes.map(c => c.claim),
    ...cruxes.map(c => c.settlingQuestion).filter(Boolean),
    ...currentA.nodes.filter(n => n.depth <= 1).map(n => n.claim),
    ...currentB.nodes.filter(n => n.depth <= 1).map(n => n.claim),
  ]

  const assumptions = await deduplicateAssumptions(assumptionSources, task.topic)

  return { rawOutput, assumptions, cruxCards }
}

function getRootStrength(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0
}

// ─── Assumption Extraction & Dedup ──────────────────────────

async function extractAssumptions(rawText: string): Promise<string[]> {
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

async function deduplicateAssumptions(rawAssumptions: string[], topic: string): Promise<string[]> {
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

// ─── Main Runner ────────────────────────────────────────────

async function runTask(task: CIGTask, conditions: Condition[]): Promise<TaskResult> {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Task: ${task.id} — "${task.topic}"`)
  console.log(`Roles: ${task.roles.map(r => r.label).join(', ')}`)
  console.log(`Conditions: ${conditions.join(', ')}`)
  console.log(`${'═'.repeat(60)}\n`)

  const results: Partial<Record<Condition, ConditionResult>> = {}

  for (const condition of conditions) {
    console.log(`\n── Condition: ${condition} ──`)
    resetUsage()

    let rawOutput: string
    let assumptions: string[]
    let cruxCards: CruxCard[] | undefined

    if (condition === 'single') {
      const r = await runSingleCondition(task)
      rawOutput = r.rawOutput
      assumptions = r.assumptions
    } else if (condition === 'cot') {
      const r = await runCoTCondition(task)
      rawOutput = r.rawOutput
      assumptions = r.assumptions
    } else if (condition === 'belief-graph') {
      const r = await runBeliefGraphCondition(task)
      rawOutput = r.rawOutput
      assumptions = r.assumptions
      cruxCards = r.cruxCards
    } else {
      const r = await runCruxCondition(task)
      rawOutput = r.rawOutput
      assumptions = r.assumptions
      cruxCards = r.cruxCards
    }

    console.log(`  Assumptions found: ${assumptions.length}`)
    for (const a of assumptions) {
      console.log(`    • ${a}`)
    }

    // Score DAR
    console.log(`  Scoring DAR...`)
    const dar = await scoreDAR(assumptions, task.decisiveAssumptions)
    console.log(`  DAR recall: ${dar.recall}`)
    for (const m of dar.matches) {
      const icon = m.matched ? '✓' : '✗'
      console.log(`    ${icon} "${m.groundTruth.slice(0, 80)}..." → ${m.reasoning ?? ''}`)
    }

    // Score DFS on first ground-truth assumption
    console.log(`  Scoring DFS...`)
    const topAssumption = task.decisiveAssumptions[0]
    const dfs = await scoreDFS(rawOutput, topAssumption)
    console.log(`  DFS flipped: ${dfs.flipped}`)

    // Blind judge
    console.log(`  Running blind judge...`)
    const judge = await blindJudge(rawOutput)
    console.log(`  Judge: clarity=${judge.clarity}, robustness=${judge.robustness}, novelty=${judge.novelty}`)

    const tokenUsage = getTotalUsage()

    results[condition] = {
      rawOutput,
      assumptions,
      cruxCards,
      dar,
      dfs,
      judge,
      tokenUsage,
    }
  }

  // Score ANS (crux vs single) if both exist
  if (results.crux && results.single) {
    console.log(`\n  Scoring ANS (crux vs single)...`)
    const ans = await scoreANS(results.crux.assumptions, results.single.assumptions)
    results.crux.ans = ans
    console.log(`  ANS unique: ${ans.uniqueCount}`)
  }

  // Score ANS (belief-graph vs single) if both exist
  if (results['belief-graph'] && results.single) {
    console.log(`\n  Scoring ANS (belief-graph vs single)...`)
    const ans = await scoreANS(results['belief-graph'].assumptions, results.single.assumptions)
    results['belief-graph'].ans = ans
    console.log(`  ANS unique: ${ans.uniqueCount}`)
  }

  // Determine winner by DAR recall
  let winner = 'none'
  let bestRecall = -1
  for (const [cond, res] of Object.entries(results)) {
    if (res && res.dar.recall > bestRecall) {
      bestRecall = res.dar.recall
      winner = cond
    }
  }

  const taskResult: TaskResult = {
    taskId: task.id,
    topic: task.topic,
    timestamp: new Date().toISOString(),
    conditions: results,
    winner,
  }

  console.log(`\n  Winner: ${winner} (DAR=${bestRecall})`)

  return taskResult
}

async function writeSummary(results: TaskResult[], outputDir: string): Promise<void> {
  const conditions: Condition[] = ['single', 'cot', 'crux', 'belief-graph']

  const meanDAR: Record<string, number> = {}
  const winCounts: Record<string, number> = { single: 0, cot: 0, crux: 0, 'belief-graph': 0 }
  const totalTokens: Record<string, TokenUsage> = {}

  for (const cond of conditions) {
    const dars = results
      .map(r => r.conditions[cond]?.dar.recall)
      .filter((d): d is number => d !== undefined)
    meanDAR[cond] = dars.length > 0
      ? Math.round((dars.reduce((a, b) => a + b, 0) / dars.length) * 1000) / 1000
      : 0

    const tokens = results
      .map(r => r.conditions[cond]?.tokenUsage)
      .filter((t): t is TokenUsage => t !== undefined)
    totalTokens[cond] = {
      inputTokens: tokens.reduce((sum, t) => sum + t.inputTokens, 0),
      outputTokens: tokens.reduce((sum, t) => sum + t.outputTokens, 0),
    }
  }

  for (const r of results) {
    if (r.winner in winCounts) {
      winCounts[r.winner]++
    }
  }

  const winRates: Record<string, number> = {}
  for (const cond of conditions) {
    winRates[cond] = results.length > 0
      ? Math.round((winCounts[cond] / results.length) * 1000) / 1000
      : 0
  }

  const summary: SummaryResult = {
    timestamp: new Date().toISOString(),
    taskCount: results.length,
    meanDAR,
    winRates,
    totalTokens,
  }

  const summaryPath = path.join(outputDir, '_summary.json')
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\nSummary written to ${summaryPath}`)
  console.log(`  Mean DAR:`, meanDAR)
  console.log(`  Win rates:`, winRates)
}

// ─── Entry Point ────────────────────────────────────────────

async function main() {
  const { taskId, condition } = parseArgs()

  const tasksPath = path.join(process.cwd(), 'data/benchmarks/cig-tasks.json')
  const tasksRaw = await fs.readFile(tasksPath, 'utf-8')
  const allTasks: CIGTask[] = JSON.parse(tasksRaw)

  const tasks = taskId
    ? allTasks.filter(t => t.id === taskId)
    : allTasks

  if (tasks.length === 0) {
    console.error(`No tasks found${taskId ? ` with id "${taskId}"` : ''}`)
    console.error(`Available tasks: ${allTasks.map(t => t.id).join(', ')}`)
    process.exit(1)
  }

  const conditions: Condition[] = condition === 'all'
    ? ['single', 'cot', 'crux', 'belief-graph']
    : [condition as Condition]

  const outputDir = path.join(process.cwd(), 'data/benchmarks/cig-results')
  await fs.mkdir(outputDir, { recursive: true })

  const results: TaskResult[] = []
  for (const task of tasks) {
    const result = await runTask(task, conditions)
    results.push(result)

    const resultPath = path.join(outputDir, `${task.id}.json`)
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2))
    console.log(`  Result written to ${resultPath}`)
  }

  if (results.length > 1 || condition === 'all') {
    await writeSummary(results, outputDir)
  }

  console.log('\nBenchmark complete.')
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
