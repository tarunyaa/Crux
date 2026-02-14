import { NextRequest, NextResponse } from 'next/server'
import { runDebate } from '@/lib/debate/engine'
import type { DebateEvent } from '@/lib/types/debate-engine'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

interface DebateRequest {
  topic: string
  personaIds: string[]
  maxTurns?: number
}

export async function POST(req: NextRequest) {
  let body: DebateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { topic, personaIds, maxTurns = 30 } = body

  if (!topic || typeof topic !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid topic' }, { status: 400 })
  }
  if (!Array.isArray(personaIds) || personaIds.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 persona IDs' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Initial connection
      controller.enqueue(encoder.encode(': connected\n\n'))

      try {
        for await (const event of runDebate({ topic, personaIds, maxTurns })) {
          const data = formatSSE(event)
          controller.enqueue(encoder.encode(data))
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal error'
        const errorEvent: DebateEvent = { type: 'engine_error', message }
        controller.enqueue(encoder.encode(formatSSE(errorEvent)))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function formatSSE(event: DebateEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
