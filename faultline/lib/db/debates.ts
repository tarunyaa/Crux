import { getDb } from './index'
import { debates } from './schema'
import { eq, desc } from 'drizzle-orm'
import type { DebateOutput } from '@/lib/types'

interface SaveDebateParams {
  id: string
  topic: string
  mode: string
  personaIds: string[]
  events: unknown[]
  output: DebateOutput | null
  status: 'completed' | 'error'
}

export async function saveDebate(params: SaveDebateParams) {
  const db = getDb()
  await db.insert(debates).values({
    id: params.id,
    topic: params.topic,
    mode: params.mode,
    personaIds: params.personaIds,
    events: params.events as unknown[],
    output: params.output as unknown,
    status: params.status,
  })
}

/** List debates without the heavy `events` column */
export async function listDebates(limit = 50, offset = 0) {
  const db = getDb()
  return db
    .select({
      id: debates.id,
      topic: debates.topic,
      mode: debates.mode,
      personaIds: debates.personaIds,
      output: debates.output,
      status: debates.status,
      createdAt: debates.createdAt,
    })
    .from(debates)
    .orderBy(desc(debates.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function getDebateById(id: string) {
  const db = getDb()
  const rows = await db.select().from(debates).where(eq(debates.id, id)).limit(1)
  return rows[0] ?? null
}

export async function deleteErroredDebates() {
  const db = getDb()
  return db.delete(debates).where(eq(debates.status, 'error'))
}
