#!/usr/bin/env tsx
// ─── CIG Benchmark v2 Runner ─────────────────────────────────
//
// Human-judged crux comparison. No LLM-based scoring (DAR/ANS/blindJudge removed).
// Runs all 4 conditions, scores DFS on first 5 assumptions, computes overlap,
// outputs JSON + markdown comparison tables for human review.
//
// Usage:
//   npx tsx scripts/run-cig-benchmark-v2.ts
//   npx tsx scripts/run-cig-benchmark-v2.ts --task hbm-pricing
//   npx tsx scripts/run-cig-benchmark-v2.ts --task hbm-pricing --condition single

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { resetUsage, getTotalUsage } from '@/lib/llm/client'
import { scoreDFS } from '@/lib/benchmark/cig-scoring'
import {
  runSingleCondition,
  runCoTCondition,
  runDialogueCondition,
  runBeliefGraphCondition,
  type CIGTask,
  type Condition,
  type ConditionOutput,
} from '@/lib/benchmark/cig-conditions'
import { computeOverlap } from '@/lib/benchmark/overlap'
import type { ConditionResultV2, TaskResultV2, SummaryResultV2, FlipSensitivity, StructuralMetrics } from '@/lib/benchmark/types'
import type { TokenUsage } from '@/lib/llm/client'

// Optional: structural metrics require Voyage AI
let embedAvailable = false
let embedFn: ((texts: string[]) => Promise<number[][]>) | null = null

