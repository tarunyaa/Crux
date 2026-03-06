/**
 * embed-corpus.ts
 *
 * Reads corpus files from data/seed/corpus/[personaId].json,
 * embeds each chunk with Voyage AI, and upserts into corpus_chunks table.
 *
 * Tweets: embedded whole (already short).
 * Substack posts: chunked at ~2000 chars with ~200 char overlap.
 *
 * Usage:
 *   npx tsx scripts/embed-corpus.ts                        # embed all personas
 *   npx tsx scripts/embed-corpus.ts --only "saylor"        # one persona
 *   npx tsx scripts/embed-corpus.ts --dry-run              # count chunks, no DB writes
 *
 * Required env:
 *   VOYAGE_API_KEY
 *   DATABASE_URL
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs/promises'
import path from 'path'
import { VoyageAIClient } from 'voyageai'
import { getDb } from '@/lib/db'
import { corpusChunks } from '@/lib/db/schema'
import { loadCorpus, getPersonas } from '@/lib/personas/loader'
import { sql } from 'drizzle-orm'

// ─── Config ──────────────────────────────────────────────────

const SEED_DIR = path.join(process.cwd(), 'data', 'seed')
const VOYAGE_MODEL = 'voyage-3-large'
const BATCH_SIZE = 64          // voyage-3-large supports up to 128; 64 is safe
const CHUNK_SIZE = 2000        // chars (~500 tokens) for essay chunks
const CHUNK_OVERLAP = 200      // chars overlap between chunks

// ─── CLI Args ────────────────────────────────────────────────

const args = process.argv.slice(2)
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1]?.toLowerCase() : null
const dryRun = args.includes('--dry-run')

// ─── Voyage Client ───────────────────────────────────────────

function getVoyageClient(): VoyageAIClient {
  const key = process.env.VOYAGE_API_KEY
  if (!key) {
    console.error('ERROR: VOYAGE_API_KEY is required in .env.local')
    process.exit(1)
  }
  return new VoyageAIClient({ apiKey: key })
}

// ─── Chunking ────────────────────────────────────────────────

interface Chunk {
  id: string
  personaId: string
  content: string
  sourceType: 'tweet' | 'substack'
  sourceUrl: string
  sourceDate: Date | null
  chunkIndex: number
}

/**
 * Split a long text into overlapping character chunks.
 * Breaks at word boundaries where possible.
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text]

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize

    // Snap to word boundary if not at end
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end)
      if (boundary > start + chunkSize / 2) end = boundary
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap
    if (start >= text.length) break
  }

  return chunks.filter(c => c.length > 50) // drop tiny tail chunks
}

/**
 * Convert CorpusExcerpt[] for a persona into flat Chunk[].
 */
function buildChunks(
  personaId: string,
  corpus: Awaited<ReturnType<typeof loadCorpus>>,
): Chunk[] {
  const chunks: Chunk[] = []

  for (const entry of corpus) {
    const sourceDate = entry.date ? new Date(entry.date) : null
    const sourceUrl = entry.source ?? ''

    if (entry.platform === 'twitter') {
      // Tweets: embed whole — they are already short
      chunks.push({
        id: `${personaId}_tweet_${entry.id}`,
        personaId,
        content: entry.content,
        sourceType: 'tweet',
        sourceUrl,
        sourceDate,
        chunkIndex: 0,
      })
    } else {
      // Substack: chunk into ~2000-char pieces
      const textChunks = chunkText(entry.content, CHUNK_SIZE, CHUNK_OVERLAP)
      textChunks.forEach((text, i) => {
        chunks.push({
          id: `${personaId}_substack_${entry.id}_${i}`,
          personaId,
          content: text,
          sourceType: 'substack',
          sourceUrl,
          sourceDate,
          chunkIndex: i,
        })
      })
    }
  }

  return chunks
}

// ─── Embedding ───────────────────────────────────────────────

async function embedBatch(
  voyage: VoyageAIClient,
  texts: string[],
): Promise<number[][]> {
  const response = await voyage.embed({
    input: texts,
    model: VOYAGE_MODEL,
  })
  return (response.data ?? []).map(d => d.embedding ?? [])
}

// ─── DB Upsert ───────────────────────────────────────────────

async function upsertChunks(
  db: ReturnType<typeof getDb>,
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  const rows = chunks.map((c, i) => ({
    id: c.id,
    personaId: c.personaId,
    content: c.content,
    sourceType: c.sourceType,
    sourceUrl: c.sourceUrl,
    sourceDate: c.sourceDate,
    embedding: embeddings[i],
    chunkIndex: c.chunkIndex,
  }))

  await db
    .insert(corpusChunks)
    .values(rows)
    .onConflictDoUpdate({
      target: corpusChunks.id,
      set: {
        content: sql`excluded.content`,
        embedding: sql`excluded.embedding`,
        sourceUrl: sql`excluded.source_url`,
        sourceDate: sql`excluded.source_date`,
        chunkIndex: sql`excluded.chunk_index`,
      },
    })
}

// ─── HNSW Index ──────────────────────────────────────────────

async function ensureHnswIndex(db: ReturnType<typeof getDb>): Promise<void> {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS corpus_chunks_embedding_hnsw
      ON corpus_chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `)
    console.log('HNSW index ensured.')
  } catch (err) {
    // Non-fatal — index may already exist or pgvector may need enabling
    console.warn('HNSW index creation skipped:', (err as Error).message)
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  // Check corpus dir exists
  const corpusDir = path.join(SEED_DIR, 'corpus')
  try {
    await fs.access(corpusDir)
  } catch {
    console.error(`No corpus directory found at ${corpusDir}`)
    console.error('Run "npm run build-personas" first to generate corpus files.')
    process.exit(1)
  }

  const voyage = getVoyageClient()
  const db = dryRun ? null : getDb()

  const allPersonas = await getPersonas()
  const personas = onlyArg
    ? allPersonas.filter(p => p.id.toLowerCase().includes(onlyArg) || p.name.toLowerCase().includes(onlyArg))
    : allPersonas

  if (personas.length === 0) {
    console.error(`No personas matched "${onlyArg}"`)
    process.exit(1)
  }

  console.log(`Embedding corpus for ${personas.length} persona(s)${dryRun ? ' [DRY RUN]' : ''}`)

  let totalChunks = 0
  let totalEmbedded = 0

  for (const persona of personas) {
    const corpus = await loadCorpus(persona.id)

    if (corpus.length === 0) {
      console.log(`  ${persona.name}: no corpus, skipping`)
      continue
    }

    const chunks = buildChunks(persona.id, corpus)
    totalChunks += chunks.length

    const tweets = chunks.filter(c => c.sourceType === 'tweet').length
    const substackChunks = chunks.filter(c => c.sourceType === 'substack').length
    console.log(`  ${persona.name}: ${corpus.length} entries → ${chunks.length} chunks (${tweets} tweets, ${substackChunks} substack)`)

    if (dryRun) continue

    // Embed in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const texts = batch.map(c => c.content)

      process.stdout.write(`    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`)

      const embeddings = await embedBatch(voyage, texts)
      await upsertChunks(db!, batch, embeddings)
      totalEmbedded += batch.length

      process.stdout.write(` done\n`)

      // Brief pause between batches to respect rate limits
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  if (!dryRun && db) {
    console.log('\nEnsuring HNSW index...')
    await ensureHnswIndex(db)
  }

  console.log(`\nDone. ${totalChunks} chunks total${dryRun ? '' : `, ${totalEmbedded} embedded`}.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
