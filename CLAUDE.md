# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

All commands run from the `faultline/` subdirectory:

```bash
cd faultline

npm run dev           # Start Next.js dev server
npm run build         # Production build (run to verify no TS errors)
npm run lint          # ESLint

# Database
npm run db:push       # Push schema changes to Postgres (no migration file)
npm run db:generate   # Generate migration files
npm run db:migrate    # Run migrations
npm run db:seed       # Seed DB from file-based seed data
npm run db:studio     # Open Drizzle Studio

# Persona building
npm run build-personas  # Scrape X/Substack + generate contracts via Claude
```

**Required env vars** (in `faultline/.env.local`):
- `ANTHROPIC_API_KEY`
- `DATABASE_URL` (Postgres with pgvector)
- `X_BEARER_TOKEN` (optional, only for build-personas)

**Start Postgres**: `docker compose up -d` from repo root.

---

## Architecture

### Repository Layout

The Next.js app lives in `faultline/` — **not** the repo root. The repo root contains `docker-compose.yml`, `CLAUDE.md`, and `past_implementation.md` (history of all past debate engine attempts).

### Data Flow: Personas

Personas are loaded from **files**, not the database. The DB schema exists but the app reads from `data/seed/`:

```
data/seed/personas.json         — persona list (id, name, handle, picture, deckIds)
data/seed/deck-config.json      — deck definitions
data/seed/contracts/[Name].json — PersonaContract per persona (personality, bias, stakes, etc.)
data/seed/corpus/[Name].json    — raw scraped text (tweets, essays)
```

`lib/personas/loader.ts` is the only entry point for persona data at runtime. `scripts/build-personas.ts` regenerates contracts from scratch using X API + Substack RSS + Claude.

### Active Debate Engine: Dialogue + Crux Rooms

The only active engine is the **Dialogue + Crux system** at `/dialogue`.

```
app/api/dialogue/route.ts       — SSE endpoint (POST)
lib/dialogue/orchestrator.ts    — async generator: runDialogue()
lib/dialogue/agent.ts           — per-persona LLM call (generateMicroTurn)
lib/dialogue/turn-manager.ts    — round-robin turn assignment
lib/dialogue/disagreement-detector.ts — Haiku call; watches messages for disputes
lib/crux/orchestrator.ts        — runCruxRoom(): 5-phase crux room flow
lib/crux/steelman.ts            — steelman generation + validation
lib/crux/diagnosis.ts           — root cause classification
lib/crux/card-generator.ts      — produces CruxCard from completed room
```

**SSE event flow**: `dialogue_start` → `dialogue_message` (per turn) → `crux_room_start` (when disagreement detected) → `crux_room_message` → `crux_card` → `dialogue_end`

**Frontend**: `components/dialogue/DialogueView.tsx` consumes `lib/hooks/useDialogueStream.ts`. Crux cards rendered by `components/crux/CruxCard.tsx`.

### LLM Client

All LLM calls go through `lib/llm/client.ts`:
- `complete(opts)` — returns raw text
- `completeJSON<T>(opts)` — returns parsed JSON, handles markdown fences + truncation repair
- Two model tiers: `'sonnet'` (claude-sonnet-4-5) and `'haiku'` (claude-haiku-4-5). Haiku for cheap extraction/detection, Sonnet for generation.
- Auto-retry on 429/500/529 with exponential backoff.

### User Flow

```
/ (lobby, invite gate)
  → /setup (Build Your Hand: deck → persona selection → topic input)
      → /dialogue?personas=...&topic=... (active debate engine)
  → /cards (browse decks + persona contracts)
      → /cards/[id] (persona contract detail)
  → /debates (archive of old blitz/graph debates from DB)
      → /debates/[id] (replay viewer via DebateReplay.tsx)
  → /setup/create (create a new deck)
```

### Debate Archive (Read-Only)

`/debates` and `/debates/[id]` display historical debates stored in the `debates` DB table. The table stores the full SSE event stream as JSONB. `lib/hooks/hydrateDebateState.ts` replays those events into UI state. `components/DebateReplay.tsx` renders the result. These components exist solely to view old data — no new debates are written to the DB currently.

### Styling

Custom CSS variables are defined in `app/globals.css`. **Always use these instead of raw Tailwind colors**:
- `bg-background`, `bg-card-bg`, `bg-surface` — backgrounds (darkest to lightest)
- `border-card-border` — standard border
- `text-foreground`, `text-muted` — text
- `text-accent`, `bg-accent` — red (#dc2626 range)
- `text-danger` — error red

Never use `gray-*`, `blue-*`, or `purple-*` classes. Palette is black/red/white only.

---

## Core Principles

### Avoid Overengineering
- Prefer the simplest solution that solves the problem
- Don't add abstractions, helpers, or utilities for one-time operations
- Don't design for hypothetical future requirements
- Three similar lines of code is better than a premature abstraction

### Feature Development Process
When implementing new features, ALWAYS follow this process:

1. **Understand First** — Ask clarifying questions. Identify ambiguities and edge cases.
2. **Critique & Analyze** — Identify multiple approaches. Evaluate complexity vs. benefit, integration with existing architecture, failure modes, maintenance burden.
3. **Propose Minimal Solution** — Present the most robust, minimal implementation. Explain tradeoffs. Identify what is NOT being built and why.
4. **Plan Before Implementing** — Use EnterPlanMode for non-trivial features. Get user sign-off before writing code.
5. **Implement** — Only after approval. Stick to scope. No surprise additions.

## What NOT to Do

- ❌ Don't implement features without discussing approach first
- ❌ Don't add "nice to have" features beyond scope
- ❌ Don't create abstractions before they're clearly needed
- ❌ Don't use colors outside the black/red/white palette
- ❌ Don't add extensive error handling for impossible scenarios
- ❌ Don't create utilities/helpers for one-off operations
