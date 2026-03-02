#!/usr/bin/env tsx
// ─── Benchmark Runner ───────────────────────────────────────
//
// Usage:
//   npm run benchmark -- --topic "Is Bitcoin a good store of value?" \
//     --personas "Michael Saylor,Arthur Hayes" --runs 3
//

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { runDialogue } from '@/lib/dialogue/orchestrator'
import { getTotalUsage, resetUsage } from '@/lib/llm/client'
import { getPersona } from '@/lib/personas/loader'
import { embed, cosineSim } from '@/lib/embeddings/client'
import { extractStances } from '@/lib/benchmark/extract'
import {
  computeStanceDiversityFromScores,
  computeStanceDiversityFromEmbeddings,
  computeSemanticSpread,
  computeCruxGrounding,
  computeCruxRecurrence,
  computeBeliefAdherence,
  pearsonCorrelation,
  type TaggedEmbedding,
} from '@/lib/benchmark/metrics'
import type { DialogueEvent, DialogueMessage } from '@/lib/dialogue/types'
import type { CruxCard } from '@/lib/crux/types'

const HAS_VOYAGE = !!process.env.VOYAGE_API_KEY

// ─── CLI Args ───────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[++i]
    }
  }

  const topic = flags['topic']
  const personasCsv = flags['personas']
  const runs = parseInt(flags['runs'] ?? '3', 10)
  const outputDir = flags['output-dir'] ?? path.join(process.cwd(), 'data/benchmarks')

  if (!topic || !personasCsv) {
    console.error('Usage: npm run benchmark -- --topic "..." --personas "Name1,Name2" [--runs N] [--output-dir path]')
    process.exit(1)
  }

  const personaIds = personasCsv.split(',').map(s => s.trim())
  return { topic, personaIds, runs, outputDir }
}

// ─── Collect Events ─────────────────────────────────────────

interface CollectedDebate {
  openingMessages: DialogueMessage[]
  closingMessages: DialogueMessage[]
  allMessages: DialogueMessage[]
  cruxCards: CruxCard[]
  totalMessages: number
}

async function collectDebate(topic: string, personaIds: string[]): Promise<CollectedDebate> {
  const openingMessages: DialogueMessage[] = []
  const closingMessages: DialogueMessage[] = []
  const allMessages: DialogueMessage[] = []
  const cruxCards: CruxCard[] = []

  const gen = runDialogue({ topic, personaIds })

  for await (const event of gen) {
    switch (event.type) {
      case 'message_posted':
        allMessages.push(event.message)
        if (event.phase === 'opening') openingMessages.push(event.message)
        if (event.phase === 'closing') closingMessages.push(event.message)
        break
      case 'crux_card_posted':
        cruxCards.push(event.card)
        break
      case 'error':
        console.error(`[benchmark] Debate error: ${event.error}`)
        break
    }
  }

  return {
    openingMessages,
    closingMessages,
    allMessages,
    cruxCards,
    totalMessages: allMessages.length,
  }
}

// ─── Run Single Benchmark ───────────────────────────────────

interface BenchmarkResult {
  id: string
  topic: string
  personas: string[]
  timestamp: string
  tokenUsage: { inputTokens: number; outputTokens: number }
  metrics: {
    stanceDiversity: {
      haiku: { pre_sd: number; post_sd: number; delta_sd: number }
      embedding: { pre_dist: number; post_dist: number; delta: number }
      correlation: number | null
    }
    semanticSpread: { perRound: number[]; slope: number }
    cruxGrounding: { mean: number; perCard: number[] }
    cruxRecurrence: null  // computed after all runs
    beliefAdherence: null
    accuracy: null
  }
  summary: { totalMessages: number; cruxCards: number; ccr: number }
  // Internal data for cross-run analysis
  _cruxCardEmbeddings?: number[][]
}

