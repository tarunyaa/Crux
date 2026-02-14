import { NextRequest, NextResponse } from 'next/server'
import { runBlitz } from '@/lib/orchestrator/blitz'
import { runClassical } from '@/lib/orchestrator/classical'
import { runGraph } from '@/lib/orchestrator/graph-orchestrator'
import { runDebate } from '@/lib/debate/engine'
import { saveDebate } from '@/lib/db/debates'
import type { SSEEvent, DebateOutput } from '@/lib/types'
import type { DebateEvent as V2Event } from '@/lib/types/debate-engine'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

interface DebateRequest {
  topic: string
  personaIds: string[]
  mode?: 'blitz' | 'classical' | 'graph' | 'v2'
  save?: boolean
  maxTurns?: number
}

export async function POST(req: NextRequest) {
  let body: DebateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { topic, personaIds, mode = 'blitz', save = true, maxTurns = 30 } = body

  if (!topic || typeof topic !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid topic' }, { status: 400 })
  }
  if (!Array.isArray(personaIds) || personaIds.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 persona IDs' }, { status: 400 })
  }
  if (mode !== 'blitz' && mode !== 'classical' && mode !== 'graph' && mode !== 'v2') {
    return NextResponse.json({ error: 'Invalid mode — must be "blitz", "classical", "graph", or "v2"' }, { status: 400 })
  }

  const debateId = `debate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Flush an SSE comment immediately to unblock the HTTP response
      controller.enqueue(encoder.encode(': connected\n\n'))

      const collectedEvents: (SSEEvent | V2Event)[] = []
      let finalOutput: DebateOutput | null = null
      let debateStatus: 'completed' | 'error' = 'completed'

      try {
        if (mode === 'v2') {
          // V2 mode uses different event types
          for await (const event of runDebate({ topic, personaIds, maxTurns })) {
            collectedEvents.push(event)
            const data = formatSSE(event)
            controller.enqueue(encoder.encode(data))
          }
        } else {
          const generator = mode === 'graph'
            ? runGraph({ topic, personaIds, debateId })
            : mode === 'classical'
              ? runClassical({ topic, personaIds, debateId })
              : runBlitz({ topic, personaIds, debateId })

          for await (const event of generator) {
            collectedEvents.push(event)
            if (event.type === 'debate_complete') {
              finalOutput = event.output
            }
            if (event.type === 'error') {
              debateStatus = 'error'
            }
            const data = formatSSE(event)
            controller.enqueue(encoder.encode(data))
          }
        }
      } catch (err: unknown) {
        debateStatus = 'error'
        const message = err instanceof Error ? err.message : 'Internal error'
        const errorEvent: SSEEvent = { type: 'error', message }
        collectedEvents.push(errorEvent)
        controller.enqueue(encoder.encode(formatSSE(errorEvent)))
      } finally {
        controller.close()
        if (save && debateStatus === 'completed' && mode !== 'v2') {
          saveDebate({
            id: debateId,
            topic,
            mode: mode as 'blitz' | 'classical' | 'graph',
            personaIds,
            events: collectedEvents as SSEEvent[],
            output: finalOutput,
            status: debateStatus,
          }).catch(err => {
            console.error('[debate/save] Failed to persist debate:', err)
          })
        }
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

function formatSSE(event: SSEEvent | V2Event): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
