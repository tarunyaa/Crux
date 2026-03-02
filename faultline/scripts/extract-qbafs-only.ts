// ─── Quick QBAF extraction for inspection ─────────────────────
// Usage: npx tsx scripts/extract-qbafs-only.ts --topic "..." --personas "Citrini,Citadel"
// Extracts individual QBAFs without running debate rounds, saves to data/experiments/

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { getPersona, loadContract, loadCorpus } from '../lib/personas/loader'
import { extractQBAF } from '../lib/belief-graph/extract-qbaf'
import { getTotalUsage, resetUsage } from '../lib/llm/client'

function parseArgs(): { topic: string; personas: string[] } {
  const args = process.argv.slice(2)
  let topic = 'Will AI cause net job losses in the next decade?'
  let personas = ['Citrini', 'Citadel']

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) {
      topic = args[++i]
    } else if (args[i] === '--personas' && args[i + 1]) {
      personas = args[++i].split(',').map(s => s.trim())
    }
  }

  return { topic, personas }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function main() {
  const { topic, personas } = parseArgs()

  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║       QBAF EXTRACTION (no debate rounds)            ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`Topic: ${topic}`)
  console.log(`Personas: ${personas.join(', ')}`)
  console.log('')

  resetUsage()
  const startTime = Date.now()

  const slug = slugify(topic)
  const outDir = path.join(process.cwd(), 'data', 'experiments', slug)
  await fs.mkdir(outDir, { recursive: true })

  for (const pid of personas) {
    console.log(`\n⏳ Extracting QBAF for ${pid}...`)

    const persona = await getPersona(pid)
    if (!persona) {
      console.error(`  ✗ Persona not found: ${pid}`)
      continue
    }

    const contract = await loadContract(pid)
    const corpus = await loadCorpus(pid)
    console.log(`  Corpus loaded: ${corpus.length} entries`)

    const qbaf = await extractQBAF(persona, contract, topic, corpus)

    console.log(`  ✓ ${qbaf.nodes.length} nodes, ${qbaf.edges.length} edges`)

    const root = qbaf.nodes.find(n => n.id === qbaf.rootClaim)
    console.log(`  Root: "${root?.claim}"`)
    console.log(`  Root σ: ${root?.dialecticalStrength.toFixed(3)}`)

    // Print grounding summary
    console.log(`\n  ── Grounding Report ──`)
    for (const node of qbaf.nodes) {
      const groundingStr = node.grounding.length > 0
        ? node.grounding.join(', ')
        : '(none)'
      console.log(`  [${node.id}] ${node.type} | grounding: ${groundingStr}`)
      console.log(`    "${node.claim.slice(0, 100)}${node.claim.length > 100 ? '...' : ''}"`)
    }

    const filename = `qbaf-${slugify(pid)}.json`
    await fs.writeFile(path.join(outDir, filename), JSON.stringify(qbaf, null, 2))
    console.log(`  Saved: ${path.join(outDir, filename)}`)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const usage = getTotalUsage()

  console.log(`\n╔══════════════════════════════════════════════════════╗`)
  console.log(`║  EXTRACTION COMPLETE                                 ║`)
  console.log(`╠══════════════════════════════════════════════════════╣`)
  console.log(`║  Time: ${elapsed}s`)
  console.log(`║  Tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`)
  console.log(`║  Output: ${outDir}`)
  console.log(`╚══════════════════════════════════════════════════════╝`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
