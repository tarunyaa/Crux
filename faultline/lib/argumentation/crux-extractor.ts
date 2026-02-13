import type { PersonaId, DebateOutput } from '@/lib/types'
import type {
  ArgumentationGraphState,
  GraphDebateOutput,
  GraphCamp,
  CruxAssumption,
  Argument,
} from '@/lib/types/graph'

// ─── Extract Graph Output ───────────────────────────────────

export function extractGraphOutput(state: ArgumentationGraphState): GraphDebateOutput {
  const argById = new Map(state.arguments.map(a => [a.id, a]))

  // 1. Common ground = arguments in grounded extension
  const commonGround: Argument[] = []
  for (const argId of state.groundedExtension) {
    const arg = argById.get(argId)
    if (arg) commonGround.push(arg)
  }

  // 2. Camps = arguments in each preferred extension
  const camps: GraphCamp[] = state.preferredExtensions.map((ext, idx) => {
    const argIds = [...ext]
    const speakerIds = new Set<PersonaId>()
    for (const id of argIds) {
      const arg = argById.get(id)
      if (arg) speakerIds.add(arg.speakerId)
    }
    return {
      extensionIndex: idx,
      argumentIds: argIds,
      speakerIds: [...speakerIds],
    }
  })

  // 3. Symmetric difference of top 2 preferred extensions
  const symmetricDifference: Argument[] = []
  if (state.preferredExtensions.length >= 2) {
    const ext0 = state.preferredExtensions[0]
    const ext1 = state.preferredExtensions[1]

    for (const id of ext0) {
      if (!ext1.has(id)) {
        const arg = argById.get(id)
        if (arg) symmetricDifference.push(arg)
      }
    }
    for (const id of ext1) {
      if (!ext0.has(id)) {
        const arg = argById.get(id)
        if (arg) symmetricDifference.push(arg)
      }
    }
  }

  // 4. Extract crux assumptions — with fallback strategies
  const attackDegree = new Map<string, number>()
  for (const atk of state.attacks) {
    const valid = state.validationResults.find(v => v.attackId === atk.id)
    if (!valid?.valid) continue
    attackDegree.set(atk.fromArgId, (attackDegree.get(atk.fromArgId) ?? 0) + 1)
    attackDegree.set(atk.toArgId, (attackDegree.get(atk.toArgId) ?? 0) + 1)
  }

  let cruxAssumptions = extractFromAssumptions(symmetricDifference, state, attackDegree)

  // Fallback 1: If no assumptions found in symmetric diff, try UNDEC arguments
  if (cruxAssumptions.length === 0) {
    const undecArgs = state.arguments.filter(
      a => state.labelling.labels.get(a.id) === 'UNDEC'
    )
    cruxAssumptions = extractFromAssumptions(undecArgs, state, attackDegree)
  }

  // Fallback 2: Extract cruxes from the most-attacked argument claims
  if (cruxAssumptions.length === 0) {
    cruxAssumptions = extractFromAttackTargets(state, attackDegree)
  }

  // Fallback 3: Use the highest-centrality argument claims as cruxes
  if (cruxAssumptions.length === 0) {
    cruxAssumptions = extractFromTopArguments(state, attackDegree)
  }

  return {
    commonGround,
    camps,
    cruxAssumptions,
    symmetricDifference,
  }
}

// ─── Crux Extraction Strategies ─────────────────────────────

/**
 * Primary strategy: extract from argument assumptions.
 */
function extractFromAssumptions(
  disputedArgs: Argument[],
  state: ArgumentationGraphState,
  attackDegree: Map<string, number>,
): CruxAssumption[] {
  const assumptionMap = new Map<string, string[]>()

  for (const arg of disputedArgs) {
    // Try assumptions first
    for (const assumption of arg.assumptions) {
      if (!assumption.trim()) continue
      const normalized = assumption.toLowerCase().trim()
      if (!assumptionMap.has(normalized)) assumptionMap.set(normalized, [])
      assumptionMap.get(normalized)!.push(arg.id)
    }
    // Also consider premises as implicit assumptions
    for (const premise of arg.premises) {
      if (!premise.trim()) continue
      const normalized = premise.toLowerCase().trim()
      if (!assumptionMap.has(normalized)) assumptionMap.set(normalized, [])
      assumptionMap.get(normalized)!.push(arg.id)
    }
  }

  return rankAssumptions(assumptionMap, attackDegree)
}

/**
 * Fallback: extract cruxes from the contested edges in the graph.
 * The most-attacked arguments represent the core disagreements.
 */
