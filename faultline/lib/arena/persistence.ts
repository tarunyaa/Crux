import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { arenaDebates, arenaOutputs, arenaVotes } from '@/lib/db/schema'
import type { ArenaDebate, ArenaOutput, ArenaVote, ArenaMethod, CruxCardOutput } from './types'

export async function createArenaDebate(
  id: string,
  topic: string,
  methodsRun: ArenaMethod[],
): Promise<void> {
  await db.insert(arenaDebates).values({ id, topic, methodsRun })
}

export async function saveArenaOutput(output: Omit<ArenaOutput, 'createdAt'>): Promise<void> {
  await db.insert(arenaOutputs).values({
    id: output.id,
    debateId: output.debateId,
    method: output.method,
    cruxCards: output.cruxCards as unknown[],
    tokenUsage: output.tokenUsage,
    runtimeMs: output.runtimeMs,
    model: output.model,
    costUsd: output.costUsd ?? undefined,
  })
}

export async function saveArenaVote(vote: Omit<ArenaVote, 'createdAt'>): Promise<void> {
  await db.insert(arenaVotes).values({
    id: vote.id,
    debateId: vote.debateId,
    methodA: vote.methodA,
    methodB: vote.methodB,
    winner: vote.winner,
    sessionId: vote.sessionId,
  })
}

export async function getArenaDebate(
  id: string,
): Promise<{ debate: ArenaDebate; outputs: ArenaOutput[] } | null> {
  const [debate] = await db.select().from(arenaDebates).where(eq(arenaDebates.id, id))
  if (!debate) return null

  const outputs = await db.select().from(arenaOutputs).where(eq(arenaOutputs.debateId, id))

  return {
    debate: {
      id: debate.id,
      topic: debate.topic,
      createdAt: debate.createdAt,
      methodsRun: debate.methodsRun as ArenaMethod[],
    },
    outputs: outputs.map(o => ({
      id: o.id,
      debateId: o.debateId,
      method: o.method as ArenaMethod,
      cruxCards: o.cruxCards as CruxCardOutput[],
      tokenUsage: o.tokenUsage,
      runtimeMs: o.runtimeMs,
      model: o.model,
      costUsd: o.costUsd ?? null,
    })),
  }
}

export async function listArenaDebates(limit = 20): Promise<ArenaDebate[]> {
  const rows = await db
    .select()
    .from(arenaDebates)
    .orderBy(arenaDebates.createdAt)
    .limit(limit)

  return rows.map(r => ({
    id: r.id,
    topic: r.topic,
    createdAt: r.createdAt,
    methodsRun: r.methodsRun as ArenaMethod[],
  }))
}

export async function getVotesForDebate(debateId: string): Promise<ArenaVote[]> {
  const rows = await db.select().from(arenaVotes).where(eq(arenaVotes.debateId, debateId))
  return rows.map(r => ({
    id: r.id,
    debateId: r.debateId,
    methodA: r.methodA as ArenaMethod,
    methodB: r.methodB as ArenaMethod,
    winner: r.winner as ArenaVote['winner'],
    sessionId: r.sessionId,
    createdAt: r.createdAt,
  }))
}

export async function getAllVotes(): Promise<ArenaVote[]> {
  const rows = await db.select().from(arenaVotes)
  return rows.map(r => ({
    id: r.id,
    debateId: r.debateId,
    methodA: r.methodA as ArenaMethod,
    methodB: r.methodB as ArenaMethod,
    winner: r.winner as ArenaVote['winner'],
    sessionId: r.sessionId,
    createdAt: r.createdAt,
  }))
}

export async function getAllOutputs(): Promise<ArenaOutput[]> {
  const rows = await db.select().from(arenaOutputs)
  return rows.map(o => ({
    id: o.id,
    debateId: o.debateId,
    method: o.method as ArenaMethod,
    cruxCards: o.cruxCards as CruxCardOutput[],
    tokenUsage: o.tokenUsage,
    runtimeMs: o.runtimeMs,
    model: o.model,
    costUsd: o.costUsd ?? null,
  }))
}
