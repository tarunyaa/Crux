// ─── Stage 3 CLI: Build Community Graph from Stage 2 QBAFs ────
// Usage: npx tsx scripts/build-community-graph.ts --topic "..." --personas "Citrini,Citadel"
//
// Reads data/experiments/{slug}/qbaf-{Name}.json → produces community.json + cruxes.json

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs/promises'
import * as path from 'path'
import { buildCommunityGraph, identifyCruxes } from '../lib/belief-graph/community-graph'
import type { PersonaQBAF } from '../lib/belief-graph/types'
import type { CommunityGraph, StructuralCrux } from '../lib/belief-graph/types'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function loadQBAF(slug: string, personaId: string): Promise<PersonaQBAF | null> {
  const filePath = path.join('data', 'experiments', slug, `qbaf-${personaId}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as PersonaQBAF
  } catch {
    return null
  }
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
  console.log(`║  Stage 3: Community Graph (pre-debate)    ║`)
  console.log(`╚══════════════════════════════════════════╝\n`)
  console.log(`Topic: "${topic}"`)
  console.log(`Personas: ${personaNames.join(', ')}\n`)

  const slug = slugify(topic)

  // Load Stage 2 QBAFs
  const qbafA = await loadQBAF(slug, personaNames[0])
  const qbafB = await loadQBAF(slug, personaNames[1])

  if (!qbafA || !qbafB) {
    console.error(`✗ Missing QBAF files. Run Stage 2 first:`)
    console.error(`  npx tsx scripts/extract-qbafs-from-beliefs.ts --topic "${topic}" --personas "${personaNames.join(',')}"`)
    process.exit(1)
  }

  console.log(`${personaNames[0]}: ${qbafA.nodes.length} nodes, ${qbafA.edges.length} edges, root σ = ${qbafA.nodes.find(n => n.id === qbafA.rootClaim)?.dialecticalStrength.toFixed(3)}`)
  console.log(`${personaNames[1]}: ${qbafB.nodes.length} nodes, ${qbafB.edges.length} edges, root σ = ${qbafB.nodes.find(n => n.id === qbafB.rootClaim)?.dialecticalStrength.toFixed(3)}`)

  // Build community graph
  console.log(`\n─── Building Community Graph ───`)
  console.log(`  Comparing ${qbafA.nodes.length} × ${qbafB.nodes.length} = ${qbafA.nodes.length * qbafB.nodes.length} node pairs for semantic similarity...`)

  const startTime = Date.now()
  const communityGraph = await buildCommunityGraph([qbafA, qbafB])
  const cgElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`  Done in ${cgElapsed}s`)

  printCommunityGraphSummary(communityGraph)

  // Identify cruxes
  console.log(`\n─── Identifying Cruxes ───`)
  const cruxStart = Date.now()
  const cruxes = await identifyCruxes(communityGraph, [qbafA, qbafB])
  const cruxElapsed = ((Date.now() - cruxStart) / 1000).toFixed(1)
  console.log(`  Done in ${cruxElapsed}s`)

  printCruxes(cruxes, personaNames)

  // Write outputs
  const outDir = path.join('data', 'experiments', slug)
  await fs.writeFile(path.join(outDir, 'community.json'), JSON.stringify(communityGraph, null, 2))
  await fs.writeFile(path.join(outDir, 'cruxes.json'), JSON.stringify(cruxes, null, 2))
  console.log(`\n  Written to: ${outDir}/community.json, cruxes.json`)

  // Diagnostic summary
  console.log(`\n─── Stage 3 Diagnostics ───`)
  const merged = communityGraph.nodes.filter(n => n.mergedFrom.length > 1)
  console.log(`  Merged nodes (semantic dedup): ${merged.length} / ${communityGraph.nodes.length}`)
  if (merged.length === 0) {
    console.log(`  ⚠ Zero merges means personas are talking past each other entirely.`)
    console.log(`    This is expected if their corpus-derived claims are very different.`)
  }
  console.log(`  Crux nodes: ${communityGraph.cruxNodes.length}`)
  console.log(`  Consensus nodes: ${communityGraph.consensusNodes.length}`)
  console.log(`  Neutral nodes: ${communityGraph.nodes.length - communityGraph.cruxNodes.length - communityGraph.consensusNodes.length}`)
  if (communityGraph.cruxNodes.length === 0 && cruxes.length === 0) {
    console.log(`  ⚠ No cruxes found. Possible causes:`)
    console.log(`    - Base score variance too low (all τ ≈ 0.6)`)
    console.log(`    - No semantic overlap between QBAFs`)
    console.log(`    - Crux threshold (0.3) too high for these base score ranges`)
  }
}

function printCommunityGraphSummary(cg: CommunityGraph) {
  console.log(`\n  Community Graph Summary:`)
  console.log(`    Nodes: ${cg.nodes.length}`)
  console.log(`    Edges: ${cg.edges.length}`)
  console.log(`    Crux nodes: ${cg.cruxNodes.length}`)
  console.log(`    Consensus nodes: ${cg.consensusNodes.length}`)

  const merged = cg.nodes.filter(n => n.mergedFrom.length > 1)
  if (merged.length > 0) {
    console.log(`\n  Merged Nodes (both personas claim similar things):`)
    for (const node of merged) {
      const scores = Object.entries(node.baseScores).map(([k, v]) => `${k}: τ=${v.toFixed(3)}`).join(', ')
      console.log(`    [${node.id}] "${node.claim}"`)
      console.log(`      ${scores} | variance=${node.variance.toFixed(4)} | ${node.classification}`)
    }
  }

  // Show classification breakdown
  for (const cls of ['crux', 'consensus', 'neutral'] as const) {
    const nodes = cg.nodes.filter(n => n.classification === cls)
    if (nodes.length > 0 && cls !== 'neutral') {
      console.log(`\n  ${cls.toUpperCase()} Nodes:`)
      for (const node of nodes) {
        const personas = Object.keys(node.baseScores).join('+')
        console.log(`    [${node.id}] "${node.claim}" (${personas}, var=${node.variance.toFixed(4)})`)
      }
    }
  }
}

function printCruxes(cruxes: StructuralCrux[], personaNames: string[]) {
  if (cruxes.length === 0) {
    console.log(`  No structural cruxes identified.`)
    return
  }

  console.log(`\n  Structural Cruxes (${cruxes.length}):`)
  for (const crux of cruxes) {
    console.log(`\n    ┌─ ${crux.claim}`)
    console.log(`    │  Score: ${crux.cruxScore.toFixed(4)} | Type: ${crux.disagreementType}`)
    for (const [pid, pos] of Object.entries(crux.personaPositions)) {
      console.log(`    │  ${pid}: τ=${pos.baseScore.toFixed(3)} σ=${pos.dialecticalStrength.toFixed(3)} impact=${pos.contribution.toFixed(4)}`)
    }
    console.log(`    │  Counterfactual: ${crux.counterfactual}`)
    console.log(`    └─ Settling Q: ${crux.settlingQuestion}`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
