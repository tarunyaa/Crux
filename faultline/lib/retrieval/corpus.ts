// ─── Corpus Retrieval ─────────────────────────────────────────
// Semantic search over a persona's embedded corpus chunks.
// Used to ground persona responses in their actual past writing.
//
// NOT wired into the dialogue agents yet — call this directly
// or integrate in Phase 2.

import { VoyageAIClient } from 'voyageai'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

const VOYAGE_MODEL = 'voyage-3-large'

// ─── Types ────────────────────────────────────────────────────

export interface RetrievedChunk {
  id: string
  personaId: string
  content: string
  sourceType: 'tweet' | 'substack'
  sourceUrl: string
  sourceDate: Date | null
  similarity: number
}

// ─── Client (lazy singleton) ─────────────────────────────────

let _voyage: VoyageAIClient | null = null

function getVoyageClient(): VoyageAIClient {
  if (!_voyage) {
    const key = process.env.VOYAGE_API_KEY
    if (!key) throw new Error('VOYAGE_API_KEY not set')
    _voyage = new VoyageAIClient({ apiKey: key })
  }
  return _voyage
}

// ─── Embed ────────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const voyage = getVoyageClient()
  const response = await voyage.embed({
    input: [text],
    model: VOYAGE_MODEL,
  })
  return response.data?.[0]?.embedding ?? []
}

// ─── Retrieve ─────────────────────────────────────────────────

/**
 * Retrieve the most semantically similar corpus chunks for a persona.
 *
 * @param personaId  - persona to search within
 * @param queryText  - the query (debate turn, argument, or topic phrase)
 * @param topK       - how many results to return (default 5)
 * @param minSimilarity - filter out results below this threshold (default 0.65)
 */
export async function retrievePersonaCorpus(
  personaId: string,
  queryText: string,
  topK = 5,
  minSimilarity = 0.65,
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(queryText)
  const db = getDb()

  // pgvector cosine similarity: 1 - cosine_distance
  // Filter by persona first, then rank by similarity
  // Format embedding as pgvector literal: '[0.1,0.2,...]'
  const vectorLiteral = `[${embedding.join(',')}]`

  const rows = await db.execute<{
    id: string
    persona_id: string
    content: string
    source_type: string
    source_url: string
    source_date: Date | null
    similarity: number
  }>(sql`
    SELECT
      id,
      persona_id,
      content,
      source_type,
      source_url,
      source_date,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM corpus_chunks
    WHERE persona_id = ${personaId}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK * 2}
  `)

  return rows
    .filter(r => r.similarity >= minSimilarity)
    .slice(0, topK)
    .map(r => ({
      id: r.id,
      personaId: r.persona_id,
      content: r.content,
      sourceType: r.source_type as 'tweet' | 'substack',
      sourceUrl: r.source_url,
      sourceDate: r.source_date,
      similarity: r.similarity,
    }))
}

/**
 * Retrieve chunks for multiple personas in parallel.
 * Useful for preloading context at debate start.
 */
export async function retrieveForPersonas(
  personaIds: string[],
  queryText: string,
  topK = 3,
): Promise<Map<string, RetrievedChunk[]>> {
  const results = await Promise.all(
    personaIds.map(async id => [id, await retrievePersonaCorpus(id, queryText, topK)] as const)
  )
  return new Map(results)
}
