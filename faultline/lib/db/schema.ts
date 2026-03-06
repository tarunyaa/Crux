import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  real,
  primaryKey,
  vector,
} from 'drizzle-orm/pg-core'

// ─── Decks ───────────────────────────────────────────────────

export const decks = pgTable('decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Personas ────────────────────────────────────────────────

export const personas = pgTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  twitterHandle: text('twitter_handle').notNull().default(''),
  twitterPicture: text('twitter_picture').notNull().default(''),
  locked: boolean('locked').notNull().default(false),
  suite: text('suite'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Persona ↔ Deck (many-to-many) ──────────────────────────

export const personaDecks = pgTable(
  'persona_decks',
  {
    personaId: text('persona_id')
      .notNull()
      .references(() => personas.id, { onDelete: 'cascade' }),
    deckId: text('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.personaId, t.deckId] })]
)

// ─── Corpus Chunks ───────────────────────────────────────────

export const corpusChunks = pgTable('corpus_chunks', {
  id: text('id').primaryKey(),
  personaId: text('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  sourceType: text('source_type').notNull(), // 'tweet' | 'substack' | 'transcript' | 'excerpt'
  sourceUrl: text('source_url').notNull().default(''),
  sourceDate: timestamp('source_date', { withTimezone: true }),
  embedding: vector('embedding', { dimensions: 1024 }),
  chunkIndex: integer('chunk_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Persona Contracts ───────────────────────────────────────

export const personaContracts = pgTable('persona_contracts', {
  id: text('id').primaryKey(),
  personaId: text('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  version: text('version').notNull(), // ISO timestamp of corpus build
  contractJson: jsonb('contract_json').notNull(), // full PersonaContract object
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Debates ─────────────────────────────────────────────────

// ─── CruxArena ───────────────────────────────────────────────

export const arenaDebates = pgTable('arena_debates', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  methodsRun: jsonb('methods_run').notNull().$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const arenaOutputs = pgTable('arena_outputs', {
  id: text('id').primaryKey(),
  debateId: text('debate_id')
    .notNull()
    .references(() => arenaDebates.id, { onDelete: 'cascade' }),
  method: text('method').notNull(), // 'direct_crux' | 'cot_crux' | 'multiagent_crux' | 'argora_crux'
  cruxCards: jsonb('crux_cards').notNull().$type<unknown[]>(),
  tokenUsage: jsonb('token_usage').notNull().$type<Record<string, number>>(),
  runtimeMs: integer('runtime_ms').notNull(),
  model: text('model').notNull(),
  costUsd: real('cost_usd'),
})

export const arenaVotes = pgTable('arena_votes', {
  id: text('id').primaryKey(),
  debateId: text('debate_id')
    .notNull()
    .references(() => arenaDebates.id, { onDelete: 'cascade' }),
  methodA: text('method_a').notNull(),
  methodB: text('method_b').notNull(),
  winner: text('winner').notNull(), // 'a' | 'b' | 'tie'
  sessionId: text('session_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Debates ─────────────────────────────────────────────────

export const debates = pgTable('debates', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  mode: text('mode').notNull(), // 'blitz' | 'classical'
  personaIds: jsonb('persona_ids').notNull().$type<string[]>(),
  events: jsonb('events').notNull().$type<unknown[]>(),
  output: jsonb('output').$type<unknown>(),
  status: text('status').notNull(), // 'completed' | 'error'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
