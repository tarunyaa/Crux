import { NextRequest } from 'next/server'
import { runArenaBaselines } from '@/lib/arena/bridge'
import { createArenaDebate, saveArenaOutput } from '@/lib/arena/persistence'
import type { ArenaMethod, CruxCardOutput } from '@/lib/arena/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await req.json() as { topic?: string; methods?: ArenaMethod[]; existingDebateId?: string }

    if (!body.topic?.trim()) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 })
    }

    const topic = body.topic.trim()
    const methods = body.methods ?? ['direct_crux', 'cot_crux', 'multiagent_crux']
    const existingDebateId = body.existingDebateId?.trim() || undefined

    // Use existing debate ID if provided; otherwise create a new debate record
    const debateId = existingDebateId ?? crypto.randomUUID()
    if (!existingDebateId) {
      await createArenaDebate(debateId, topic, methods)
    }

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        function send(event: unknown) {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            closed = true
          }
        }
        function close() {
          if (closed) return
          try { controller.close() } catch { /* ok */ }
          closed = true
        }

        try {
          send({ type: 'arena_start', data: { debateId, topic, methods } })

          for await (const event of runArenaBaselines({ topic, methods })) {
            send(event)

            if (event.type === 'method_complete') {
              const d = event.data as {
                method: ArenaMethod
                crux_cards: CruxCardOutput[]
                model: string
                runtime_ms: number
                token_usage: Record<string, number>
              }
              await saveArenaOutput({
                id: crypto.randomUUID(),
                debateId,
                method: d.method,
                cruxCards: d.crux_cards ?? [],
                tokenUsage: d.token_usage ?? {},
                runtimeMs: d.runtime_ms ?? 0,
                model: d.model,
                costUsd: null, // TODO: compute from token usage + model pricing
              })
            }
          }

          send({ type: 'saved', data: { debateId: existingDebateId ?? debateId } })
        } catch (err) {
          send({
            type: 'error',
            data: { message: err instanceof Error ? err.message : 'Unknown error' },
          })
        }

        close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to start arena run' }),
      { status: 500 },
    )
  }
}
