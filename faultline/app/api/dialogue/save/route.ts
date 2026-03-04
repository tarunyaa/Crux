// ─── Save Dialogue to Archive ────────────────────────────────

import { NextRequest } from 'next/server'
import { saveDebate } from '@/lib/db/debates'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { topic, personaIds, events } = body

    if (!topic || !personaIds || !events) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 },
      )
    }

    const id = `dialogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    await saveDebate({
      id,
      topic,
      mode: 'dialogue',
      personaIds,
      events,
      output: null,
      status: 'completed',
    })

    return Response.json({ id })
  } catch (error) {
    console.error('Failed to save debate:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to save debate' }),
      { status: 500 },
    )
  }
}