function extractFromAttackTargets(
  state: ArgumentationGraphState,
  attackDegree: Map<string, number>,
): CruxAssumption[] {
  const argById = new Map(state.arguments.map(a => [a.id, a]))

  // Find arguments that are attacked by multiple different speakers
  const targetAttackers = new Map<string, Set<string>>()
  for (const atk of state.attacks) {
    const valid = state.validationResults.find(v => v.attackId === atk.id)
    if (!valid?.valid) continue
    if (!targetAttackers.has(atk.toArgId)) targetAttackers.set(atk.toArgId, new Set())
    targetAttackers.get(atk.toArgId)!.add(atk.speakerId)
  }

  // Arguments attacked by multiple speakers are genuine cruxes
  const contested = [...targetAttackers.entries()]
    .filter(([, attackers]) => attackers.size >= 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)

  const assumptionMap = new Map<string, string[]>()
  for (const [argId] of contested) {
    const arg = argById.get(argId)
    if (!arg) continue
    // The claim itself is the contested proposition
    const normalized = arg.claim.toLowerCase().trim()
    if (!assumptionMap.has(normalized)) assumptionMap.set(normalized, [])
    assumptionMap.get(normalized)!.push(argId)

    // Also find the counter-propositions attacking it
    for (const atk of state.attacks) {
      if (atk.toArgId !== argId) continue
      const valid = state.validationResults.find(v => v.attackId === atk.id)
      if (!valid?.valid) continue
      const counterNorm = atk.counterProposition.toLowerCase().trim()
      if (!assumptionMap.has(counterNorm)) assumptionMap.set(counterNorm, [])
      assumptionMap.get(counterNorm)!.push(atk.fromArgId)
    }
  }

  return rankAssumptions(assumptionMap, attackDegree)
}

/**
 * Last resort: pick the arguments with highest attack degree as cruxes.
 */
function extractFromTopArguments(
  state: ArgumentationGraphState,
  attackDegree: Map<string, number>,
): CruxAssumption[] {
  const sorted = state.arguments
    .map(a => ({ arg: a, degree: attackDegree.get(a.id) ?? 0 }))
    .filter(x => x.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 3)

  return sorted.map(({ arg, degree }) => ({
    assumption: arg.claim,
    dependentArgIds: [arg.id],
    centrality: degree,
    settlingQuestion: generateSettlingQuestion(arg.claim),
  }))
}

/**
 * Rank candidate assumptions by dependent arg count and centrality.
 */
function rankAssumptions(
  assumptionMap: Map<string, string[]>,
  attackDegree: Map<string, number>,
): CruxAssumption[] {
  return [...assumptionMap.entries()]
    .map(([assumption, depIds]) => {
      const uniqueDepIds = [...new Set(depIds)]
      const centrality = uniqueDepIds.reduce(
        (sum, id) => sum + (attackDegree.get(id) ?? 0),
        0
      )
      return {
        assumption,
        dependentArgIds: uniqueDepIds,
        centrality,
        settlingQuestion: generateSettlingQuestion(assumption),
      }
    })
    .sort((a, b) => {
      const countDiff = b.dependentArgIds.length - a.dependentArgIds.length
      if (countDiff !== 0) return countDiff
      return b.centrality - a.centrality
    })
    .slice(0, 3)
}

// ─── Map to DebateOutput ────────────────────────────────────

/**
 * Convert graph-based output to the existing DebateOutput format
 * for backward compatibility with the frontend.
 */
export function mapToDebateOutput(
  graphOutput: GraphDebateOutput,
  state: ArgumentationGraphState,
  personaIds: PersonaId[],
): DebateOutput {
  const argById = new Map(state.arguments.map(a => [a.id, a]))

  // Cruxes from crux assumptions
  const cruxes = graphOutput.cruxAssumptions.map((ca, i) => ({
    id: `crux-${i + 1}`,
    proposition: ca.assumption,
    weight: Math.min(1, ca.centrality > 0 ? ca.centrality / Math.max(1, ...graphOutput.cruxAssumptions.map(c => c.centrality)) : 0.5),
    surfacedByTables: [0],
    resolved: false,
  }))

  // Fault lines: identify what actually divides the camps
  const faultLines = buildFaultLines(graphOutput, state, argById, cruxes.map(c => c.id))

  // Flip conditions: what would change the graph outcome
  const flipConditions = buildFlipConditions(state, personaIds)

  // Evidence ledger: concise, deduplicated, with real reasons
  const evidenceLedger = buildEvidenceLedger(state, personaIds)

  // Resolution paths from settling questions
  const resolutionPaths = graphOutput.cruxAssumptions
    .filter(ca => ca.settlingQuestion)
    .map(ca => ({
      description: ca.settlingQuestion,
      relatedCruxIds: cruxes
        .filter(c => c.proposition === ca.assumption)
        .map(c => c.id),
    }))

  return {
    cruxes,
    faultLines,
    flipConditions,
    evidenceLedger,
    resolutionPaths,
  }
}

// ─── Fault Lines ────────────────────────────────────────────

