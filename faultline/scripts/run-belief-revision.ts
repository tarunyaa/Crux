// ─── Stage 5 CLI: Belief Revision after Debate Round ──────────
// Usage: npx tsx scripts/run-belief-revision.ts --topic "..." --personas "Citrini,Citadel"
//
// Loads round-1 QBAFs (post-debate), runs belief revision on both, saves results.

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs/promises'
import * as path from 'path'
import { determineTargetStrength, reviseBeliefs, applyRevision } from '../lib/belief-graph/belief-revision'
import type { PersonaQBAF } from '../lib/belief-graph/types'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function loadQBAF(filePath: string): Promise<PersonaQBAF | null> {
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

function rootBaseScore(qbaf: PersonaQBAF): number {
  return qbaf.nodes.find(n => n.id === qbaf.rootClaim)?.baseScore ?? 0
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
  console.log(`║  Stage 5: Belief Revision                 ║`)
  console.log(`╚══════════════════════════════════════════╝\n`)
  console.log(`Topic: "${topic}"`)
  console.log(`Personas: ${personaNames.join(', ')}\n`)

  const slug = slugify(topic)
  const outDir = path.join('data', 'experiments', slug)

  // Load post-debate (round 1) QBAFs
  const qbafA = await loadQBAF(path.join(outDir, `round-1-${personaNames[0]}.json`))
  const qbafB = await loadQBAF(path.join(outDir, `round-1-${personaNames[1]}.json`))

  if (!qbafA || !qbafB) {
    console.error(`✗ Missing round-1 QBAFs. Run Stage 4 first.`)
    process.exit(1)
  }

  // Also load pre-debate (round 0) for comparison
  const preA = await loadQBAF(path.join(outDir, `round-0-${personaNames[0]}.json`))
  const preB = await loadQBAF(path.join(outDir, `round-0-${personaNames[1]}.json`))

  for (let p = 0; p < 2; p++) {
    const name = personaNames[p]
    const qbaf = p === 0 ? qbafA : qbafB
    const pre = p === 0 ? preA : preB
    const opponentName = personaNames[1 - p]

    console.log(`─── ${name} ───`)
    console.log(`  Pre-debate root σ = ${pre ? rootStrength(pre).toFixed(4) : '?'}`)
    console.log(`  Post-debate root σ = ${rootStrength(qbaf).toFixed(4)} (after ${opponentName}'s attacks)`)

    // Identify new attacks received
    const newAttackNodes = qbaf.nodes.filter(n => n.personaId !== name)
    const attackClaims = newAttackNodes.map(n => n.claim)

    console.log(`  Attacks received: ${attackClaims.length}`)
    for (const claim of attackClaims) {
      console.log(`    - "${claim.slice(0, 100)}${claim.length > 100 ? '...' : ''}"`)
    }

    // Step 1: Determine target strength
    console.log(`\n  Determining target σ* (Haiku)...`)
    const { target: targetStrength, R, rawTarget, reasoning } = await determineTargetStrength(qbaf, attackClaims, name)
    console.log(`  Raw σ* = ${rawTarget.toFixed(4)}, R = ${R.toFixed(2)} → Modulated σ* = ${targetStrength.toFixed(4)}`)
    console.log(`  Current σ = ${rootStrength(qbaf).toFixed(4)}, gap = ${(targetStrength - rootStrength(qbaf)).toFixed(4)}`)
    if (reasoning) console.log(`  ${reasoning}`)

    // Step 2: CE-QArg revision
    console.log(`\n  Running CE-QArg revision...`)
    const revision = reviseBeliefs(qbaf, targetStrength)
    console.log(`  Total shift: Σ|Δτ| = ${revision.totalShift.toFixed(4)}`)

    const adjustedEntries = Object.entries(revision.adjustedScores)
    if (adjustedEntries.length > 0) {
      console.log(`  Adjusted nodes (${adjustedEntries.length}):`)
      for (const [nodeId, newScore] of adjustedEntries) {
        const origNode = qbaf.nodes.find(n => n.id === nodeId)
        const origScore = origNode?.baseScore ?? 0
        const delta = newScore - origScore
        const polarity = revision.polarityMap[nodeId] || 'neutral'
        console.log(`    ${nodeId}: τ ${origScore.toFixed(3)} → ${newScore.toFixed(3)} (Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(3)}, polarity=${polarity})`)
      }
    } else {
      console.log(`  No nodes adjusted (already at target or gap too small).`)
    }

    // Step 3: Apply revision
    const revised = applyRevision(qbaf, revision)
    const postRevisionStrength = rootStrength(revised)
    console.log(`\n  Post-revision root σ = ${postRevisionStrength.toFixed(4)}`)
    console.log(`  Full trajectory: ${pre ? rootStrength(pre).toFixed(3) : '?'} (pre) → ${rootStrength(qbaf).toFixed(3)} (post-debate) → ${postRevisionStrength.toFixed(3)} (post-revision)`)

    // Save revised QBAF
    const outPath = path.join(outDir, `revised-1-${name}.json`)
    await fs.writeFile(outPath, JSON.stringify(revised, null, 2))
    console.log(`  Written to: ${outPath}\n`)
  }

  // Diagnostics
  console.log(`─── Stage 5 Diagnostics ───`)
  const revisedA = JSON.parse(await fs.readFile(path.join(outDir, `revised-1-${personaNames[0]}.json`), 'utf-8')) as PersonaQBAF
  const revisedB = JSON.parse(await fs.readFile(path.join(outDir, `revised-1-${personaNames[1]}.json`), 'utf-8')) as PersonaQBAF

  const rA = rootStrength(revisedA)
  const rB = rootStrength(revisedB)
  const preRA = preA ? rootStrength(preA) : 0
  const preRB = preB ? rootStrength(preB) : 0

  console.log(`  ${personaNames[0]}: σ ${preRA.toFixed(3)} → ${rA.toFixed(3)} (total Δ = ${(rA - preRA).toFixed(4)})`)
  console.log(`  ${personaNames[1]}: σ ${preRB.toFixed(3)} → ${rB.toFixed(3)} (total Δ = ${(rB - preRB).toFixed(4)})`)
  console.log(`  Stance divergence: |σA - σB| = ${Math.abs(rA - rB).toFixed(4)}`)

  if (Math.abs(rA - preRA) < 0.01 && Math.abs(rB - preRB) < 0.01) {
    console.log(`  ⚠ Minimal revision — neither persona updated meaningfully.`)
    console.log(`    If σ* was close to current σ, Haiku may be too conservative.`)
    console.log(`    Consider: persona-modulated revision (Stage 7) for differentiated responses.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
