/**
 * synthesize-worldviews.ts
 *
 * Stage 1.5: Synthesize cross-corpus worldviews from raw belief graphs.
 * Reads belief graph JSON, clusters nodes, extracts positions + implicit
 * assumptions via Sonnet, and optionally diffs assumptions across personas.
 *
 * Usage:
 *   npx tsx scripts/synthesize-worldviews.ts
 *   npx tsx scripts/synthesize-worldviews.ts --only "Jukan"
 *   npx tsx scripts/synthesize-worldviews.ts --diff --topic "Memory supercycle"
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs/promises'
import path from 'path'
import { synthesizeWorldview, diffAssumptions } from '../lib/belief-graph/worldview-synthesis'
import type { BeliefGraph } from '../lib/types'
import type { PersonaWorldview, AssumptionConflict } from '../lib/belief-graph/worldview-types'

const BELIEFS_DIR = path.join(process.cwd(), 'data', 'seed', 'beliefs')
const WORLDVIEWS_DIR = path.join(process.cwd(), 'data', 'seed', 'worldviews')
const CONTRACTS_DIR = path.join(process.cwd(), 'data', 'seed', 'contracts')

async function loadContract(name: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(path.join(CONTRACTS_DIR, `${name}.json`), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function processPersona(name: string): Promise<PersonaWorldview | null> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Synthesizing worldview: ${name}`)
  console.log(`${'='.repeat(60)}`)

  // Load belief graph
  const beliefPath = path.join(BELIEFS_DIR, `${name}.json`)
  let beliefGraph: BeliefGraph
  try {
    const raw = await fs.readFile(beliefPath, 'utf-8')
    beliefGraph = JSON.parse(raw)
  } catch {
    console.error(`  ERROR: No belief graph found at ${beliefPath}`)
    return null
  }

  console.log(`  Loaded belief graph: ${beliefGraph.nodes.length} nodes, ${beliefGraph.edges.length} edges`)

  // Load contract
  const contract = await loadContract(name)

  // Synthesize
  const worldview = await synthesizeWorldview(
    name,
    beliefGraph.personaName ?? name,
    beliefGraph,
    contract,
  )

  // Write output
  await fs.mkdir(WORLDVIEWS_DIR, { recursive: true })
  const outPath = path.join(WORLDVIEWS_DIR, `${name}.json`)
  await fs.writeFile(outPath, JSON.stringify(worldview, null, 2))
  console.log(`  Wrote: ${outPath}`)

  // Print summary
  console.log(`\n  Positions:`)
  for (const pos of worldview.positions) {
    console.log(`    [${pos.type}] ${pos.claim} (conf=${pos.confidence})`)
    for (const a of pos.implicitAssumptions) {
      console.log(`      ↳ assumes: ${a}`)
    }
  }

  return worldview
}

async function main() {
  console.log('Faultline — Worldview Synthesis (Stage 1.5)\n')

  // Parse flags
  const args = process.argv.slice(2)
  const onlyIndex = args.indexOf('--only')
  const onlyName = onlyIndex !== -1 ? args[onlyIndex + 1] : null
  const doDiff = args.includes('--diff')
  const topicIndex = args.indexOf('--topic')
  const topic = topicIndex !== -1 ? args[topicIndex + 1] : 'General'

  // Discover belief graph files
  const files = await fs.readdir(BELIEFS_DIR)
  const beliefFiles = files.filter(f => f.endsWith('.json'))
  const personaNames = beliefFiles.map(f => f.replace('.json', ''))

  if (onlyName) {
    if (!personaNames.includes(onlyName)) {
      console.error(`ERROR: No belief graph for "${onlyName}". Available: ${personaNames.join(', ')}`)
      process.exit(1)
    }
    await processPersona(onlyName)
  } else {
    console.log(`Found ${personaNames.length} belief graphs: ${personaNames.join(', ')}\n`)
    const worldviews: PersonaWorldview[] = []

    for (const name of personaNames) {
      const wv = await processPersona(name)
      if (wv) worldviews.push(wv)
    }

    // Optional: Diff assumptions across all pairs
    if (doDiff && worldviews.length >= 2) {
      console.log(`\n${'━'.repeat(60)}`)
      console.log(`Diffing assumptions across ${worldviews.length} personas on: "${topic}"`)
      console.log(`${'━'.repeat(60)}`)

      const allConflicts: AssumptionConflict[] = []
      for (let i = 0; i < worldviews.length; i++) {
        for (let j = i + 1; j < worldviews.length; j++) {
          console.log(`\n  ${worldviews[i].personaName} vs ${worldviews[j].personaName}:`)
          const conflicts = await diffAssumptions(worldviews[i], worldviews[j], topic)
          for (const c of conflicts) {
            console.log(`    [${c.conflictType}] "${c.assumptionA}" vs "${c.assumptionB}"`)
            console.log(`      → ${c.settlingQuestion}`)
          }
          allConflicts.push(...conflicts)
        }
      }

      // Write conflicts
      const conflictsPath = path.join(WORLDVIEWS_DIR, '_conflicts.json')
      await fs.writeFile(conflictsPath, JSON.stringify(allConflicts, null, 2))
      console.log(`\n  Wrote ${allConflicts.length} conflicts to: ${conflictsPath}`)
    }
  }

  console.log('\nDone!')
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err)
  process.exit(1)
})
