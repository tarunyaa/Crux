import { NextRequest } from 'next/server'
import { runBaselines } from '@/lib/argument/baseline-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await req.json() as { topic: string; model?: string }

    if (!body.topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 })
    }

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
          for await (const event of runBaselines(body.topic, body.model)) {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
        } catch (error) {
          const err = { type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } }
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(err)}\n\n`))
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
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to start baselines' }), { status: 500 })
  }
}