async function runSingleBenchmark(
  topic: string,
  personaIds: string[],
  runIndex: number,
  personaNames: Map<string, string>,
): Promise<BenchmarkResult> {
  const benchId = `bench-${Date.now()}-${runIndex}`
  console.log(`\n── Run ${runIndex + 1}: ${benchId} ──`)

  resetUsage()

  // 1. Run debate
  console.log('  Running dialogue...')
  const debate = await collectDebate(topic, personaIds)
  const usage = getTotalUsage()
  console.log(`  ${debate.totalMessages} messages, ${debate.cruxCards.length} crux cards`)

  // 2. Embed all messages (if Voyage key available)
  let allEmbeddings: number[][] = []
  let tagged: TaggedEmbedding[] = []
  let openingEmbeddings: number[][] = []
  let closingEmbeddings: number[][] = []

  if (HAS_VOYAGE) {
    console.log('  Embedding messages...')
    const allTexts = debate.allMessages.map(m => m.content)
    allEmbeddings = await embed(allTexts)

    tagged = debate.allMessages.map((m, i) => ({
      personaId: m.personaId,
      round: m.round ?? 0,
      embedding: allEmbeddings[i],
    }))

    openingEmbeddings = debate.openingMessages.map(m => {
      const idx = debate.allMessages.indexOf(m)
      return allEmbeddings[idx]
    })
    closingEmbeddings = debate.closingMessages.map(m => {
      const idx = debate.allMessages.indexOf(m)
      return allEmbeddings[idx]
    })
  } else {
    console.log('  Skipping embeddings (no VOYAGE_API_KEY)')
  }

  // 3. Extract stances via Haiku
  console.log('  Extracting stances...')
  const stances = await extractStances(topic, debate.openingMessages, debate.closingMessages, personaNames)

  // 4. Compute metrics
  console.log('  Computing metrics...')

  const haikuSD = computeStanceDiversityFromScores(stances.pre, stances.post)
  const embedSD = HAS_VOYAGE
    ? computeStanceDiversityFromEmbeddings(openingEmbeddings, closingEmbeddings)
    : { pre_dist: 0, post_dist: 0, delta: 0 }

  // Pearson correlation: need per-persona paired values
  let correlation: number | null = null
  if (HAS_VOYAGE) {
    const personaOrder = [...personaNames.values()]
    const haikuDeltas = personaOrder.map(name =>
      (stances.post[name] ?? 0) - (stances.pre[name] ?? 0)
    )
    const embedDeltas = personaOrder.map((_, i) => {
      if (i < openingEmbeddings.length && i < closingEmbeddings.length) {
        return 1 - cosineSim(openingEmbeddings[i], closingEmbeddings[i])
      }
      return 0
    })
    correlation = pearsonCorrelation(haikuDeltas, embedDeltas)
  }

  const semanticSpread = HAS_VOYAGE
    ? computeSemanticSpread(tagged)
    : { perRound: [], slope: 0 }

  // Crux grounding
  let cruxGrounding = { mean: 0, perCard: [] as number[] }
  let cruxCardEmbeddings: number[][] = []
  if (HAS_VOYAGE && debate.cruxCards.length > 0) {
    const cardTexts = debate.cruxCards.map(c => `${c.question} ${c.diagnosis}`)
    cruxCardEmbeddings = await embed(cardTexts)

    const messageIdToIdx = new Map<string, number>()
    debate.allMessages.forEach((m, i) => messageIdToIdx.set(m.id, i))

    const sourceEmbeddingsPerCard = debate.cruxCards.map(card => {
      return card.sourceMessages
        .map(id => messageIdToIdx.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .map(idx => allEmbeddings[idx])
    })

    cruxGrounding = computeCruxGrounding(cruxCardEmbeddings, sourceEmbeddingsPerCard)
  }

  const ccr = debate.totalMessages > 0
    ? Math.round((debate.cruxCards.length / debate.totalMessages) * 1000) / 1000
    : 0

  return {
    id: benchId,
    topic,
    personas: personaIds,
    timestamp: new Date().toISOString(),
    tokenUsage: usage,
    metrics: {
      stanceDiversity: { haiku: haikuSD, embedding: embedSD, correlation },
      semanticSpread,
      cruxGrounding,
      cruxRecurrence: null,
      beliefAdherence: computeBeliefAdherence(),
      accuracy: null,
    },
    summary: {
      totalMessages: debate.totalMessages,
      cruxCards: debate.cruxCards.length,
      ccr,
    },
    _cruxCardEmbeddings: cruxCardEmbeddings,
  }
}

// ─── Summary ────────────────────────────────────────────────

interface BenchmarkSummary {
  topic: string
  personas: string[]
  runs: number
  timestamp: string
  aggregate: {
    stanceDiversity: {
      haiku_delta_sd: { mean: number; std: number }
      embed_delta: { mean: number; std: number }
    }
    semanticSpread: {
      slope: { mean: number; std: number }
    }
    cruxGrounding: {
      mean: { mean: number; std: number }
    }
    cruxRecurrence: { stableClusters: number; totalClusters: number; ratio: number } | null
    totalMessages: { mean: number; std: number }
    cruxCards: { mean: number; std: number }
    totalTokens: { input: number; output: number }
  }
}

function computeSummary(results: BenchmarkResult[]): BenchmarkSummary {
  const haikuDeltas = results.map(r => r.metrics.stanceDiversity.haiku.delta_sd)
  const embedDeltas = results.map(r => r.metrics.stanceDiversity.embedding.delta)
  const slopes = results.map(r => r.metrics.semanticSpread.slope)
  const cruxMeans = results.map(r => r.metrics.cruxGrounding.mean)
  const msgCounts = results.map(r => r.summary.totalMessages)
  const cardCounts = results.map(r => r.summary.cruxCards)

  // Crux recurrence across runs
  const allCruxEmbeddings: { runIndex: number; embedding: number[] }[] = []
  for (let i = 0; i < results.length; i++) {
    const embs = results[i]._cruxCardEmbeddings ?? []
    for (const emb of embs) {
      allCruxEmbeddings.push({ runIndex: i, embedding: emb })
    }
  }
  const cruxRecurrence = results.length >= 3
    ? computeCruxRecurrence(allCruxEmbeddings, 3)
    : null

  const totalInput = results.reduce((s, r) => s + r.tokenUsage.inputTokens, 0)
  const totalOutput = results.reduce((s, r) => s + r.tokenUsage.outputTokens, 0)

  return {
    topic: results[0].topic,
    personas: results[0].personas,
    runs: results.length,
    timestamp: new Date().toISOString(),
    aggregate: {
      stanceDiversity: {
        haiku_delta_sd: { mean: meanArr(haikuDeltas), std: stdArr(haikuDeltas) },
        embed_delta: { mean: meanArr(embedDeltas), std: stdArr(embedDeltas) },
      },
      semanticSpread: {
        slope: { mean: meanArr(slopes), std: stdArr(slopes) },
      },
      cruxGrounding: {
        mean: { mean: meanArr(cruxMeans), std: stdArr(cruxMeans) },
      },
      cruxRecurrence,
      totalMessages: { mean: meanArr(msgCounts), std: stdArr(msgCounts) },
      cruxCards: { mean: meanArr(cardCounts), std: stdArr(cardCounts) },
      totalTokens: { input: totalInput, output: totalOutput },
    },
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { topic, personaIds, runs, outputDir } = parseArgs()

  // Validate personas exist
  const personaNames = new Map<string, string>()
  for (const id of personaIds) {
    const persona = await getPersona(id)
    if (!persona) {
      console.error(`Persona not found: "${id}"`)
      process.exit(1)
    }
    personaNames.set(id, persona.name)
  }

  console.log(`\nBenchmark: "${topic}"`)
  console.log(`Personas: ${[...personaNames.values()].join(', ')}`)
  console.log(`Runs: ${runs}`)
  if (!HAS_VOYAGE) {
    console.log(`⚠ No VOYAGE_API_KEY — embedding metrics (semantic spread, crux grounding, embed ΔSD) will be skipped`)
  }

  // Ensure output dir
  await fs.mkdir(outputDir, { recursive: true })

  const results: BenchmarkResult[] = []

  for (let i = 0; i < runs; i++) {
    const result = await runSingleBenchmark(topic, personaIds, i, personaNames)
    results.push(result)

    // Write per-run JSON (strip internal fields)
    const { _cruxCardEmbeddings, ...output } = result
    const filePath = path.join(outputDir, `${result.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(output, null, 2))
    console.log(`  Saved: ${filePath}`)
  }

  // Cross-run analysis
  const summary = computeSummary(results)

  // Write summary
  const summaryPath = path.join(outputDir, '_summary.json')
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2))
  console.log(`\nSummary saved: ${summaryPath}`)

  // Print console table
  console.log('\n═══════════════════════════════════════════════')
  console.log(`  BENCHMARK RESULTS: "${topic}"`)
  console.log('═══════════════════════════════════════════════')
  console.log(`  Runs: ${runs}`)
  console.log(`  Messages/run: ${summary.aggregate.totalMessages.mean.toFixed(1)} ± ${summary.aggregate.totalMessages.std.toFixed(1)}`)
  console.log(`  Crux cards/run: ${summary.aggregate.cruxCards.mean.toFixed(1)} ± ${summary.aggregate.cruxCards.std.toFixed(1)}`)
  console.log('───────────────────────────────────────────────')
  console.log(`  ΔSD (Haiku):     ${fmtMeanStd(summary.aggregate.stanceDiversity.haiku_delta_sd)}`)
  console.log(`  ΔSD (Embedding): ${fmtMeanStd(summary.aggregate.stanceDiversity.embed_delta)}`)
  console.log(`  Spread slope:    ${fmtMeanStd(summary.aggregate.semanticSpread.slope)}`)
  console.log(`  Crux grounding:  ${fmtMeanStd(summary.aggregate.cruxGrounding.mean)}`)
  if (summary.aggregate.cruxRecurrence) {
    const cr = summary.aggregate.cruxRecurrence
    console.log(`  Crux recurrence: ${cr.stableClusters}/${cr.totalClusters} stable (${(cr.ratio * 100).toFixed(0)}%)`)
  } else {
    console.log(`  Crux recurrence: n/a (need >= 3 runs)`)
  }
  console.log(`  Belief adherence: stub (no belief graphs)`)
  console.log(`  Accuracy:         stub (no ground truth)`)
  console.log('───────────────────────────────────────────────')
  console.log(`  Total tokens: ${summary.aggregate.totalTokens.input.toLocaleString()} in / ${summary.aggregate.totalTokens.output.toLocaleString()} out`)
  console.log('═══════════════════════════════════════════════\n')
}

// ─── Utility ────────────────────────────────────────────────

function meanArr(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000
}

function stdArr(values: number[]): number {
  if (values.length < 2) return 0
  const avg = meanArr(values)
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.round(Math.sqrt(variance) * 1000) / 1000
}

function fmtMeanStd(ms: { mean: number; std: number }): string {
  return `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
