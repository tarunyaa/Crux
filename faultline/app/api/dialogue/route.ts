// ─── Dialogue API Endpoint (SSE) ─────────────────────────────

import { NextRequest } from 'next/server'
import { runDialogue } from '@/lib/dialogue/orchestrator'
import { saveDebate } from '@/lib/db/debates'
import type { DialogueConfig, DialogueEvent } from '@/lib/dialogue/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await req.json() as DialogueConfig

    // Validate request
    if (!body.topic || !body.personaIds || body.personaIds.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Need topic and 2+ personaIds' }),
        { status: 400 }
      )
    }

    const debateId = `dialogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const collectedEvents: DialogueEvent[] = []

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        function safeEnqueue(chunk: Uint8Array) {
          if (closed) return
          try { controller.enqueue(chunk) } catch { closed = true }
        }
        function safeClose() {
          if (closed) return
          try { controller.close() } catch { /* already closed */ }
          closed = true
        }

        let status: 'completed' | 'error' = 'completed'

        try {
          for await (const event of runDialogue(body)) {
            collectedEvents.push(event)
            const data = `data: ${JSON.stringify(event)}\n\n`
            safeEnqueue(encoder.encode(data))
          }
        } catch (error) {
          console.error('Dialogue error:', error)
          status = 'error'
          const errorEvent = {
            type: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          collectedEvents.push(errorEvent)
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
        }

        // Save to DB after stream completes
        try {
          await saveDebate({
            id: debateId,
            topic: body.topic,
            mode: 'dialogue',
            personaIds: body.personaIds,
            events: collectedEvents as unknown[],
            output: null,
            status,
          })
        } catch (err) {
          console.error('Failed to save debate:', err)
        }

        safeClose()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to parse request' }),
      { status: 400 }
    )
  }
}