async function tryLoadEmbeddings(): Promise<void> {
  if (!process.env.VOYAGE_API_KEY) return
  try {
    const mod = await import('@/lib/embeddings/client')
    embedFn = mod.embed
    embedAvailable = true
    console.log('  Voyage AI available — structural metrics enabled')
  } catch {
    console.log('  Voyage AI not available — skipping structural metrics')
  }
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

// ─── Condition dispatcher ───────────────────────────────────

async function runCondition(condition: Condition, task: CIGTask): Promise<ConditionOutput> {
  switch (condition) {
    case 'single': return runSingleCondition(task)
    case 'cot': return runCoTCondition(task)
    case 'dialogue': return runDialogueCondition(task)
    case 'belief-graph': return runBeliefGraphCondition(task)
  }
}

// ─── DFS on first N assumptions ─────────────────────────────

async function runDFSBatch(rawOutput: string, assumptions: string[], count: number): Promise<FlipSensitivity[]> {
  const toTest = assumptions.slice(0, count)
  const results: FlipSensitivity[] = []

  for (const assumption of toTest) {
    const dfs = await scoreDFS(rawOutput, assumption)
    results.push({
      assumption,
      flipped: dfs.flipped,
      explanation: dfs.explanation,
    })
  }

  return results
}

// ─── Markdown comparison output ─────────────────────────────

function generateComparisonMarkdown(result: TaskResultV2): string {
  const conditions = Object.keys(result.conditions) as Condition[]
  const lines: string[] = []

  lines.push(`# CIG Benchmark v2: ${result.topic}`)
  lines.push('')
  lines.push(`**Task ID:** ${result.taskId}`)
  lines.push(`**Category:** ${result.category}`)
  lines.push(`**Timestamp:** ${result.timestamp}`)
  lines.push('')

  // Summary table
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | ' + conditions.join(' | ') + ' |')
  lines.push('|--------|' + conditions.map(() => '---').join('|') + '|')

  // Assumptions count
  lines.push('| Assumptions | ' + conditions.map(c => {
    const r = result.conditions[c]
    return r ? String(r.assumptions.length) : '-'
  }).join(' | ') + ' |')

  // Unique count
  lines.push('| Unique | ' + conditions.map(c => {
    return String(result.overlap.uniqueTo[c] ?? 0)
  }).join(' | ') + ' |')

  // DFS flipped count
  lines.push('| DFS Flipped | ' + conditions.map(c => {
    const r = result.conditions[c]
    if (!r) return '-'
    const flipped = r.flipSensitivity.filter(f => f.flipped).length
    return `${flipped}/${r.flipSensitivity.length}`
  }).join(' | ') + ' |')

  // Token usage
  lines.push('| Input Tokens | ' + conditions.map(c => {
    const r = result.conditions[c]
    return r ? r.tokenUsage.inputTokens.toLocaleString() : '-'
  }).join(' | ') + ' |')

  lines.push('| Output Tokens | ' + conditions.map(c => {
    const r = result.conditions[c]
    return r ? r.tokenUsage.outputTokens.toLocaleString() : '-'
  }).join(' | ') + ' |')

  // Tokens per assumption
  lines.push('| Tokens/Assumption | ' + conditions.map(c => {
    const r = result.conditions[c]
    return r?.structuralMetrics?.tokensPerAssumption?.toLocaleString() ?? '-'
  }).join(' | ') + ' |')

  lines.push('')

  // Side-by-side assumptions
  lines.push('## Assumptions Comparison')
  lines.push('')

  const maxAssumptions = Math.max(...conditions.map(c => result.conditions[c]?.assumptions.length ?? 0))

  lines.push('| # | ' + conditions.join(' | ') + ' |')
  lines.push('|---|' + conditions.map(() => '---').join('|') + '|')

  for (let i = 0; i < maxAssumptions; i++) {
    const row = conditions.map(c => {
      const r = result.conditions[c]
      const assumption = r?.assumptions[i]
      if (!assumption) return ''
      const isUnique = result.overlap.uniqueAssumptions[c]?.includes(assumption)
      return isUnique ? `**${assumption}**` : assumption
    })
    lines.push(`| ${i + 1} | ${row.join(' | ')} |`)
  }

  lines.push('')

  // Crux hinge questions per condition
  lines.push('## Crux Hinge Questions')
  lines.push('')
  for (const cond of conditions) {
    const r = result.conditions[cond]
    if (!r || r.cruxCards.length === 0) continue
    lines.push(`### ${cond}`)
    for (const card of r.cruxCards) {
      lines.push(`- **${card.hingeQuestion}**`)
      lines.push(`  - ${card.roleA.id}: ${card.roleA.position}`)
      lines.push(`  - ${card.roleB.id}: ${card.roleB.position}`)
    }
    lines.push('')
  }

  // Overlap analysis
  lines.push('## Overlap Analysis')
  lines.push('')
  lines.push(`**Shared across all conditions:** ${result.overlap.sharedAll}`)
  lines.push('')

  for (const cond of conditions) {
    const unique = result.overlap.uniqueAssumptions[cond]
    if (!unique || unique.length === 0) continue
    lines.push(`**Unique to ${cond}** (${unique.length}):`)
    for (const a of unique) {
      lines.push(`- ${a}`)
    }
    lines.push('')
  }

  // Pairwise
  const pairKeys = Object.keys(result.overlap.pairwiseShared)
  if (pairKeys.length > 0) {
    lines.push('**Pairwise shared:**')
    for (const key of pairKeys) {
      lines.push(`- ${key}: ${result.overlap.pairwiseShared[key]}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Main Runner ────────────────────────────────────────────

async function runTaskV2(task: CIGTask, conditions: Condition[]): Promise<TaskResultV2> {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Task: ${task.id} — "${task.topic}"`)
  console.log(`Roles: ${task.roles.map(r => r.label).join(', ')}`)
  console.log(`Conditions: ${conditions.join(', ')}`)
  console.log(`${'═'.repeat(60)}\n`)

  const results: Partial<Record<Condition, ConditionResultV2>> = {}

  for (const condition of conditions) {
    console.log(`\n── Condition: ${condition} ──`)
    resetUsage()

    const output: ConditionOutput = await runCondition(condition, task)

    console.log(`  Assumptions found: ${output.assumptions.length}`)
    for (const a of output.assumptions) {
      console.log(`    • ${a}`)
    }

    // DFS on first 5 assumptions (self-consistency check)
    console.log(`  Running DFS on first 5 assumptions...`)
    const flipSensitivity = await runDFSBatch(output.rawOutput, output.assumptions, 5)
    const flipped = flipSensitivity.filter(f => f.flipped).length
    console.log(`  DFS: ${flipped}/${flipSensitivity.length} flipped`)

    const tokenUsage = getTotalUsage()
    const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens

    // Compute structural metrics
    const structuralMetrics: StructuralMetrics = {
      tokensPerAssumption: output.assumptions.length > 0
        ? Math.round(totalTokens / output.assumptions.length)
        : 0,
    }

    // Embedding-based metrics (dialogue only, requires Voyage AI)
    if (embedAvailable && embedFn && condition === 'dialogue') {
      try {
        console.log(`  Computing embedding-based structural metrics...`)
        // We can't compute semantic spread or stance diversity without per-round/per-persona
        // message data from the runner. But tokensPerAssumption is always available.
        // For crux grounding, we need crux card text + source message text,
        // which aren't easily separable from the raw output in the current architecture.
        // Leave embedding metrics as a future extension when the dialogue runner
        // returns structured per-round data.
      } catch (err) {
        console.log(`  Structural metrics error: ${err}`)
      }
    }

    results[condition] = {
      rawOutput: output.rawOutput,
      assumptions: output.assumptions,
      cruxCards: output.cruxCards,
      flipSensitivity,
      tokenUsage,
      structuralMetrics,
    }
  }

  // Compute overlap
  const conditionAssumptions: Partial<Record<Condition, string[]>> = {}
  for (const [cond, res] of Object.entries(results)) {
    if (res) conditionAssumptions[cond as Condition] = res.assumptions
  }
  const overlap = computeOverlap(conditionAssumptions)

  console.log(`\n  Overlap: ${overlap.sharedAll} shared across all`)
  for (const [cond, count] of Object.entries(overlap.uniqueTo)) {
    console.log(`    ${cond}: ${count} unique`)
  }

  const taskResult: TaskResultV2 = {
    taskId: task.id,
    topic: task.topic,
    category: task.category,
    timestamp: new Date().toISOString(),
    conditions: results,
    overlap,
  }

  return taskResult
}

async function writeSummaryV2(results: TaskResultV2[], outputDir: string): Promise<void> {
  const allConditions: Condition[] = ['single', 'cot', 'dialogue', 'belief-graph']

  const meanAssumptions: Record<string, number> = {}
  const meanUniqueAssumptions: Record<string, number> = {}
  const totalTokens: Record<string, TokenUsage> = {}

  for (const cond of allConditions) {
    const counts = results
      .map(r => r.conditions[cond]?.assumptions.length)
      .filter((c): c is number => c !== undefined)
    meanAssumptions[cond] = counts.length > 0
      ? Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10
      : 0

    const uniqueCounts = results
      .map(r => r.overlap.uniqueTo[cond])
      .filter((c): c is number => c !== undefined)
    meanUniqueAssumptions[cond] = uniqueCounts.length > 0
      ? Math.round((uniqueCounts.reduce((a, b) => a + b, 0) / uniqueCounts.length) * 10) / 10
      : 0

    const tokens = results
      .map(r => r.conditions[cond]?.tokenUsage)
      .filter((t): t is TokenUsage => t !== undefined)
    totalTokens[cond] = {
      inputTokens: tokens.reduce((sum, t) => sum + t.inputTokens, 0),
      outputTokens: tokens.reduce((sum, t) => sum + t.outputTokens, 0),
    }
  }

  const summary: SummaryResultV2 = {
    timestamp: new Date().toISOString(),
    taskCount: results.length,
    meanAssumptions,
    meanUniqueAssumptions,
    totalTokens,
  }

  const summaryPath = path.join(outputDir, '_summary-v2.json')
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\nSummary written to ${summaryPath}`)
  console.log(`  Mean assumptions:`, meanAssumptions)
  console.log(`  Mean unique:`, meanUniqueAssumptions)
}

// ─── Entry Point ────────────────────────────────────────────

async function main() {
  const { taskId, condition } = parseArgs()
  await tryLoadEmbeddings()

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
    ? ['single', 'cot', 'dialogue', 'belief-graph']
    : [condition as Condition]

  const outputDir = path.join(process.cwd(), 'data/benchmarks/cig-results')
  await fs.mkdir(outputDir, { recursive: true })

  const mdDir = path.join(process.cwd(), 'data/benchmarks')

  const results: TaskResultV2[] = []
  for (const task of tasks) {
    const result = await runTaskV2(task, conditions)
    results.push(result)

    // Write JSON
    const resultPath = path.join(outputDir, `${task.id}-v2.json`)
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2))
    console.log(`  Result written to ${resultPath}`)

    // Write markdown comparison
    const mdPath = path.join(mdDir, `${task.id}-comparison.md`)
    const md = generateComparisonMarkdown(result)
    await fs.writeFile(mdPath, md)
    console.log(`  Comparison written to ${mdPath}`)
  }

  if (results.length > 1 || condition === 'all') {
    await writeSummaryV2(results, outputDir)
  }

  console.log('\nBenchmark v2 complete.')
}

main().catch(err => {
  console.error('Benchmark v2 failed:', err)
  process.exit(1)
})
