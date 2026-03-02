// ─── Stage 4 CLI: Single Debate Round ─────────────────────────
// Usage: npx tsx scripts/run-debate-round.ts --topic "..." --personas "Citrini,Citadel"
//
// Loads Stage 2 QBAFs, runs 1 debate round, saves pre/post state.

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs/promises'
import * as path from 'path'
import { runDebateRound } from '../lib/belief-graph/debate-round'
import { getPersona, loadContract } from '../lib/personas/loader'
import type { PersonaQBAF } from '../lib/belief-graph/types'

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

function rootStrength(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.dialecticalStrength ?? 0
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
  console.log(`║  Stage 4: Single Debate Round             ║`)
  console.log(`╚══════════════════════════════════════════╝\n`)
  console.log(`Topic: "${topic}"`)
  console.log(`Personas: ${personaNames.join(' vs ')}\n`)

  const slug = slugify(topic)
  const outDir = path.join('data', 'experiments', slug)

  // Load Stage 2 QBAFs
  const qbafA = await loadQBAF(slug, personaNames[0])
  const qbafB = await loadQBAF(slug, personaNames[1])
  if (!qbafA || !qbafB) {
    console.error(`✗ Missing QBAF files. Run Stage 2 first.`)
    process.exit(1)
  }

  // Load personas and contracts
  const personaA = await getPersona(personaNames[0])
  const personaB = await getPersona(personaNames[1])
  if (!personaA || !personaB) {
    console.error(`✗ Missing persona data.`)
    process.exit(1)
  }

  const contractA = await loadContract(personaNames[0])
  const contractB = await loadContract(personaNames[1])
  if (!contractA || !contractB) {
    console.error(`✗ Missing contracts.`)
    process.exit(1)
  }

  // Pre-debate snapshot
  const preRootA = rootStrength(qbafA)
  const preRootB = rootStrength(qbafB)
  console.log(`─── Pre-Debate ───`)
  console.log(`  ${personaNames[0]}: ${qbafA.nodes.length} nodes, root σ = ${preRootA.toFixed(3)}`)
  console.log(`  ${personaNames[1]}: ${qbafB.nodes.length} nodes, root σ = ${preRootB.toFixed(3)}`)

  // Save pre-debate state
  await fs.writeFile(path.join(outDir, `round-0-${personaNames[0]}.json`), JSON.stringify(qbafA, null, 2))
  await fs.writeFile(path.join(outDir, `round-0-${personaNames[1]}.json`), JSON.stringify(qbafB, null, 2))

  // Run 1 debate round
  console.log(`\n─── Running Debate Round 1 ───`)
  const startTime = Date.now()
  const result = await runDebateRound(qbafA, qbafB, personaA, personaB, contractA, contractB, 1)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`  Done in ${elapsed}s`)

  // Post-debate snapshot
  const postRootA = rootStrength(result.qbafA)
  const postRootB = rootStrength(result.qbafB)

  console.log(`\n─── Post-Debate ───`)
  console.log(`  ${personaNames[0]}: ${result.qbafA.nodes.length} nodes (+${result.newNodesA}), root σ = ${postRootA.toFixed(3)} (Δ = ${(postRootA - preRootA).toFixed(4)})`)
  console.log(`  ${personaNames[1]}: ${result.qbafB.nodes.length} nodes (+${result.newNodesB}), root σ = ${postRootB.toFixed(3)} (Δ = ${(postRootB - preRootB).toFixed(4)})`)

  // Show new nodes (debate moves)
  console.log(`\n─── ${personaNames[1]}'s Moves on ${personaNames[0]}'s Graph ───`)
  const newNodesOnA = result.qbafA.nodes.filter(n => n.personaId === personaNames[1])
  for (const node of newNodesOnA) {
    const edge = result.qbafA.edges.find(e => e.from === node.id)
    const targetNode = edge ? result.qbafA.nodes.find(n => n.id === edge.to) : null
    const arrow = edge?.type === 'attack' ? '✗' : '▷'
    console.log(`  ${arrow} "${node.claim}"`)
    console.log(`    → targets: "${targetNode?.claim ?? edge?.to}" (${edge?.type}, w=${edge?.weight.toFixed(2)})`)
    console.log(`    τ=${node.baseScore.toFixed(3)} σ=${node.dialecticalStrength.toFixed(3)} grounding=[${node.grounding.join(', ')}]`)
  }

  console.log(`\n─── ${personaNames[0]}'s Moves on ${personaNames[1]}'s Graph ───`)
  const newNodesOnB = result.qbafB.nodes.filter(n => n.personaId === personaNames[0])
  for (const node of newNodesOnB) {
    const edge = result.qbafB.edges.find(e => e.from === node.id)
    const targetNode = edge ? result.qbafB.nodes.find(n => n.id === edge.to) : null
    const arrow = edge?.type === 'attack' ? '✗' : '▷'
    console.log(`  ${arrow} "${node.claim}"`)
    console.log(`    → targets: "${targetNode?.claim ?? edge?.to}" (${edge?.type}, w=${edge?.weight.toFixed(2)})`)
    console.log(`    τ=${node.baseScore.toFixed(3)} σ=${node.dialecticalStrength.toFixed(3)} grounding=[${node.grounding.join(', ')}]`)
  }

  // Save post-debate state
  await fs.writeFile(path.join(outDir, `round-1-${personaNames[0]}.json`), JSON.stringify(result.qbafA, null, 2))
  await fs.writeFile(path.join(outDir, `round-1-${personaNames[1]}.json`), JSON.stringify(result.qbafB, null, 2))

  console.log(`\n  Written to: ${outDir}/round-1-*.json`)

  // Diagnostics
  console.log(`\n─── Stage 4 Diagnostics ───`)
  const allNewNodes = [...newNodesOnA, ...newNodesOnB]
  const attacks = allNewNodes.filter(n => n.type === 'con')
  const supports = allNewNodes.filter(n => n.type === 'pro')
  console.log(`  Total new nodes: ${allNewNodes.length} (${attacks.length} attacks, ${supports.length} supports)`)

  // Check if targets are valid
  const invalidTargetsA = newNodesOnA.filter(n => {
    const edge = result.qbafA.edges.find(e => e.from === n.id)
    return edge && !qbafA.nodes.some(orig => orig.id === edge.to)
  })
  const invalidTargetsB = newNodesOnB.filter(n => {
    const edge = result.qbafB.edges.find(e => e.from === n.id)
    return edge && !qbafB.nodes.some(orig => orig.id === edge.to)
  })
  if (invalidTargetsA.length > 0 || invalidTargetsB.length > 0) {
    console.log(`  ⚠ ${invalidTargetsA.length + invalidTargetsB.length} moves targeted invalid node IDs`)
  }

  const rootShiftA = Math.abs(postRootA - preRootA)
  const rootShiftB = Math.abs(postRootB - preRootB)
  console.log(`  Root σ shift: ${personaNames[0]} ${rootShiftA.toFixed(4)}, ${personaNames[1]} ${rootShiftB.toFixed(4)}`)
  if (rootShiftA < 0.001 && rootShiftB < 0.001) {
    console.log(`  ⚠ Negligible impact — debate moves didn't materially affect root strengths.`)
    console.log(`    Possible causes: moves targeted leaf nodes, base scores too similar, weights too low.`)
  } else if (rootShiftA > 0.3 || rootShiftB > 0.3) {
    console.log(`  ⚠ Large shift — one round changed root σ by >0.3. Moves may be overweighted.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
