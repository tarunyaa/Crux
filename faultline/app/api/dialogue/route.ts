// ─── Dialogue API Endpoint (SSE) ─────────────────────────────

import { NextRequest } from 'next/server'
import { runDialogue } from '@/lib/dialogue/orchestrator'
import type { DialogueConfig } from '@/lib/dialogue/types'

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

        try {
          for await (const event of runDialogue(body)) {
            const data = `data: ${JSON.stringify(event)}\n\n`
            safeEnqueue(encoder.encode(data))
          }
        } catch (error) {
          console.error('Dialogue error:', error)
          const errorEvent = {
            type: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
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
