import { ArenaClient } from './ArenaClient'
import { listArenaDebates, getArenaDebate } from '@/lib/arena/persistence'
import { getAllVotes, getAllOutputs } from '@/lib/arena/persistence'
import { computeStats } from '@/lib/arena/stats'
import { db } from '@/lib/db'
import { arenaDebates } from '@/lib/db/schema'

interface Props {
  searchParams: Promise<{ debate?: string }>
}

export default async function ArenaPage({ searchParams }: Props) {
  const { debate: debateId } = await searchParams

  // Load stats + recent debates in parallel
  const [debates, votes, outputs, totalDebatesRows] = await Promise.all([
    listArenaDebates(20),
    getAllVotes(),
    getAllOutputs(),
    db.select().from(arenaDebates),
  ])

  const stats = computeStats(votes, outputs, totalDebatesRows.length)

  // If linking to a specific debate, load its outputs for voting
  let initialDebateId: string | undefined
  let initialOutputs = undefined
  let initialTopic: string | undefined

  if (debateId) {
    const result = await getArenaDebate(debateId)
    if (result) {
      initialDebateId = debateId
      initialOutputs = result.outputs
      initialTopic = result.debate.topic
    }
  }

  return (
    <ArenaClient
      initialStats={stats.totalVotes > 0 ? stats : null}
      initialDebates={debates}
      initialDebateId={initialDebateId}
      initialOutputs={initialOutputs}
      initialTopic={initialTopic}
    />
  )
}
