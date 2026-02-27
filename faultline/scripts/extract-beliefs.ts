/**
 * extract-beliefs.ts
 *
 * Extracts structured belief graphs from persona corpus files.
 * Reads corpus JSON, calls Haiku to extract causal triples per chunk,
 * deduplicates, and writes a BeliefGraph JSON per persona.
 *
 * Usage:
 *   npx tsx scripts/extract-beliefs.ts
 *   npx tsx scripts/extract-beliefs.ts --only "Jukan"
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs/promises'
import path from 'path'
import { completeJSON } from '../lib/llm/client'
import type { BeliefGraph, BeliefNode, BeliefEdge } from '../lib/types'

const CORPUS_DIR = path.join(process.cwd(), 'data', 'seed', 'corpus')
const BELIEFS_DIR = path.join(process.cwd(), 'data', 'seed', 'beliefs')
const CONTRACTS_DIR = path.join(process.cwd(), 'data', 'seed', 'contracts')

// ─── Types ───────────────────────────────────────────────────

interface CorpusEntry {
  id: string
  content: string
  source: string
  date: string
  platform: 'twitter' | 'substack'
  metrics?: {
    likes: number
    retweets: number
    replies: number
  }
}

interface RawTriple {
  cause: string
  effect: string
  polarity: 1 | -1
  confidence: number
  type: 'core_value' | 'factual_claim' | 'inference' | 'assumption'
}

// ─── Extraction ──────────────────────────────────────────────

async function extractTriplesFromChunk(
  chunk: string,
  chunkId: string,
  personaName: string,
): Promise<Array<RawTriple & { chunkId: string }>> {
  const result = await completeJSON<{ triples: RawTriple[] }>({
    system: 'You extract causal belief relationships from text. Only extract relationships the author clearly expressed or implied. Do not infer beliefs they haven\'t expressed.',
    messages: [{
      role: 'user',
      content: `Given this text by ${personaName}:
"${chunk}"

Extract causal belief relationships expressed or implied.
Each relationship: cause (concept/event), effect (concept/event), polarity (+1 means cause promotes effect, -1 means cause undermines effect), confidence (0-1 how clearly the author expressed this), type (core_value, factual_claim, inference, or assumption).

Examples:
- "Bitcoin's fixed supply makes it superior to fiat" →
  { "cause": "fixed 21M supply", "effect": "store of value superiority", "polarity": 1, "confidence": 0.95, "type": "factual_claim" }
- "Proof of stake reduces energy waste" →
  { "cause": "proof of stake consensus", "effect": "energy consumption", "polarity": -1, "confidence": 0.8, "type": "factual_claim" }

Only extract relationships the author clearly holds. If the chunk contains no causal claims, return empty array.

Output JSON:
{ "triples": [...] }`,
    }],
    model: 'haiku',
    maxTokens: 500,
    temperature: 0.2,
  })

  return (result.triples || []).map(t => ({ ...t, chunkId }))
}

// ─── Chunking ────────────────────────────────────────────────

const MAX_CHUNK_CHARS = 1100

function chunkCorpus(entries: CorpusEntry[]): Array<{ id: string; text: string }> {
  const chunks: Array<{ id: string; text: string }> = []

  for (const entry of entries) {
    const text = entry.content.trim()
    if (!text || text.length < 20) continue // skip empty/trivial entries

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ id: entry.id, text })
    } else {
      // Split long entries (substack posts) into segments
      const segments = splitIntoSegments(text, MAX_CHUNK_CHARS)
      segments.forEach((seg, i) => {
        chunks.push({ id: `${entry.id}_seg${i}`, text: seg })
      })
    }
  }

  return chunks
}

function splitIntoSegments(text: string, maxLen: number): string[] {
  const segments: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      segments.push(remaining)
      break
    }

    // Try to split at sentence boundary
    let splitIdx = remaining.lastIndexOf('. ', maxLen)
    if (splitIdx < maxLen * 0.5) {
      // No good sentence boundary, split at space
      splitIdx = remaining.lastIndexOf(' ', maxLen)
    }
    if (splitIdx < maxLen * 0.3) {
      // No good boundary at all, hard split
      splitIdx = maxLen
    }

    segments.push(remaining.slice(0, splitIdx + 1).trim())
    remaining = remaining.slice(splitIdx + 1).trim()
  }

  return segments.filter(s => s.length >= 20)
}

// ─── Deduplication ───────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim()
}

function deduplicateTriples(
  triples: Array<RawTriple & { chunkId: string }>,
): { nodes: BeliefNode[]; edges: BeliefEdge[] } {
  // Build node map: normalized concept -> node
  const nodeMap = new Map<string, BeliefNode>()
  let nodeCounter = 0

  function getOrCreateNode(
    concept: string,
    type: BeliefNode['type'],
    chunkId: string,
  ): string {
    const key = normalize(concept)
    const existing = nodeMap.get(key)
    if (existing) {
      if (!existing.grounding.includes(chunkId)) {
        existing.grounding.push(chunkId)
      }
      return existing.id
    }

    const id = `n_${nodeCounter++}`
    nodeMap.set(key, {
      id,
      concept,
      type,
      grounding: [chunkId],
    })
    return id
  }

  // Group edges by (fromKey, toKey, polarity)
  const edgeGroups = new Map<string, {
    fromId: string
    toId: string
    polarity: 1 | -1
    confidences: number[]
    sourceChunks: string[]
  }>()

  for (const t of triples) {
    const fromId = getOrCreateNode(t.cause, t.type, t.chunkId)
    const toId = getOrCreateNode(t.effect, t.type, t.chunkId)

    const edgeKey = `${normalize(t.cause)}|${normalize(t.effect)}|${t.polarity}`
    const existing = edgeGroups.get(edgeKey)

    if (existing) {
      existing.confidences.push(t.confidence)
      if (!existing.sourceChunks.includes(t.chunkId)) {
        existing.sourceChunks.push(t.chunkId)
      }
    } else {
      edgeGroups.set(edgeKey, {
        fromId,
        toId,
        polarity: t.polarity,
        confidences: [t.confidence],
        sourceChunks: [t.chunkId],
      })
    }
  }

  // Check for contradictory edges (same cause/effect, opposite polarity)
  const pairsSeen = new Set<string>()
  for (const [key] of edgeGroups) {
    const [cause, effect] = key.split('|')
    const pairKey = `${cause}|${effect}`
    if (pairsSeen.has(pairKey)) {
      console.warn(`  WARNING: Contradictory beliefs detected for (${cause} -> ${effect})`)
    }
    pairsSeen.add(pairKey)
  }

  // Build edges with averaged confidence
  const edges: BeliefEdge[] = []
  for (const group of edgeGroups.values()) {
    const avgConfidence = group.confidences.reduce((a, b) => a + b, 0) / group.confidences.length
    edges.push({
      from: group.fromId,
      to: group.toId,
      polarity: group.polarity,
      confidence: Math.round(avgConfidence * 100) / 100,
      sourceChunks: group.sourceChunks,
    })
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  }
}

// ─── Main ────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function processPersona(personaName: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Processing: ${personaName}`)
  console.log(`${'='.repeat(60)}`)

  // Read corpus
  const corpusPath = path.join(CORPUS_DIR, `${personaName}.json`)
  const raw = await fs.readFile(corpusPath, 'utf-8')
  const corpus: CorpusEntry[] = JSON.parse(raw)
  console.log(`  Loaded ${corpus.length} corpus entries`)

  // Chunk
  const chunks = chunkCorpus(corpus)
  console.log(`  Chunked into ${chunks.length} segments`)

  // Extract triples from each chunk
  const allTriples: Array<RawTriple & { chunkId: string }> = []
  let processed = 0
  let skipped = 0

  for (const chunk of chunks) {
    try {
      const triples = await extractTriplesFromChunk(chunk.text, chunk.id, personaName)
      allTriples.push(...triples)
      processed++

      if (processed % 20 === 0) {
        console.log(`  Processed ${processed}/${chunks.length} chunks (${allTriples.length} triples so far)`)
      }
    } catch (err) {
      console.warn(`  WARNING: Failed to extract from chunk ${chunk.id}: ${(err as Error).message}`)
      skipped++
    }

    // Rate limit delay
    await sleep(100)
  }

  console.log(`  Extraction complete: ${allTriples.length} raw triples from ${processed} chunks (${skipped} skipped)`)

  if (allTriples.length === 0) {
    console.log(`  No triples extracted, skipping ${personaName}`)
    return
  }

  // Deduplicate
  const { nodes, edges } = deduplicateTriples(allTriples)
  console.log(`  Deduplicated: ${nodes.length} nodes, ${edges.length} edges`)

  // Look up persona ID from contracts
  let personaId = personaName
  try {
    const contractPath = path.join(CONTRACTS_DIR, `${personaName}.json`)
    const contractRaw = await fs.readFile(contractPath, 'utf-8')
    const contract = JSON.parse(contractRaw)
    if (contract.personaId) {
      personaId = contract.personaId
    }
  } catch {
    // Use personaName as fallback ID
  }

  // Build belief graph
  const graph: BeliefGraph = {
    personaId,
    personaName,
    nodes,
    edges,
    extractedAt: new Date().toISOString(),
  }

  // Write output
  await fs.mkdir(BELIEFS_DIR, { recursive: true })
  const outPath = path.join(BELIEFS_DIR, `${personaName}.json`)
  await fs.writeFile(outPath, JSON.stringify(graph, null, 2))
  console.log(`  Wrote: ${outPath}`)
}

async function main() {
  console.log('Faultline — Belief Graph Extraction\n')

  // Parse --only flag
  const args = process.argv.slice(2)
  const onlyIndex = args.indexOf('--only')
  const onlyName = onlyIndex !== -1 ? args[onlyIndex + 1] : null

  // Discover corpus files
  const files = await fs.readdir(CORPUS_DIR)
  const corpusFiles = files.filter(f => f.endsWith('.json'))
  const personaNames = corpusFiles.map(f => f.replace('.json', ''))

  if (onlyName) {
    if (!personaNames.includes(onlyName)) {
      console.error(`ERROR: No corpus file found for "${onlyName}". Available: ${personaNames.join(', ')}`)
      process.exit(1)
    }
    await processPersona(onlyName)
  } else {
    console.log(`Found ${personaNames.length} corpus files: ${personaNames.join(', ')}\n`)
    for (const name of personaNames) {
      await processPersona(name)
    }
  }

  console.log('\nDone!')
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err)
  process.exit(1)
})
