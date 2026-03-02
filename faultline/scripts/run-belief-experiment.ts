// ─── Stage 6: Full Belief Graph Experiment ───────────────────
// Usage: npx tsx scripts/run-belief-experiment.ts --topic "..." --personas "Citrini,Citadel" [--rounds 3]
//
// Runs the full pipeline: belief-graph QBAF extraction → debate rounds → revision → community graph → cruxes → benchmarks

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { runBeliefGraphExperiment } from '../lib/belief-graph/orchestrator'
import type { ExperimentConfig, ExperimentResult } from '../lib/belief-graph/types'
import { getTotalUsage, resetUsage } from '../lib/llm/client'

function parseArgs(): { topic: string; personas: [string, string]; maxRounds: number } {
  const args = process.argv.slice(2)
  let topic = 'Will AI cause net job losses in the next decade?'
  let personas: [string, string] = ['Citrini', 'Citadel']
  let maxRounds = 3

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) {
      topic = args[++i]
    } else if (args[i] === '--personas' && args[i + 1]) {
      const parts = args[++i].split(',').map(s => s.trim())
      if (parts.length !== 2) {
        console.error('Error: --personas requires exactly 2 comma-separated names')
        process.exit(1)
      }
      personas = parts as [string, string]
    } else if (args[i] === '--rounds' && args[i + 1]) {
      maxRounds = parseInt(args[++i], 10)
    }
  }

  return { topic, personas, maxRounds }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function main() {
  const { topic, personas, maxRounds } = parseArgs()

  console.log(`\n╔══════════════════════════════════════════════════════╗`)
  console.log(`║  Stage 6: Full Belief Graph Experiment                ║`)
  console.log(`╚══════════════════════════════════════════════════════╝`)
  console.log(`  Topic: "${topic}"`)
  console.log(`  Personas: ${personas[0]} vs ${personas[1]}`)
  console.log(`  Max rounds: ${maxRounds}`)
  console.log()

  resetUsage()
  const startTime = Date.now()

  const config: ExperimentConfig = {
    topic,
    personaIds: personas,
    maxRounds,
    convergenceThreshold: 0.02,
    cruxVarianceThreshold: 0.3,
    consensusVarianceThreshold: 0.1,
  }

  const slug = slugify(topic)
  const outDir = path.join(process.cwd(), 'data', 'experiments', slug)
  await fs.mkdir(outDir, { recursive: true })

  let result: ExperimentResult | null = null

  for await (const event of runBeliefGraphExperiment(config)) {
    switch (event.type) {
      case 'experiment_start':
        console.log(`▶ Experiment: ${event.topic}`)
        console.log(`  Personas: ${event.personas.join(' vs ')}`)
        break

      case 'extraction_start':
        console.log(`\n⏳ Extracting QBAF for ${event.personaId} (from belief graph)...`)
        break

      case 'extraction_complete': {
        const root = event.qbaf.nodes.find(n => n.id === event.qbaf.rootClaim)
        const attacks = event.qbaf.edges.filter(e => e.type === 'attack').length
        const supports = event.qbaf.edges.filter(e => e.type === 'support').length
        console.log(`  ✓ ${event.personaId}: ${event.qbaf.nodes.length} nodes, ${event.qbaf.edges.length} edges (${supports} support, ${attacks} attack)`)
        console.log(`    Root: "${root?.claim?.slice(0, 100)}${(root?.claim?.length ?? 0) > 100 ? '...' : ''}"`)
        console.log(`    Root σ = ${root?.dialecticalStrength.toFixed(4)}`)

        // Save initial QBAF
        await fs.writeFile(
          path.join(outDir, `qbaf-${event.personaId}.json`),
          JSON.stringify(event.qbaf, null, 2),
        )
        break
      }

      case 'round_start':
        console.log(`\n─── Round ${event.round} ──────────────────────────────`)
        break

      case 'debate_moves':
        console.log(`  ${event.personaId}: +${event.newNodes} debate moves`)
        break

      case 'revision_complete':
        console.log(`  ${event.personaId}: σ(root) = ${event.rootStrength.toFixed(4)}, Σ|Δτ| = ${event.revisionCost.toFixed(4)}, R = ${event.R.toFixed(2)}`)
        if (event.reasoning) console.log(`    ${event.reasoning}`)
        break

      case 'round_complete': {
        // Save per-round QBAFs
        for (const [pid, qbaf] of Object.entries(event.snapshot.qbafs)) {
          await fs.writeFile(
            path.join(outDir, `round-${event.round}-${pid}.json`),
            JSON.stringify(qbaf, null, 2),
          )
        }
        break
      }

      case 'convergence_check': {
        const deltasStr = Object.entries(event.deltas).map(([k, v]) => `${k}: Δ${v.toFixed(4)}`).join(', ')
        console.log(`  Convergence: ${event.converged ? '✓ YES' : '✗ no'} (${deltasStr})`)
        break
      }

      case 'community_graph_built': {
        const merged = event.graph.nodes.filter(n => n.mergedFrom.length > 1).length
        console.log(`\n─── Community Graph ────────────────────────────`)
        console.log(`  Nodes: ${event.graph.nodes.length} (${merged} merged)`)
        console.log(`  Edges: ${event.graph.edges.length}`)
        console.log(`  Crux nodes: ${event.graph.cruxNodes.length}`)
        console.log(`  Consensus nodes: ${event.graph.consensusNodes.length}`)
        await fs.writeFile(path.join(outDir, 'community.json'), JSON.stringify(event.graph, null, 2))
        break
      }

      case 'cruxes_identified':
        console.log(`\n─── Structural Cruxes (${event.cruxes.length}) ─────────────────`)
        for (const crux of event.cruxes) {
          console.log(`  [${crux.cruxScore.toFixed(3)}] "${crux.claim.slice(0, 120)}${crux.claim.length > 120 ? '...' : ''}"`)
          console.log(`    Type: ${crux.disagreementType}`)
          console.log(`    Q: ${crux.settlingQuestion}`)
        }
        await fs.writeFile(path.join(outDir, 'cruxes.json'), JSON.stringify(event.cruxes, null, 2))
        break

      case 'benchmarks_computed': {
        const b = event.benchmarks
        console.log(`\n─── Benchmarks ─────────────────────────────────`)
        console.log(`  Root Strength Delta:`)
        for (const [pid, delta] of Object.entries(b.rootStrengthDelta)) {
          console.log(`    ${pid}: ${delta.toFixed(4)}`)
        }
        console.log(`  Stance Divergence (ΔSD): ${b.stanceDivergence.toFixed(4)}`)
        console.log(`  Belief Revision Cost:`)
        for (const [pid, cost] of Object.entries(b.beliefRevisionCost)) {
          console.log(`    ${pid}: ${cost.toFixed(4)}`)
        }
        console.log(`  Crux Localization Rate: ${(b.cruxLocalizationRate * 100).toFixed(1)}%`)
        console.log(`  Argument Coverage: ${b.argumentCoverage.toFixed(2)}`)
        console.log(`  Graph Growth Rate:`)
        for (const [pid, rate] of Object.entries(b.graphGrowthRate)) {
          console.log(`    ${pid}: ${rate.toFixed(2)}x`)
        }
        console.log(`  Counterfactual Sensitivity: ${b.counterfactualSensitivity.toFixed(4)}`)
        if (b.decisionFlipScore) {
          console.log(`  Decision Flip Score: ${b.decisionFlipScore.flipped ? '✓ flipped' : '✗ no flip'}`)
          console.log(`    ${b.decisionFlipScore.explanation}`)
        }
        console.log(`  Convergence Round: ${b.convergenceRound ?? 'did not converge'}`)
        await fs.writeFile(path.join(outDir, 'benchmarks.json'), JSON.stringify(b, null, 2))
        break
      }

      case 'experiment_complete':
        result = event.result
        break

      case 'error':
        console.error(`\n✗ Error: ${event.error}`)
        process.exit(1)
    }
  }

  if (!result) {
    console.error('Experiment did not produce a result')
    process.exit(1)
  }

  // Save full result
  await fs.writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const usage = getTotalUsage()

  // Trajectory summary
  console.log(`\n─── Trajectory ─────────────────────────────────`)
  for (const pid of config.personaIds) {
    const trajectory = result.rounds.map(r => r.rootStrengths[pid]?.toFixed(3) ?? '?')
    console.log(`  ${pid}: ${trajectory.join(' → ')}`)
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`)
  console.log(`║  EXPERIMENT COMPLETE                                  ║`)
  console.log(`╠══════════════════════════════════════════════════════╣`)
  console.log(`║  Rounds: ${result.totalRounds} ${result.converged ? '(converged)' : '(max reached)'}`)
  console.log(`║  Time: ${elapsed}s`)
  console.log(`║  Tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`)
  console.log(`║  Output: ${outDir}`)
  console.log(`╚══════════════════════════════════════════════════════╝`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
