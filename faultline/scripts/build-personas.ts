/**
 * build-personas.ts
 *
 * Fetches tweets from X API and/or posts from Substack RSS,
 * then uses Claude to generate structured persona contracts.
 *
 * Usage:
 *   npx tsx scripts/build-personas.ts                        # build all decks
 *   npx tsx scripts/build-personas.ts --deck crypto          # build one deck
 *   npx tsx scripts/build-personas.ts --deck crypto --only "Michael Saylor"  # one persona in one deck
 *   npx tsx scripts/build-personas.ts --only "Elon Musk"     # one persona across all decks
 *   npx tsx scripts/build-personas.ts --corpus-only          # fetch corpus only, skip contract generation
 *   npx tsx scripts/build-personas.ts --corpus-only --deck crypto  # corpus only for one deck
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import fs from 'fs/promises'
import path from 'path'
import { TwitterApi } from 'twitter-api-v2'
import Anthropic from '@anthropic-ai/sdk'
import RSSParser from 'rss-parser'

// ─── Types ───────────────────────────────────────────────────

interface DeckConfig {
  deck: {
    id: string
    name: string
    slug: string
  }
  topic: string
  personas: {
    id: string
    twitterHandle: string | null
    substackUrl: string | null
  }[]
  settings: {
    maxTweets: number
    maxSubstackPosts: number
    maxAnchorExcerpts: number
  }
}

interface RawTweet {
  id: string
  text: string
  created_at: string
  public_metrics?: {
    like_count: number
    retweet_count: number
    reply_count: number
  }
}

interface RawSubstackPost {
  title: string
  content: string
  url: string
  date: string
}

interface CorpusExcerpt {
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

interface EvidencePolicy {
  acceptableSources: string[]
  unacceptableSources: string[]
  weightingRules: string
  toolPullTriggers: string
}

interface AnchorExcerpt {
  id: string
  content: string
  source: string
  date: string
}

// ─── Constants ───────────────────────────────────────────────

const SEED_DIR = path.join(process.cwd(), 'data', 'seed')
const MODEL = 'claude-sonnet-4-5-20250929'
const CONTRACT_FIELDS = [
  'personality',
  'bias',
  'stakes',
  'epistemology',
  'timeHorizon',
  'flipConditions',
] as const

// ─── Clients ─────────────────────────────────────────────────

function getTwitterClient(): TwitterApi | null {
  const token = process.env.X_BEARER_TOKEN
  if (!token) return null
  return new TwitterApi(token)
}

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.error('ERROR: ANTHROPIC_API_KEY is required in .env.local')
    process.exit(1)
  }
  return new Anthropic({ apiKey: key })
}

// ─── Twitter Fetching ────────────────────────────────────────

async function fetchTwitterProfile(
  client: TwitterApi,
  handle: string
): Promise<{ id: string; name: string; profileImageUrl: string }> {
  const user = await client.v2.userByUsername(handle, {
    'user.fields': ['profile_image_url', 'name'],
  })
  if (!user.data) {
    throw new Error(`Twitter user not found: @${handle}`)
  }
  return {
    id: user.data.id,
    name: user.data.name,
    profileImageUrl: (user.data.profile_image_url ?? '').replace('_normal', '_400x400'),
  }
}

async function fetchTweets(
  client: TwitterApi,
  userId: string,
  maxTweets: number
): Promise<RawTweet[]> {
  const tweets: RawTweet[] = []
  const paginator = await client.v2.userTimeline(userId, {
    max_results: Math.min(maxTweets, 100),
    'tweet.fields': ['created_at', 'public_metrics'],
    exclude: ['retweets'],
  })

  // The async iterator yields individual tweet objects
  for await (const tweet of paginator) {
    tweets.push({
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at ?? new Date().toISOString(),
      public_metrics: tweet.public_metrics
        ? {
            like_count: tweet.public_metrics.like_count,
            retweet_count: tweet.public_metrics.retweet_count,
            reply_count: tweet.public_metrics.reply_count,
          }
        : undefined,
    })
    if (tweets.length >= maxTweets) break
  }

  return tweets
}

// ─── Substack Fetching ───────────────────────────────────────

async function fetchSubstackPosts(
  substackUrl: string,
  maxPosts: number
): Promise<RawSubstackPost[]> {
  const parser = new RSSParser()
  // Substack RSS is at /feed on the publication URL
  const feedUrl = substackUrl.replace(/\/$/, '') + '/feed'
  console.log(`  Fetching Substack RSS: ${feedUrl}`)

  const feed = await parser.parseURL(feedUrl)
  const posts: RawSubstackPost[] = []

  for (const item of feed.items.slice(0, maxPosts)) {
    // Strip HTML tags for plain text content, keep first ~2000 chars
    const plainText = (item['content:encoded'] ?? item.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000)

    posts.push({
      title: item.title ?? 'Untitled',
      content: plainText,
      url: item.link ?? '',
      date: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
    })
  }

  return posts
}

// ─── Claude Helpers ──────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  retries = 1
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
      const block = response.content[0]
      if (block.type === 'text') return block.text
      throw new Error('Unexpected response type: ' + block.type)
    } catch (err) {
      if (attempt < retries) {
        console.log(`  Retrying Claude call (attempt ${attempt + 2})...`)
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      throw err
    }
  }
  throw new Error('Unreachable')
}

function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (blockMatch) return blockMatch[1].trim()

  // Try to find raw JSON array or object
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
  if (jsonMatch) return jsonMatch[1].trim()

  return text.trim()
}

// ─── Filtering ───────────────────────────────────────────────

function buildCorpusText(
  tweets: RawTweet[],
  substackPosts: RawSubstackPost[],
  twitterHandle: string | null
): string {
  const parts: string[] = []

  if (tweets.length > 0) {
    parts.push('=== TWEETS ===')
    tweets.forEach((t, i) => {
      const metrics = t.public_metrics
        ? ` [${t.public_metrics.like_count} likes, ${t.public_metrics.retweet_count} RTs]`
        : ''
      parts.push(`[T${i}] (${t.created_at})${metrics}\n${t.text}`)
    })
  }

  if (substackPosts.length > 0) {
    parts.push('\n=== SUBSTACK POSTS ===')
    substackPosts.forEach((p, i) => {
      parts.push(`[S${i}] "${p.title}" (${p.date})\n${p.content}`)
    })
  }

  return parts.join('\n\n')
}

async function filterContent(
  claude: Anthropic,
  corpusText: string,
  deckDescription: string,
  tweetCount: number,
  postCount: number
): Promise<{ tweetIndices: number[]; postIndices: number[] }> {
  const systemPrompt = `You are a content analyst. Your job is to identify the most relevant, opinionated, and substantive content for a debate topic. Filter out noise like shitposts, off-topic content, simple retweet-bait, and promotional content.`

  const userPrompt = `The debate topic is: "${deckDescription}"

Below is a corpus of content from a public figure. Identify the most relevant and opinionated items for this debate topic.

Return a JSON object with two arrays:
- "tweetIndices": indices of the most relevant tweets (T0, T1, etc.) — pick up to 50
- "postIndices": indices of the most relevant Substack posts (S0, S1, etc.) — pick up to 10

Only include items that show clear opinions, arguments, or positions relevant to the topic.

${corpusText}

Return ONLY the JSON object, no other text.`

  const result = await callClaude(claude, systemPrompt, userPrompt)
  const parsed = JSON.parse(extractJSON(result)) as {
    tweetIndices?: (number | string)[]
    postIndices?: (number | string)[]
  }

  // Claude may return indices as numbers (0, 1) or prefixed strings ("T0", "S1")
  const parseIndices = (raw: (number | string)[], prefix: string, max: number): number[] => {
    return raw
      .map(v => {
        if (typeof v === 'number') return v
        const stripped = String(v).replace(new RegExp(`^${prefix}`, 'i'), '')
        return parseInt(stripped, 10)
      })
      .filter(i => !isNaN(i) && i >= 0 && i < max)
  }

  return {
    tweetIndices: parseIndices(parsed.tweetIndices ?? [], 'T', tweetCount),
    postIndices: parseIndices(parsed.postIndices ?? [], 'S', postCount),
  }
}

// ─── Contract Field Generation ───────────────────────────────

const FIELD_PROMPTS: Record<(typeof CONTRACT_FIELDS)[number], string> = {
  personality: `Analyze this person's communication style, rhetorical patterns, and personality traits.
Write 3-5 sentences describing their personality as it relates to debate and public discourse.
Include: tone (aggressive, measured, humorous?), rhetorical devices they favor, how they handle disagreement, their default emotional register.
Be specific — cite patterns you observe in their content.`,

  bias: `Analyze this person's biases and blind spots.
Write 3-5 sentences covering: ideological leanings, industry biases, confirmation bias patterns, topics they systematically avoid or dismiss, assumptions they treat as axioms.
Be specific and evidence-based — don't just list generic biases.`,

  stakes: `Analyze what this person has at stake in public discourse.
Write 3-5 sentences covering: financial interests, reputation concerns, organizational pressures, personal brand maintenance, what they gain or lose by taking various positions.
Be specific about their actual incentive structure.`,

  epistemology: `Analyze how this person evaluates truth and evidence.
Write 3-5 sentences covering: what they consider valid evidence, how they weigh different sources, their relationship with data vs. intuition, how they handle uncertainty, what constitutes proof in their worldview.
Be specific — note patterns in how they argue.`,

  timeHorizon: `Analyze this person's default time horizon for thinking about issues.
Write 3-5 sentences covering: do they think in quarters, years, decades, or centuries? How does this affect their arguments? Do they discount future risks? Are they focused on immediate execution or long-term vision?
Be specific about their temporal framing patterns.`,

  flipConditions: `Analyze what would make this person change their mind.
Write 3-5 sentences describing: specific types of evidence that would shift their position, conditions under which they'd reverse course, historical examples of them changing their mind (if any), what arguments they're most vulnerable to.
Be concrete — describe actual scenarios, not abstractions.`,
}

async function generateContractField(
  claude: Anthropic,
  field: (typeof CONTRACT_FIELDS)[number],
  filteredCorpus: string,
  personaName: string,
  deckDescription: string
): Promise<string> {
  const systemPrompt = `You are a persona analyst building a debate simulation profile for ${personaName}. The debate topic is: "${deckDescription}". Base your analysis ONLY on the provided content — do not invent details.`

  const userPrompt = `${FIELD_PROMPTS[field]}

Here is the content to analyze:

${filteredCorpus}

Write your analysis now. Do NOT use markdown headers or bullet points — write flowing prose paragraphs.`

  return callClaude(claude, systemPrompt, userPrompt)
}

// ─── Evidence Policy Generation ──────────────────────────────

async function generateEvidencePolicy(
  claude: Anthropic,
  filteredCorpus: string,
  personaName: string,
  deckDescription: string
): Promise<EvidencePolicy> {
  const systemPrompt = `You are a persona analyst. Based on the provided content from ${personaName}, infer their evidence policy for the debate topic: "${deckDescription}".`

  const userPrompt = `Analyze the content below and return a JSON object matching this exact schema:
{
  "acceptableSources": ["list of source types this person would cite or trust"],
  "unacceptableSources": ["list of source types this person would dismiss or reject"],
  "weightingRules": "1-2 sentences on how they prioritize different types of evidence",
  "toolPullTriggers": "1-2 sentences on what kinds of claims would make them want to look up data or cite sources"
}

Content:
${filteredCorpus}

Return ONLY the JSON object, no other text.`

  const result = await callClaude(claude, systemPrompt, userPrompt)
  return JSON.parse(extractJSON(result)) as EvidencePolicy
}

// ─── Anchor Excerpt Selection ────────────────────────────────

async function selectAnchorExcerpts(
  claude: Anthropic,
  tweets: RawTweet[],
  substackPosts: RawSubstackPost[],
  filteredTweetIndices: number[],
  filteredPostIndices: number[],
  twitterHandle: string | null,
  personaName: string,
  deckDescription: string,
  maxExcerpts: number
): Promise<AnchorExcerpt[]> {
  const systemPrompt = `You are selecting the most representative and quotable excerpts from ${personaName}'s content for a debate simulation about: "${deckDescription}".`

  const contentList: string[] = []
  const sourceMap: { type: 'tweet' | 'substack'; index: number }[] = []

  filteredTweetIndices.forEach(i => {
    const t = tweets[i]
    if (!t) return
    contentList.push(`[${contentList.length}] TWEET (${t.created_at}): ${t.text}`)
    sourceMap.push({ type: 'tweet', index: i })
  })

  filteredPostIndices.forEach(i => {
    const p = substackPosts[i]
    if (!p) return
    // Use first 500 chars of post as excerpt candidate
    contentList.push(
      `[${contentList.length}] SUBSTACK "${p.title}" (${p.date}): ${p.content.slice(0, 500)}`
    )
    sourceMap.push({ type: 'substack', index: i })
  })

  const userPrompt = `From the content below, select the ${maxExcerpts} most representative, quotable, and debate-relevant excerpts.

For each selected item, return a JSON array of objects:
[
  {
    "index": <number>,
    "quote": "<the exact quote or key excerpt to use, max 280 chars>"
  }
]

Content:
${contentList.join('\n\n')}

Return ONLY the JSON array, no other text.`

  const result = await callClaude(claude, systemPrompt, userPrompt)
  const selections = JSON.parse(extractJSON(result)) as {
    index: number
    quote: string
  }[]

  return selections.map((sel, i) => {
    const src = sourceMap[sel.index]
    if (!src) {
      return {
        id: `anchor-${i}`,
        content: sel.quote,
        source: 'Unknown',
        date: new Date().toISOString(),
      }
    }

    if (src.type === 'tweet') {
      const tweet = tweets[src.index]
      return {
        id: `anchor-${i}`,
        content: sel.quote,
        source: twitterHandle
          ? `https://x.com/${twitterHandle}/status/${tweet.id}`
          : `Tweet ${tweet.id}`,
        date: tweet.created_at,
      }
    } else {
      const post = substackPosts[src.index]
      return {
        id: `anchor-${i}`,
        content: sel.quote,
        source: post.url || post.title,
        date: post.date,
      }
    }
  })
}

// ─── Main ────────────────────────────────────────────────────

async function loadConfigs(): Promise<DeckConfig[]> {
  const configPath = path.join(SEED_DIR, 'deck-config.json')
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw)

    // Support both single object and array format
    const configs: DeckConfig[] = Array.isArray(parsed) ? parsed : [parsed]

    for (const config of configs) {
      if (!config.deck?.id || !config.topic || !config.personas?.length) {
        throw new Error(
          `Invalid deck config for "${config.deck?.id ?? 'unknown'}": missing deck.id, topic, or personas array`
        )
      }
    }
    return configs
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`ERROR: ${configPath} not found. Create it first.`)
      process.exit(1)
    }
    throw err
  }
}

async function buildPersona(
  config: DeckConfig,
  persona: DeckConfig['personas'][number],
  twitter: TwitterApi | null,
  claude: Anthropic,
  corpusOnly: boolean = false
) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Building persona: ${persona.id}${corpusOnly ? ' (corpus only)' : ''}`)
  console.log(`${'='.repeat(60)}`)

  // ─── Skip if corpus already exists (corpus-only mode) ───
  if (corpusOnly) {
    const corpusPath = path.join(SEED_DIR, 'corpus', `${persona.id}.json`)
    try {
      await fs.access(corpusPath)
      console.log(`  SKIP: corpus already exists at ${corpusPath}`)
      return null
    } catch {
      // File doesn't exist, proceed with fetching
    }
  }

  // ─── Fetch content ───
  let tweets: RawTweet[] = []
  let substackPosts: RawSubstackPost[] = []
  let profileName = persona.id
  let profileImageUrl = ''

  // Twitter
  if (persona.twitterHandle && twitter) {
    console.log(`  Fetching Twitter profile: @${persona.twitterHandle}`)
    try {
      const profile = await fetchTwitterProfile(twitter, persona.twitterHandle)
      profileName = profile.name
      profileImageUrl = profile.profileImageUrl
      console.log(`  Found: ${profile.name} (${profile.id})`)

      console.log(`  Fetching up to ${config.settings.maxTweets} tweets...`)
      tweets = await fetchTweets(twitter, profile.id, config.settings.maxTweets)
      console.log(`  Fetched ${tweets.length} tweets`)
    } catch (err) {
      console.warn(`  WARNING: Twitter fetch failed: ${(err as Error).message}`)
      console.warn(`  Continuing with Substack content only...`)
    }
  } else if (persona.twitterHandle && !twitter) {
    console.warn(`  WARNING: X_BEARER_TOKEN not set, skipping Twitter for @${persona.twitterHandle}`)
  }

  // Substack
  if (persona.substackUrl) {
    console.log(`  Fetching Substack posts...`)
    try {
      substackPosts = await fetchSubstackPosts(
        persona.substackUrl,
        config.settings.maxSubstackPosts
      )
      console.log(`  Fetched ${substackPosts.length} Substack posts`)

      // If no Twitter profile, try to get name from Substack
      if (!profileName || profileName === persona.id) {
        // Use the first post author or publication name as fallback
        profileName = persona.id
      }
    } catch (err) {
      console.warn(`  WARNING: Substack fetch failed: ${(err as Error).message}`)
    }
  }

  if (tweets.length === 0 && substackPosts.length === 0) {
    console.error(`  ERROR: No content fetched for ${persona.id}. Skipping.`)
    return null
  }

  // ─── Build corpus ───
  const corpus: CorpusExcerpt[] = []

  tweets.forEach(t => {
    corpus.push({
      id: `tweet-${t.id}`,
      content: t.text,
      source: persona.twitterHandle
        ? `https://x.com/${persona.twitterHandle}/status/${t.id}`
        : `Tweet ${t.id}`,
      date: t.created_at,
      platform: 'twitter',
      metrics: t.public_metrics
        ? {
            likes: t.public_metrics.like_count,
            retweets: t.public_metrics.retweet_count,
            replies: t.public_metrics.reply_count,
          }
        : undefined,
    })
  })

  substackPosts.forEach((p, i) => {
    corpus.push({
      id: `substack-${i}`,
      content: p.content,
      source: p.url,
      date: p.date,
      platform: 'substack',
    })
  })

  // ─── Write corpus file ───
  const corpusPath = path.join(SEED_DIR, 'corpus', `${persona.id}.json`)
  await fs.mkdir(path.dirname(corpusPath), { recursive: true })
  await fs.writeFile(corpusPath, JSON.stringify(corpus, null, 2))
  console.log(`  Wrote: ${corpusPath}`)

  // ─── Corpus-only mode: skip contract generation ───
  if (corpusOnly) {
    console.log(`  Corpus-only mode: skipping contract generation`)
    return null
  }

  // ─── Filter content ───
  console.log(`  Filtering content for relevance...`)
  const corpusText = buildCorpusText(tweets, substackPosts, persona.twitterHandle)
  const { tweetIndices, postIndices } = await filterContent(
    claude,
    corpusText,
    config.topic,
    tweets.length,
    substackPosts.length
  )
  console.log(`  Kept ${tweetIndices.length} tweets, ${postIndices.length} Substack posts`)

  if (tweetIndices.length === 0 && postIndices.length === 0) {
    console.error(`  ERROR: Filtering kept 0 items for ${persona.id}. Contract would be ungrounded. Skipping.`)
    return null
  }

  // Build filtered corpus text for downstream calls
  const filteredParts: string[] = []
  for (const i of tweetIndices) {
    const t = tweets[i]
    if (t) filteredParts.push(`[Tweet ${t.created_at}] ${t.text}`)
  }
  for (const i of postIndices) {
    const p = substackPosts[i]
    if (p) filteredParts.push(`[Substack "${p.title}" ${p.date}] ${p.content}`)
  }
  const filteredCorpus = filteredParts.join('\n\n')

  // ─── Generate contract fields (6 calls) ───
  const contractFields: Record<string, string> = {}
  for (const field of CONTRACT_FIELDS) {
    console.log(`  Generating: ${field}...`)
    contractFields[field] = await generateContractField(
      claude,
      field,
      filteredCorpus,
      profileName,
      config.topic
    )
  }

  // ─── Generate evidence policy ───
  console.log(`  Generating: evidence policy...`)
  const evidencePolicy = await generateEvidencePolicy(
    claude,
    filteredCorpus,
    profileName,
    config.topic
  )

  // ─── Select anchor excerpts ───
  console.log(`  Selecting anchor excerpts...`)
  const anchorExcerpts = await selectAnchorExcerpts(
    claude,
    tweets,
    substackPosts,
    tweetIndices,
    postIndices,
    persona.twitterHandle,
    profileName,
    config.topic,
    config.settings.maxAnchorExcerpts
  )
  console.log(`  Selected ${anchorExcerpts.length} anchor excerpts`)

  // ─── Build contract ───
  const contract = {
    personaId: persona.id,
    version: new Date().toISOString(),
    personality: contractFields.personality,
    bias: contractFields.bias,
    stakes: contractFields.stakes,
    epistemology: contractFields.epistemology,
    timeHorizon: contractFields.timeHorizon,
    flipConditions: contractFields.flipConditions,
    evidencePolicy,
    anchorExcerpts,
  }

  // ─── Write contract file ───
  const contractPath = path.join(SEED_DIR, 'contracts', `${persona.id}.json`)
  await fs.mkdir(path.dirname(contractPath), { recursive: true })
  await fs.writeFile(contractPath, JSON.stringify(contract, null, 2))
  console.log(`  Wrote: ${contractPath}`)

  // Return metadata for personas.json
  return {
    id: persona.id,
    name: profileName,
    twitterHandle: persona.twitterHandle ? `@${persona.twitterHandle}` : '',
    twitterPicture: profileImageUrl,
    deckIds: [config.deck.id],
    suite: null,
    locked: false,
  }
}

async function main() {
  console.log('Crux — Persona Builder\n')

  // Parse flags
  const args = process.argv.slice(2)
  const onlyIndex = args.indexOf('--only')
  const onlyId = onlyIndex !== -1 ? args[onlyIndex + 1] : null
  const deckIndex = args.indexOf('--deck')
  const deckId = deckIndex !== -1 ? args[deckIndex + 1] : null
  const corpusOnly = args.includes('--corpus-only')

  // Load configs
  const allConfigs = await loadConfigs()

  // Filter decks if --deck
  const configs = deckId
    ? allConfigs.filter(c => c.deck.id === deckId || c.deck.slug === deckId)
    : allConfigs

  if (configs.length === 0) {
    const available = allConfigs.map(c => c.deck.id).join(', ')
    console.error(`ERROR: No deck found with id "${deckId}". Available: ${available}`)
    process.exit(1)
  }

  console.log(`Decks to build: ${configs.map(c => c.deck.id).join(', ')}`)
  if (corpusOnly) console.log(`Mode: corpus-only (skipping contract generation)`)
  console.log()

  // Init clients
  const twitter = getTwitterClient()
  const claude = corpusOnly ? null : getAnthropicClient()

  if (!twitter) {
    console.warn('WARNING: X_BEARER_TOKEN not set. Twitter fetching disabled.')
    console.warn('Only Substack content will be used.\n')
  }

  // Build all selected decks
  const allPersonaMetadata: NonNullable<Awaited<ReturnType<typeof buildPersona>>>[] = []
  const allDeckEntries: Array<Record<string, unknown>> = []

  for (const config of configs) {
    console.log(`\n${'━'.repeat(60)}`)
    console.log(`Deck: ${config.deck.name}`)
    console.log(`Topic: ${config.topic}`)
    console.log(`Personas: ${config.personas.map(p => p.id).join(', ')}`)
    console.log(`${'━'.repeat(60)}`)

    // Filter personas if --only
    const personasToBuild = onlyId
      ? config.personas.filter(p => p.id === onlyId)
      : config.personas

    if (personasToBuild.length === 0) {
      console.warn(`WARNING: No persona "${onlyId}" in deck "${config.deck.id}". Skipping.`)
      continue
    }

    const personaMetadata: NonNullable<Awaited<ReturnType<typeof buildPersona>>>[] = []

    for (const persona of personasToBuild) {
      const result = await buildPersona(config, persona, twitter, claude!, corpusOnly)
      if (result) personaMetadata.push(result)
    }

    allPersonaMetadata.push(...personaMetadata)

    allDeckEntries.push({
      id: config.deck.id,
      name: config.deck.name,
      slug: config.deck.slug,
      personaIds: config.personas.map(p => p.id),
      locked: false,
      createdAt: new Date().toISOString(),
    })
  }

  // ─── Write personas.json (skip in corpus-only mode) ───
  if (!corpusOnly) {
    let existingPersonas: typeof allPersonaMetadata = []
    let existingDecks: Array<Record<string, unknown>> = []

    const personasPath = path.join(SEED_DIR, 'personas.json')
    try {
      const existing = JSON.parse(await fs.readFile(personasPath, 'utf-8'))
      existingPersonas = existing.personas ?? []
      existingDecks = existing.decks ?? []
    } catch {
      // File doesn't exist or is invalid, start fresh
    }

    // Merge personas (replace by id)
    const personaMap = new Map(existingPersonas.map(p => [p.id, p]))
    for (const p of allPersonaMetadata) {
      personaMap.set(p.id, p)
    }

    // Merge decks (replace by id)
    const deckMap = new Map(existingDecks.map(d => [d.id as string, d]))
    for (const d of allDeckEntries) {
      deckMap.set(d.id as string, d)
    }

    const personasFile = {
      decks: Array.from(deckMap.values()),
      personas: Array.from(personaMap.values()),
    }

    await fs.writeFile(personasPath, JSON.stringify(personasFile, null, 2))
    console.log(`\nWrote: ${personasPath}`)
  }

  console.log(`\nDone! Processed ${configs.reduce((sum, c) => sum + c.personas.length, 0)} persona(s) across ${allDeckEntries.length} deck(s).`)
  if (corpusOnly) {
    console.log('Mode: corpus-only (contracts and personas.json were not modified)')
  } else {
    console.log('Generated files:')
    for (const p of allPersonaMetadata) {
      console.log(`  - data/seed/contracts/${p.id}.json`)
      console.log(`  - data/seed/corpus/${p.id}.json`)
    }
    console.log('  - data/seed/personas.json')
  }
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err)
  process.exit(1)
})
