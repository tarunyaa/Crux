// ─── Stage 2 CLI: Extract Topic-Scoped QBAFs from Belief Graphs ───
// Usage: npx tsx scripts/extract-qbafs-from-beliefs.ts --topic "..." --personas "Citrini,Citadel"
//
// Reads data/seed/beliefs/{Name}.json → produces data/experiments/{slug}/qbaf-{Name}.json

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs/promises'
import * as path from 'path'
import { extractQBAFFromBeliefGraph } from '../lib/belief-graph/extract-qbaf-from-beliefs'
import { loadBeliefGraph } from '../lib/personas/loader'
import type { PersonaQBAF } from '../lib/belief-graph/types'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function main() {
  const args = process.argv.slice(2)

  let topic = 'Will AI cause net job losses in the next decade?'
  let personaNames = ['Citrini', 'Citadel']

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) topic = args[++i]
    if (args[i] === '--personas' && args[i + 1]) personaNames = args[++i].split(',').map(s => s.trim())
  }

  console.log(`\n╔══════════════════════════════════════════╗`)
  console.log(`║  Stage 2: Topic-Scoped QBAF Extraction   ║`)
  console.log(`╚══════════════════════════════════════════╝\n`)
  console.log(`Topic: "${topic}"`)
  console.log(`Personas: ${personaNames.join(', ')}\n`)

  const slug = slugify(topic)
  const outDir = path.join('data', 'experiments', slug)
  await fs.mkdir(outDir, { recursive: true })

  for (const name of personaNames) {
    console.log(`─── ${name} ───`)

    // Load raw belief graph
    const beliefGraph = await loadBeliefGraph(name)
    if (!beliefGraph) {
      console.log(`  ✗ No belief graph found at data/seed/beliefs/${name}.json`)
      console.log(`  Run: npx tsx scripts/extract-beliefs.ts --only "${name}"`)
      continue
    }

    console.log(`  Belief graph: ${beliefGraph.nodes.length} nodes, ${beliefGraph.edges.length} edges`)

    // Extract QBAF
    console.log(`  Filtering by topic + building QBAF tree...`)
    const startTime = Date.now()
    const qbaf = await extractQBAFFromBeliefGraph(name, beliefGraph, topic)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  Done in ${elapsed}s`)

    // Print summary
    printQBAFSummary(qbaf)

    // Write output
    const outPath = path.join(outDir, `qbaf-${name}.json`)
    await fs.writeFile(outPath, JSON.stringify(qbaf, null, 2))
    console.log(`  Written to: ${outPath}\n`)
  }

  console.log(`\nAll QBAFs written to: ${outDir}/`)
  console.log(`Inspect the JSON files to verify:`)
  console.log(`  - Does every node map to a real belief graph concept?`)
  console.log(`  - Are base scores (τ) differentiated by evidence density?`)
  console.log(`  - Does the root claim represent the persona's core stance?`)
  console.log(`  - Is the tree structure natural, not forced?\n`)
}

function printQBAFSummary(qbaf: PersonaQBAF) {
  const root = qbaf.nodes.find(n => n.id === qbaf.rootClaim)!
  const depth1 = qbaf.nodes.filter(n => n.depth === 1)
  const depth2 = qbaf.nodes.filter(n => n.depth === 2)
  const attacks = qbaf.edges.filter(e => e.type === 'attack')
  const supports = qbaf.edges.filter(e => e.type === 'support')

  console.log(`\n  QBAF Summary:`)
  console.log(`    Root: "${root.claim}"`)
  console.log(`    Root τ = ${root.baseScore.toFixed(3)}, σ = ${root.dialecticalStrength.toFixed(3)}`)
  console.log(`    Nodes: ${qbaf.nodes.length} (1 root + ${depth1.length} depth-1 + ${depth2.length} depth-2)`)
  console.log(`    Edges: ${qbaf.edges.length} (${supports.length} support, ${attacks.length} attack)`)

  // Show base score distribution
  const scores = qbaf.nodes.map(n => n.baseScore)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length
  console.log(`    Base scores: min=${minScore.toFixed(3)}, avg=${avgScore.toFixed(3)}, max=${maxScore.toFixed(3)}`)

  // Show all nodes
  console.log(`\n  Nodes:`)
  for (const node of qbaf.nodes) {
    const typeLabel = node.type === 'root' ? '◉' : node.type === 'pro' ? '↑' : '↓'
    const indent = node.depth === 0 ? '    ' : node.depth === 1 ? '      ' : '        '
    console.log(`${indent}${typeLabel} [${node.id}] "${node.claim}"`)
    console.log(`${indent}  τ=${node.baseScore.toFixed(3)} σ=${node.dialecticalStrength.toFixed(3)} grounding=${node.grounding.length}`)
  }

  // Show edges
  console.log(`\n  Edges:`)
  for (const edge of qbaf.edges) {
    const arrow = edge.type === 'support' ? '──▷' : '──✗'
    console.log(`    ${edge.from} ${arrow} ${edge.to} (w=${edge.weight.toFixed(2)})`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
