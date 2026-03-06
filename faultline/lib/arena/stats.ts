import type { ArenaMethod, ArenaOutput, ArenaVote, ArenaStats, MethodStats } from './types'

const ALL_METHODS: ArenaMethod[] = ['direct_crux', 'cot_crux', 'multiagent_crux', 'argora_crux']

export function computeStats(
  votes: ArenaVote[],
  outputs: ArenaOutput[],
  totalDebates: number,
): ArenaStats {
  // Collect which methods have any data
  const activeMethods = new Set<ArenaMethod>()
  for (const v of votes) {
    activeMethods.add(v.methodA)
    activeMethods.add(v.methodB)
  }
  for (const o of outputs) {
    activeMethods.add(o.method)
  }

  // Per-method output stats (avg cost, avg runtime)
  const outputsByMethod = new Map<ArenaMethod, ArenaOutput[]>()
  for (const o of outputs) {
    if (!outputsByMethod.has(o.method)) outputsByMethod.set(o.method, [])
    outputsByMethod.get(o.method)!.push(o)
  }

  const methodStats: MethodStats[] = ALL_METHODS.filter(m => activeMethods.has(m)).map(method => {
    const methodOutputs = outputsByMethod.get(method) ?? []
    const methodVotes = votes.filter(v => v.methodA === method || v.methodB === method)

    let wins = 0
    let losses = 0
    let ties = 0

    for (const vote of methodVotes) {
      const isA = vote.methodA === method
      if (vote.winner === 'tie') {
        ties++
      } else if ((isA && vote.winner === 'a') || (!isA && vote.winner === 'b')) {
        wins++
      } else {
        losses++
      }
    }

    const total = wins + losses + ties
    const winRate = total > 0 ? wins / total : null

    const costsWithData = methodOutputs.filter(o => o.costUsd !== null)
    const avgCostUsd =
      costsWithData.length > 0
        ? costsWithData.reduce((sum, o) => sum + (o.costUsd ?? 0), 0) / costsWithData.length
        : null

    const avgRuntimeMs =
      methodOutputs.length > 0
        ? methodOutputs.reduce((sum, o) => sum + o.runtimeMs, 0) / methodOutputs.length
        : null

    return { method, wins, losses, ties, total, winRate, avgCostUsd, avgRuntimeMs }
  })

  return {
    methods: methodStats.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1)),
    totalDebates,
    totalVotes: votes.length,
  }
}
