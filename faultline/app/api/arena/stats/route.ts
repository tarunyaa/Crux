import { db } from '@/lib/db'
import { arenaDebates } from '@/lib/db/schema'
import { getAllVotes, getAllOutputs } from '@/lib/arena/persistence'
import { computeStats } from '@/lib/arena/stats'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [debates, votes, outputs] = await Promise.all([
      db.select().from(arenaDebates),
      getAllVotes(),
      getAllOutputs(),
    ])

    const stats = computeStats(votes, outputs, debates.length)
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load stats' }), { status: 500 })
  }
}
