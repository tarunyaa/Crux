import { NextRequest } from 'next/server'
import { saveArenaVote } from '@/lib/arena/persistence'
import type { ArenaMethod } from '@/lib/arena/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      debateId?: string
      methodA?: string
      methodB?: string
      winner?: string
      sessionId?: string
    }

    if (!body.debateId || !body.methodA || !body.methodB || !body.winner || !body.sessionId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    if (!['a', 'b', 'tie'].includes(body.winner)) {
      return new Response(JSON.stringify({ error: 'winner must be a, b, or tie' }), { status: 400 })
    }

    await saveArenaVote({
      id: crypto.randomUUID(),
      debateId: body.debateId,
      methodA: body.methodA as ArenaMethod,
      methodB: body.methodB as ArenaMethod,
      winner: body.winner as 'a' | 'b' | 'tie',
      sessionId: body.sessionId,
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to save vote' }), { status: 500 })
  }
}
