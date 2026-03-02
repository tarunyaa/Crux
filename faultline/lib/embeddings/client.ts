// ─── Voyage AI Embedding Client ─────────────────────────────

import { VoyageAIClient } from 'voyageai'

const MODEL = 'voyage-3'  // 1024 dims, matches pgvector schema
const MAX_BATCH = 128

let _client: VoyageAIClient | null = null

function getClient(): VoyageAIClient {
  if (!_client) {
    _client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })
  }
  return _client
}

/**
 * Embed an array of texts using Voyage AI.
 * Batches automatically at 128 texts per call.
 * Returns one 1024-dim vector per input text.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const client = getClient()
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH)
    const response = await client.embed({ input: batch, model: MODEL })
    const vectors = (response.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map(d => d.embedding as number[])
    allEmbeddings.push(...vectors)
  }

  return allEmbeddings
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
