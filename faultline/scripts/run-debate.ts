import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { runDebate } from '@/lib/debate/engine'
import { getPersonas } from '@/lib/personas/loader'
import type { DebateEngineConfig } from '@/lib/types/debate-engine'

// ─── CLI Argument Parsing ───────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].slice(2)
      parsed[key] = args[i + 1]
      i++
    }
  }

  return parsed
}

// ─── Pretty Print ───────────────────────────────────────────

function log(msg: string) {
  console.log(msg)
}

function separator() {
  log('─'.repeat(60))
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = parseArgs()

  if (!args.topic) {
    console.error('Usage: npx tsx scripts/run-debate.ts --topic "..." [--personas "Name1,Name2"] [--max-turns 30]')
    process.exit(1)
  }

  const topic = args.topic
  const maxTurns = parseInt(args['max-turns'] ?? '30', 10)

  // Resolve persona IDs
  let personaIds: string[]

  if (args.personas) {
    const names = args.personas.split(',').map(n => n.trim())
    const allPersonas = await getPersonas()
    personaIds = []
    for (const name of names) {
      const persona = allPersonas.find(p => p.name.toLowerCase() === name.toLowerCase())
      if (!persona) {
        console.error(`Persona not found: "${name}"`)
        console.error(`Available: ${allPersonas.map(p => p.name).join(', ')}`)
        process.exit(1)
      }
      personaIds.push(persona.id)
    }
  } else {
    console.error('Must specify --personas')
    process.exit(1)
  }

  const config: DebateEngineConfig = {
    topic,
    personaIds,
    maxTurns,
  }

  log('')
  separator()
  log(`  FAULTLINE DEBATE ENGINE v2`)
  separator()
  log(`  Topic: ${topic}`)
  log(`  Personas: ${personaIds.join(', ')}`)
  log(`  Max Turns: ${maxTurns}`)
  separator()
  log('')

  let output

  for await (const event of runDebate(config)) {
    switch (event.type) {
      case 'engine_start':
        log(`[START] Debate on: "${event.topic}"`)
        break

      case 'phase_start':
        log('')
        separator()
        log(`  PHASE ${event.phase}${event.phase === 1 ? ' — Opening Statements' : event.phase === 2 ? ' — Free Exchange' : event.phase === 3 ? ' — Crux Seeking' : ' — Resolution'}`)
        separator()
        break

      case 'phase_transition':
        log(`  [TRANSITION] Phase ${event.from} → ${event.to}: ${event.reason}`)
        break

      case 'dialogue_turn': {
        const t = event.turn
        log(`  [${t.move}] ${t.personaId}:`)
        log(`    "${t.dialogue}"`)
        if (t.steeringHint) {
          log(`    (moderator: ${t.steeringHint.slice(0, 80)})`)
        }
        break
      }

      case 'steering':
        log(`  [MODERATOR → ${event.targetPersonaId}] ${event.hint.slice(0, 100)}`)
        break

      case 'crystallization': {
        const r = event.result
        const parts: string[] = []
        if (r.newArgs.length > 0) parts.push(`+${r.newArgs.length} args`)
        if (r.updatedArgs.length > 0) parts.push(`~${r.updatedArgs.length} updated`)
        if (r.removedArgIds.length > 0) parts.push(`-${r.removedArgIds.length} removed`)
        if (r.newAttacks.length > 0) parts.push(`+${r.newAttacks.length} attacks`)
        if (r.removedAttackIds.length > 0) parts.push(`-${r.removedAttackIds.length} attacks removed`)
        log(`  [CRYSTALLIZE] ${parts.join(', ') || 'no changes'}`)
        break
      }

      case 'graph_updated':
        log(`  [GRAPH] IN=${event.inCount} OUT=${event.outCount} UNDEC=${event.undecCount} | ${event.preferredCount} preferred`)
        break

      case 'concession':
        log(`  [CONCESSION] ${event.concession.personaId}: ${event.concession.effect.slice(0, 100)}`)
        break

      case 'crux_proposed':
        log(`  [CRUX] ${event.personaId}: "${event.statement.slice(0, 120)}"`)
        break

      case 'convergence_check':
        if (event.converged) {
          log(`  [CONVERGED] ${event.reason}`)
        }
        break

      case 'engine_complete':
        output = event.output
        break

      case 'engine_error':
        console.error(`  [ERROR] ${event.message}`)
        break
    }
  }

  if (!output) {
    console.error('Engine did not produce output')
    process.exit(1)
  }

  // Print final insights
  log('')
  separator()
  log('  RESULTS')
  separator()

  log(`  Regime: ${output.regime} — ${output.regimeDescription}`)
  log('')

  if (output.crux) {
    log(`  Crux:`)
    log(`    "${output.crux.statement.slice(0, 200)}"`)
    log(`    Proposed by: ${output.crux.proposedBy.join(', ')}`)
    log(`    Acknowledged: ${output.crux.acknowledged ? 'yes' : 'no'}`)
    log('')
  }

  log(`  Common Ground (${output.commonGround.length} args):`)
  for (const argId of output.commonGround.slice(0, 5)) {
    const arg = output.graph.arguments.find(a => a.id === argId)
    if (arg) log(`    - [${argId}] (${arg.speakerId}): ${arg.claim.slice(0, 100)}`)
  }
  log('')

  log(`  Camps (${output.camps.length}):`)
  for (const camp of output.camps) {
    log(`    Camp ${camp.extensionIndex}: ${camp.argumentIds.length} args | Speakers: ${camp.personaIds.join(', ')}`)
    for (const argId of camp.argumentIds.slice(0, 3)) {
      const arg = output.graph.arguments.find(a => a.id === argId)
      if (arg) log(`      - [${argId}]: ${arg.claim.slice(0, 80)}`)
    }
  }
  log('')

  if (output.concessionTrail.length > 0) {
    log(`  Concession Trail (${output.concessionTrail.length}):`)
    for (const c of output.concessionTrail) {
      log(`    - ${c.personaId} (${c.type}): ${c.effect.slice(0, 100)}`)
    }
    log('')
  }

  // Final graph
  log(`  Final Graph: ${output.graph.arguments.length} args, ${output.graph.attacks.length} attacks`)
  for (const arg of output.graph.arguments) {
    const label = output.graph.labelling.labels.get(arg.id) ?? 'UNDEC'
    log(`    [${arg.id}] [${label}] (${arg.speakerId}): ${arg.claim.slice(0, 80)}`)
  }
  log('')

  // Token usage & timing
  log(`  Tokens: ${output.tokenUsage.inputTokens.toLocaleString()} in / ${output.tokenUsage.outputTokens.toLocaleString()} out`)
  log(`  Duration: ${(output.duration / 1000).toFixed(1)}s`)
  log(`  Turns: ${output.transcript.length}`)

  // Save output
  const outputDir = path.join(process.cwd(), 'data/outputs')
  await fs.mkdir(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const outputPath = path.join(outputDir, `debate-v2-${slug}-${timestamp}.json`)

  const serializable = JSON.parse(JSON.stringify(output, (key, value) => {
    if (value instanceof Set) return [...value]
    if (value instanceof Map) return Object.fromEntries(value)
    return value
  }))

  await fs.writeFile(outputPath, JSON.stringify(serializable, null, 2))
  log('')
  log(`  Output saved to: ${outputPath}`)
  separator()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