function buildFaultLines(
  graphOutput: GraphDebateOutput,
  state: ArgumentationGraphState,
  argById: Map<string, Argument>,
  cruxIds: string[],
) {
  if (graphOutput.camps.length < 2) return []

  // Find what distinguishes each camp: look at arguments unique to each camp
  return graphOutput.camps.slice(0, 2).map((camp, i) => {
    const otherCamp = graphOutput.camps[i === 0 ? 1 : 0]
    const otherArgIds = new Set(otherCamp.argumentIds)

    // Arguments unique to this camp (not in the other)
    const uniqueArgs = camp.argumentIds
      .filter(id => !otherArgIds.has(id))
      .map(id => argById.get(id))
      .filter(Boolean) as Argument[]

    // Summarize: take the top 2 unique claims
    const topClaims = uniqueArgs
      .slice(0, 2)
      .map(a => a.claim)

    const speakers = camp.speakerIds.join(', ')
    const description = topClaims.length > 0
      ? `${speakers}: ${topClaims.join('; ')}`
      : `${speakers}: aligned on ${camp.argumentIds.length} arguments`

    // Categorize based on content heuristics
    const fullText = uniqueArgs.map(a => a.claim).join(' ').toLowerCase()
    const category = fullText.includes('valu') || fullText.includes('moral') || fullText.includes('identit')
      ? 'identity_values' as const
      : fullText.includes('time') || fullText.includes('horizon') || fullText.includes('long-term') || fullText.includes('short-term')
        ? 'time_horizon' as const
        : fullText.includes('evidence') || fullText.includes('data') || fullText.includes('empiric')
          ? 'epistemology' as const
          : fullText.includes('risk') || fullText.includes('stake') || fullText.includes('cost')
            ? 'stakes' as const
            : 'assumptions' as const

    return {
      category,
      description,
      relatedCruxIds: cruxIds,
    }
  })
}

// ─── Flip Conditions ────────────────────────────────────────

function buildFlipConditions(
  state: ArgumentationGraphState,
  personaIds: PersonaId[],
) {
  // For each persona, find their most important defeated argument
  // and what specifically defeated it
  const conditions: { personaId: PersonaId; condition: string; claimId: string; triggered: boolean }[] = []

  for (const pid of personaIds) {
    const defeatedArgs = state.arguments
      .filter(a => a.speakerId === pid && state.labelling.labels.get(a.id) === 'OUT')

    if (defeatedArgs.length === 0) continue

    // Find the one with highest attack degree (most contested)
    let bestArg = defeatedArgs[0]
    let bestDegree = 0
    for (const arg of defeatedArgs) {
      const attacks = state.attacks.filter(
        atk => atk.toArgId === arg.id &&
          state.validationResults.some(v => v.attackId === atk.id && v.valid)
      )
      if (attacks.length > bestDegree) {
        bestDegree = attacks.length
        bestArg = arg
      }
    }

    // Find what defeated it
    const defeatingAttack = state.attacks.find(
      atk => atk.toArgId === bestArg.id &&
        state.validationResults.some(v => v.attackId === atk.id && v.valid)
    )

    if (defeatingAttack) {
      conditions.push({
        personaId: pid,
        condition: `Would reconsider if "${defeatingAttack.counterProposition}" were shown to be false`,
        claimId: '',
        triggered: false,
      })
    }
  }

  return conditions
}

// ─── Evidence Ledger ────────────────────────────────────────

function buildEvidenceLedger(
  state: ArgumentationGraphState,
  personaIds: PersonaId[],
) {
  return personaIds.map(pid => {
    const ownArgs = state.arguments.filter(a => a.speakerId === pid)

    // Deduplicate evidence
    const acceptedSet = new Set<string>()
    const rejectedMap = new Map<string, string>() // evidence → reason

    for (const arg of ownArgs) {
      const label = state.labelling.labels.get(arg.id)
      if (label === 'OUT') {
        // Find what specifically defeated this argument
        const defeatingAttack = state.attacks.find(
          atk => atk.toArgId === arg.id &&
            state.validationResults.some(v => v.attackId === atk.id && v.valid)
        )
        const reason = defeatingAttack
          ? `Countered: "${truncate(defeatingAttack.counterProposition, 80)}"`
          : 'Defeated by opposing argument'

        for (const e of arg.evidence) {
          if (e.trim()) rejectedMap.set(e, reason)
        }
      } else {
        for (const e of arg.evidence) {
          if (e.trim()) acceptedSet.add(e)
        }
      }
    }

    // Don't show evidence that appears in both accepted and rejected
    for (const e of acceptedSet) {
      rejectedMap.delete(e)
    }

    const accepted = [...acceptedSet].slice(0, 5)
    const rejected = [...rejectedMap.entries()]
      .slice(0, 3)
      .map(([evidence, reason]) => ({ evidence, reason }))

    return { personaId: pid, accepted, rejected }
  }).filter(e => e.accepted.length > 0 || e.rejected.length > 0)
}

// ─── Helpers ────────────────────────────────────────────────

function generateSettlingQuestion(text: string): string {
  const cleaned = text.replace(/^that\s+/i, '').replace(/\.$/, '')
  return `What evidence would confirm or refute that ${cleaned}?`
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}
