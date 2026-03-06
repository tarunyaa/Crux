import { NextRequest } from 'next/server'
import { runArgora, BridgeConfig } from '@/lib/argument/bridge'
import { runArgoraCrux } from '@/lib/argument/crux-bridge'
import { saveDebate } from '@/lib/db/debates'
import { createArenaDebate, saveArenaOutput } from '@/lib/arena/persistence'
import type { ArgumentCruxCard, ArgumentCompleteData } from '@/lib/argument/types'
import type { CruxCardOutput, DisagreementType } from '@/lib/arena/types'
import type { DebateOutput } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function mapCruxCard(c: ArgumentCruxCard): CruxCardOutput {
  return {
    question: c.question,
    disagreementType: c.crux_type as DisagreementType,
    diagnosis: c.flip_mechanism,
    importance: c.importance,
    positions: c.expert ? [{
      expert: c.expert,
      stance: 'support',
      reasoning: c.flip_mechanism,
      flipCondition: null,
    }] : [],
  }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  try {
    const body = await req.json() as BridgeConfig & { personaIds?: string[]; useCrux?: boolean }
    if (!body.topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 })
    }
    if (body.personaIds) {
      body.personaIds = body.personaIds.slice(0, 5)
    }

    const useCrux = body.useCrux ?? (body.personaIds != null && body.personaIds.length > 0)

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        function safeEnqueue(chunk: Uint8Array) {
          if (closed) return
          try { controller.enqueue(chunk) } catch { closed = true }
        }
        function safeClose() {
          if (closed) return
          try { controller.close() } catch { }
          closed = true
        }

        try {
          if (useCrux) {
            const collectedEvents: unknown[] = []
            let completePayload: ArgumentCompleteData | null = null

            for await (const event of runArgoraCrux(body)) {
              collectedEvents.push(event)
              safeEnqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
              if (event.type === 'argument_complete') {
                completePayload = event.data as ArgumentCompleteData
              }
            }

            if (completePayload) {
              try {
                const debateId = `argument-${Date.now()}-${randomId()}`
                await saveDebate({
                  id: debateId,
                  topic: body.topic,
                  mode: 'argument',
                  personaIds: body.personaIds ?? [],
                  events: collectedEvents,
                  output: completePayload as unknown as DebateOutput,
                  status: 'completed',
                })
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'saved', data: { debateId } })}\n\n`))

                const cruxCards = completePayload.crux_cards ?? []
                if (cruxCards.length > 0) {
                  const arenaId = `arena-${Date.now()}-${randomId()}`
                  const mappedCards: CruxCardOutput[] = cruxCards.map(mapCruxCard)
                  await createArenaDebate(arenaId, body.topic, ['argora_crux'])
                  await saveArenaOutput({
                    id: crypto.randomUUID(),
                    debateId: arenaId,
                    method: 'argora_crux',
                    cruxCards: mappedCards,
                    tokenUsage: {},
                    runtimeMs: 0,
                    model: body.model ?? 'claude-haiku-4-5-20251001',
                    costUsd: null,
                  })
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'arena_saved', data: { arenaDebateId: arenaId } })}\n\n`))
                }
              } catch {
                // Save failure must not crash the stream
              }
            }
          } else {
            for await (const event of runArgora(body)) {
              safeEnqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }
          }
        } catch (error) {
          const errorEvent = { type: 'error' as const, data: { message: error instanceof Error ? error.message : 'Unknown error' } }
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
        }
        safeClose()
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to start argument pipeline' }), { status: 500 })
  }
}
