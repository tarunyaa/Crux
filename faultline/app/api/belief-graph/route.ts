// ─── Belief Graph Experiment API Endpoint (SSE) ──────────────

import { NextRequest } from 'next/server'
import { runBeliefGraphExperiment } from '@/lib/belief-graph/orchestrator'
import { saveDebate } from '@/lib/db/debates'
import type { ExperimentConfig, BeliefGraphEvent } from '@/lib/belief-graph/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await req.json() as ExperimentConfig

    if (!body.topic || !body.personaIds || body.personaIds.length !== 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Need topic and exactly 2 personaIds' }),
        { status: 400 }
      )
    }

    const config: ExperimentConfig = {
      topic: body.topic,
      personaIds: body.personaIds,
      maxRounds: body.maxRounds ?? 5,
      convergenceThreshold: body.convergenceThreshold ?? 0.02,
      cruxVarianceThreshold: body.cruxVarianceThreshold ?? 0.3,
      consensusVarianceThreshold: body.consensusVarianceThreshold ?? 0.1,
    }

    const debateId = `belief-graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const collectedEvents: BeliefGraphEvent[] = []

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
          for await (const event of runBeliefGraphExperiment(config)) {
            collectedEvents.push(event)
            const data = `data: ${JSON.stringify(event)}\n\n`
            safeEnqueue(encoder.encode(data))
          }
        } catch (error) {
          console.error('Belief graph experiment error:', error)
          status = 'error'
          const errorEvent: BeliefGraphEvent = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          collectedEvents.push(errorEvent)
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
        }

        // Save to DB
        try {
          await saveDebate({
            id: debateId,
            topic: config.topic,
            mode: 'belief-graph',
            personaIds: config.personaIds,
            events: collectedEvents as unknown[],
            output: null,
            status,
          })
        } catch (err) {
          console.error('Failed to save experiment:', err)
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
