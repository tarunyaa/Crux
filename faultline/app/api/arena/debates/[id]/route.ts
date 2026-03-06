import { NextRequest } from 'next/server'
import { getArenaDebate, getVotesForDebate } from '@/lib/arena/persistence'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await getArenaDebate(id)
    if (!result) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    const votes = await getVotesForDebate(id)

    return new Response(JSON.stringify({ ...result, votes }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to load debate' }), { status: 500 })
  }
}
