# Debate Memory Architecture

## Problem Statement

Faultline's debate agents have almost no memory. Each LLM call receives a narrow slice of context — usually just the previous miniround's messages or a 1-2 sentence summary of earlier rounds. By round 3, an agent has no idea what specific things were said in rounds 1-2, who agreed with them, what evidence was cited, or how positions evolved. Crux rooms are even worse: agents are dropped into a focused dispute with only the crux question and their opponent's name — no dialogue history, no context about what triggered the disagreement.

This document designs a proper memory architecture, drawing from Stanford's Generative Agents (Park et al. 2023), blackboard systems (LbMAS, arXiv:2510.01285), and MemGPT/Letta's memory block pattern.

---

## Current State: What Agents See Today

### Context Available by Phase

| Agent Function | What It Receives | What It Cannot See |
|---|---|---|
| Opening statement | Persona contract + voice profile + topic string | Nothing else — complete cold start |
| Take (miniround 0) | Contract + round summaries (1-2 sent each) + contested claims + crux cards + opening statements | Other personas' specific positions, evidence cited, who agrees with whom |
| Take (miniround 1+) | Contract + previous miniround messages (self excluded) | All prior minirounds, debate history, round summaries |
| Crux room position | Contract + crux question + opponent name + original topic | Everything from the dialogue that triggered this |
| Crux room exchange | Contract + opening positions + last 4 crux messages | Earlier crux messages (>4 back), dialogue context |
| Closing statement | Contract + round summaries + contested claims + crux cards | Full transcript, specific evidence, intermediate shifts |

### Where Context Is Lost

1. **Round summaries compress ~6 messages into 1-2 sentences** — who said what, with what evidence, is destroyed
2. **Crux rooms have a hard cap of 4 messages of history** — agents can't recall their own opening position by turn 5
3. **No cross-round awareness** — agents in aspect 2 can't reference specific things said in aspect 1
4. **No position tracking** — the system never records "Saylor holds X because of Y, challenged by Hayes on Z"
5. **Dialogue-to-crux decoupling** — crux rooms don't receive the dialogue messages that triggered them

---

## Design: Shared Blackboard + Per-Persona Memory

### Architecture Overview

```
                         ┌─────────────────────────────┐
                         │      DEBATE BLACKBOARD       │
                         │      (shared mutable state)  │
                         │                              │
                         │  Topic + Aspects              │
                         │  Position Ledger (per-persona)│
                         │  Contested Claims (live)      │
                         │  Crux Cards (produced)        │
                         │  Round Transcripts (bounded)  │
                         │  Reflections (cross-round)    │
                         └──────────┬──────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
              │  Agent A   │  │  Agent B   │  │  Agent C   │
              │            │  │            │  │            │
              │ System:    │  │ System:    │  │ System:    │
              │  Contract  │  │  Contract  │  │  Contract  │
              │  + Voice   │  │  + Voice   │  │  + Voice   │
              │            │  │            │  │            │
              │ Context:   │  │ Context:   │  │ Context:   │
              │  Blackboard│  │  Blackboard│  │  Blackboard│
              │  view      │  │  view      │  │  view      │
              │  (tailored)│  │  (tailored)│  │  (tailored)│
              └────────────┘  └────────────┘  └────────────┘
```

The blackboard is **not** a prompt. It's a structured TypeScript object that the orchestrator maintains throughout the debate. A `contextAssembler` function reads the blackboard and produces a tailored context string for each agent at each turn — what they need to know, in the right amount, for this specific moment.

### Core Principle: Agents Don't Write to the Blackboard

Inspired by LbMAS's split-board isolation: agents produce utterances, the **orchestrator** updates the blackboard. This prevents agents from gaming the shared state and keeps the single source of truth under orchestrator control.

```
Agent produces utterance
        │
        ▼
Orchestrator receives utterance
        │
        ├── Appends to message log
        ├── Updates position ledger (cheap Haiku extraction)
        ├── Updates contested claims (if disagreement detected)
        ├── Triggers reflection (if threshold reached)
        │
        ▼
Next agent receives updated blackboard view
```

---

## Data Model

### The Blackboard: `DebateBlackboard`

```typescript
interface DebateBlackboard {
  // ─── Static (set once) ─────────────────────────────
  topic: string
  aspects: DebateAspect[]
  personaIds: PersonaId[]

  // ─── Position Ledger (updated after each message) ──
  positions: Map<PersonaId, PersonaPositionState>

  // ─── Contested Claims (live, mutable) ──────────────
  contestedClaims: LiveClaim[]

  // ─── Message Log (append-only, full transcript) ────
  messages: DialogueMessage[]

  // ─── Round State ───────────────────────────────────
  rounds: RoundRecord[]
  currentRound: number

  // ─── Reflections (generated periodically) ──────────
  reflections: Reflection[]

  // ─── Crux Cards (from completed crux rooms) ────────
  cruxCards: CruxCard[]
}
```

### Per-Persona Position State

This is the single most important new data structure. It tracks what each persona has actually said and committed to, updated by the orchestrator after each message.

```typescript
interface PersonaPositionState {
  personaId: PersonaId

  // Current stance on the overall topic
  overallStance: string           // 1-sentence summary, updated each round

  // Per-aspect positions
  aspectPositions: Map<string, {  // keyed by aspect.id
    position: string              // 1-sentence position
    evidence: string[]            // evidence/reasoning they cited
    challenged: string[]          // challenges they haven't answered
  }>

  // Relationship to other personas
  agreements: Array<{
    withPersona: PersonaId
    on: string                    // what they agree on
  }>
  disagreements: Array<{
    withPersona: PersonaId
    on: string                    // what they disagree on
    intensity: 'mild' | 'strong'  // how heated
  }>

  // Concessions and shifts
  concessions: string[]           // things they've backed down on
  shifts: string[]                // positions that evolved (with direction)

  // Turn counter for staleness
  lastUpdatedRound: number
}
```

### Live Contested Claims

Upgraded from the current `ContestedClaim` — now tracks the full lifecycle of a dispute.

```typescript
interface LiveClaim {
  id: string
  claim: string
  personas: [PersonaId, PersonaId]
  status: 'active' | 'in_crux_room' | 'resolved' | 'abandoned'
  sourceRound: number
  sourceMessages: string[]        // message IDs that surfaced this
  cruxRoomId?: string             // if sent to crux room
  resolution?: string             // how it was resolved
  cruxCard?: CruxCard             // produced card, if any
}
```

### Reflections

Inspired by Generative Agents. Higher-order observations generated periodically by the orchestrator, not by agents. These are statements like "Saylor and Hayes fundamentally disagree on time horizons — Saylor measures in decades, Hayes in quarters" that emerge from watching the debate unfold.

```typescript
interface Reflection {
  id: string
  content: string                 // The insight
  type: 'pattern' | 'shift' | 'convergence' | 'escalation'
  aboutPersonas: PersonaId[]      // Who this is about
  sourceMessages: string[]        // Evidence (message IDs)
  round: number                   // When generated
  importance: number              // 1-10, LLM-assigned
}
```

### Round Records

Replace the lossy `RoundSummary` with structured extraction.

```typescript
interface RoundRecord {
  aspect: DebateAspect
  roundNumber: number

  // Per-persona structured take (not a blob summary)
  takes: Map<PersonaId, {
    position: string              // Their stance on this aspect
    keyArgument: string           // Strongest argument they made
    evidenceCited: string[]       // Specific evidence/data referenced
    targetedPersona?: PersonaId   // Who they primarily engaged with
  }>

  // Round-level observations
  summary: string                 // Still keep a 1-2 sentence summary for quick reference
  newDisagreements: string[]      // Disputes that emerged this round
  shifts: string[]                // Position changes observed this round
}
```

---

## Context Assembly: What Each Agent Sees

The `assembleContext` function reads the blackboard and produces a tailored view for a specific persona at a specific moment. The key design choice: **structured sections, not a text dump**.

### Context Template

```
── DEBATE STATE ──────────────────────────────
Topic: {topic}
Current aspect: {aspect.label} — {aspect.description}
Round {n} of {total}

── WHERE EVERYONE STANDS ─────────────────────
{For each OTHER persona:}
{Name}: {overallStance}
  - On {aspect}: {position}
  - Agrees with you on: {agreements}
  - Disagrees with you on: {disagreements}

── YOUR POSITION SO FAR ──────────────────────
You've argued: {your overallStance}
Evidence you've cited: {your evidence}
Challenges you haven't answered: {your unanswered challenges}
{If concessions:} You've conceded: {concessions}

── OPEN DISPUTES ─────────────────────────────
{For each active contested claim:}
• {claim} — {persona1} vs {persona2} [{status}]

── RECENT EXCHANGE ───────────────────────────
{Last 6-8 messages verbatim, with persona names}

── KEY INSIGHTS ──────────────────────────────
{Top 2-3 reflections by importance, if any exist}
```

### Context Budget (Token Estimates)

| Section | Estimated Tokens | Notes |
|---|---|---|
| Debate state | ~30 | Static, cheap |
| Where everyone stands | ~50-80 per persona | Structured, compressed |
| Your position so far | ~60-80 | Self-awareness |
| Open disputes | ~30-50 | Only active claims |
| Recent exchange | ~200-400 | Sliding window, verbatim |
| Key insights | ~60-100 | Top reflections only |
| **Total context** | **~450-800** | Well under budget |

Combined with the system prompt (~500-700 tokens for consolidated persona), total per-call is ~1,000-1,500 tokens of context. This leaves ample room for the user prompt instructions and output.

### Context Variations by Phase

**Opening**: No blackboard yet — just topic + aspect list + other persona names. Cold start is intentional.

**Miniround 0** (initial take on new aspect): Full blackboard view minus recent exchange (no messages yet for this aspect). Heavy on position ledger and reflections from prior rounds.

**Miniround 1+** (responses): Full blackboard view with recent exchange from this round. Position ledger helps agents know where everyone stands even if they only see the last few messages verbatim.

**Crux room entry**: Blackboard view focused on the disputed claim — the dialogue messages that triggered it, both personas' position states, and any prior crux cards on related topics. This fixes the current "context vacuum" in crux rooms.

**Closing**: Full blackboard view with all reflections and the complete position ledger. Agents can reference specific shifts and engagements because the ledger tracked them.

---

## Blackboard Update Pipeline

### After Each Message

When a persona produces an utterance:

1. **Append to message log** — trivial, just push
2. **Update position ledger** — single Haiku call extracts structured position update

```
Position Update Prompt (Haiku, temperature 0.2):

Current position state for {name}:
{current PersonaPositionState as JSON}

{name} just said (on "{aspect.label}"):
"{utterance}"

Other recent messages:
{last 3 messages for context}

Update their position state. What changed? Output JSON:
{
  "overallStance": "updated 1-sentence summary or null if unchanged",
  "aspectPosition": {
    "position": "their stance on this aspect",
    "evidence": ["new evidence cited, if any"],
    "challenged": ["new challenges they face, if any"]
  },
  "newAgreement": { "withPersona": "name or null", "on": "what" } | null,
  "newDisagreement": { "withPersona": "name or null", "on": "what" } | null,
  "concession": "what they conceded, or null",
  "shift": "how position changed, or null"
}
```

**Cost**: 1 Haiku call per message. At ~3 personas × 3 aspects × 3 minirounds = ~27 messages, that's 27 Haiku calls for position tracking. Haiku is ~$0.25/MTok input, so this is negligible.

### After Each Round

After all minirounds for an aspect complete:

1. **Generate round record** — single Haiku call extracts structured takes per persona (replaces the current 1-2 sentence summary)
2. **Check reflection threshold** — if accumulated importance of new messages exceeds threshold, generate reflections

### Reflection Generation

Adapted from Generative Agents' reflection mechanism. Triggered when the sum of position changes + new disagreements + concessions exceeds a threshold (not every round, only when something meaningful happened).

```
Reflection Prompt (Haiku, temperature 0.3):

Debate on: "{topic}"
Participants: {names}

What's happened so far:
{position ledger summary}
{recent round records}
{active contested claims}

What are the 2-3 most important patterns or dynamics in this debate?
Think about: who is converging, who is talking past each other,
what underlying assumptions drive the disagreements, what has shifted.

Output JSON:
{
  "reflections": [
    {
      "content": "the insight",
      "type": "pattern|shift|convergence|escalation",
      "aboutPersonas": ["name1", "name2"],
      "importance": 1-10
    }
  ]
}
```

**Cost**: 1 Haiku call per round where the threshold is met. Typically 1-2 times per debate.

---

## Implementation Plan

### Phase 1: Blackboard Data Model + Position Ledger (Core)

**Goal**: Replace ad-hoc context assembly with a structured blackboard that tracks per-persona positions and is updated after each message.

**Files to create**:
- `lib/dialogue/blackboard.ts` — `DebateBlackboard` class with create/update/query methods

**Files to modify**:
- `lib/dialogue/types.ts` — Add new interfaces (`DebateBlackboard`, `PersonaPositionState`, `LiveClaim`, `RoundRecord`)
- `lib/dialogue/orchestrator.ts` — Initialize blackboard at debate start, update after each message, pass to context assembler
- `lib/dialogue/context-builder.ts` — Replace `buildTurnContext` with `assembleContext(blackboard, personaId, phase)` that reads from the blackboard and produces persona-tailored context

**New LLM call**:
- Position extraction (Haiku) — called after each message to update `PersonaPositionState`

**What changes for agents**:
- `generateTake` receives structured context from blackboard instead of raw text
- `generateClosing` receives full position ledger instead of lossy summaries
- Crux rooms receive dialogue context that triggered them

**What does NOT change**:
- System prompts (`buildConsolidatedPrompt`) — untouched
- Agent functions' signatures — they still receive a context string, just a better one
- SSE event types — no frontend changes needed
- Crux room internals — only the context they receive at entry improves

### Phase 2: Structured Round Records

**Goal**: Replace 1-2 sentence Haiku summaries with structured per-persona take extraction.

**Files to modify**:
- `lib/dialogue/context-builder.ts` — Replace `summarizeRound` with `extractRoundRecord` that produces a `RoundRecord` with per-persona positions, evidence, and engagement targets
- `lib/dialogue/orchestrator.ts` — Use `RoundRecord` instead of `RoundSummary` when storing round data on the blackboard

**What changes**:
- Agents in later rounds see structured "Name took position X, citing Y evidence, challenged by Z" instead of "They debated about topic"
- Closing statements can reference specific evidence and positions from any round

### Phase 3: Reflections

**Goal**: Add periodic higher-order observations that surface cross-round patterns.

**Files to create**:
- `lib/dialogue/reflector.ts` — Reflection trigger logic + generation prompt

**Files to modify**:
- `lib/dialogue/blackboard.ts` — Add reflection storage + importance accumulator
- `lib/dialogue/orchestrator.ts` — Call reflector after rounds, include top reflections in context
- `lib/dialogue/context-builder.ts` — Add reflection section to assembled context

**Trigger**: Sum of (new disagreements × 3 + concessions × 4 + shifts × 5) since last reflection > threshold (e.g., 15). This means reflections fire when meaningful epistemic events accumulate, not on a timer.

### Phase 4: Crux Room Context Bridge

**Goal**: Crux rooms receive relevant dialogue context instead of entering a vacuum.

**Files to modify**:
- `lib/crux/orchestrator.ts` — Accept blackboard view at room entry, include source dialogue messages and position states in the crux room system prompt
- `lib/dialogue/orchestrator.ts` — Pass blackboard snapshot when spawning crux rooms

**What changes**:
- Crux room position statements are informed by what was said in dialogue
- Crux exchange agents know the history of the dispute, not just the question

---

## Phase 5 (Future): Vector DB + Retrieval-Augmented Memory

Once the blackboard is in place and debates are running well with structured context, the next evolution is adding embedding-based retrieval for:
1. Long debates (50+ messages) where even the sliding window misses important earlier context
2. Cross-debate memory (a persona remembers positions from a previous debate)
3. Evidence retrieval from the persona's corpus (tweets, essays) during debate

### Architecture

```
┌──────────────────────────────────────────────┐
│              VECTOR STORE                     │
│         (pgvector, already in schema)         │
│                                               │
│  Collections:                                 │
│  ┌─────────────────────────────────────────┐  │
│  │ debate_memories                          │  │
│  │  - embedding (1024d, voyage-3)           │  │
│  │  - text (the memory content)             │  │
│  │  - metadata:                             │  │
│  │      personaId, debateId, round,         │  │
│  │      type (message|position|reflection), │  │
│  │      importance (1-10),                  │  │
│  │      timestamp                           │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ corpus_chunks (already exists)           │  │
│  │  - persona's source material             │  │
│  │  - tweets, essays, interviews            │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### What Gets Embedded

Not every message — that's wasteful. Embed:
1. **Position state snapshots** — when a persona's position changes, embed the new state
2. **Reflections** — higher-order observations are the most retrieval-worthy
3. **Crux cards** — structured disagreement summaries
4. **High-importance messages** — messages that introduce new evidence, make concessions, or shift positions (importance >= 7)

### Retrieval Flow

Adapted from Generative Agents' scoring formula (using their actual code weights, not the paper's):

```
score = 0.5 * recency + 3.0 * relevance + 2.0 * importance
```

- **Recency**: `decay^(position_in_time_sorted_list)`, decay = 0.99
- **Relevance**: cosine similarity between query embedding and memory embedding
- **Importance**: the 1-10 score assigned at creation time

Query is constructed from the current turn context: aspect being discussed + the last message the agent is responding to.

Retrieve top-K (K=5-10) memories. These supplement the blackboard context — they don't replace it. The blackboard is the primary context source; vector retrieval adds "you said something relevant about this 3 rounds ago" recall.

### Implementation

**DB schema addition** (in `lib/db/schema.ts`):
```typescript
export const debateMemories = pgTable('debate_memories', {
  id: text('id').primaryKey(),
  debateId: text('debate_id').notNull(),
  personaId: text('persona_id').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull(),           // 'message' | 'position' | 'reflection' | 'crux_card'
  importance: integer('importance'),       // 1-10
  round: integer('round'),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow(),
})
```

**Embedding model**: Voyage AI `voyage-3` (1024d) — already configured in the codebase for corpus chunks.

**New files**:
- `lib/dialogue/memory-store.ts` — Insert memories, query by similarity + recency + importance
- `lib/dialogue/embedder.ts` — Batch embed position states and reflections (called after round completion, not per-message, to avoid latency)

**Integration**:
- `assembleContext` gains an optional `retrievedMemories` parameter
- Orchestrator calls `memoryStore.retrieve(query, personaId, topK)` before assembling context
- Retrieved memories are appended as a "Relevant earlier context" section in the context template

### Cross-Debate Memory (Future Future)

Once memories are in pgvector with `debateId` as metadata, querying across debates is trivial:
```sql
SELECT * FROM debate_memories
WHERE persona_id = $1
ORDER BY embedding <=> $2  -- cosine distance to query
LIMIT 10
```

A persona could recall "Last time this topic came up, I argued X and was challenged on Y." This is the long-term memory horizon — not needed for Phase 1 but the architecture supports it naturally.

---

## Comparison with Research

### What We're Taking from Generative Agents

| Concept | Generative Agents | Our Adaptation |
|---|---|---|
| Memory stream | Append-only log of all observations | Message log on the blackboard |
| Importance scoring | LLM-assigned 1-10 at creation | Same, used for reflection triggers and retrieval |
| Retrieval formula | `0.5*recency + 3.0*relevance + 2.0*importance` | Same (Phase 5, vector retrieval) |
| Reflections | Triggered when importance accumulates past 150 | Triggered by epistemic events (disagreements, concessions, shifts) |
| Relationship tracking | Keyword lookup + on-demand LLM summarization | Structured position ledger with explicit agreements/disagreements |

### What We're Taking from Blackboard Architecture

| Concept | LbMAS / Classical Blackboard | Our Adaptation |
|---|---|---|
| Shared mutable state | Public board all agents read | `DebateBlackboard` object |
| Knowledge sources write | Agents write to board directly | Orchestrator writes; agents only produce utterances |
| Private bilateral spaces | For resolving conflicts between two KS | Crux rooms (already exist) |
| Control mechanism | Scheduler decides who acts next | Orchestrator's round-robin + disagreement detection |
| Split-board isolation | Write-board separate from read-board | Agents never see raw blackboard; context assembler mediates |

### What We're NOT Building

- **No vector DB in Phase 1-4** — debates are bounded at ~50-80 messages, structured extraction handles this
- **No embedding-based retrieval until Phase 5** — the position ledger + sliding window is sufficient for current scale
- **No agent-writable memory** — unlike MemGPT where agents page their own memory, our orchestrator controls all state
- **No temporal knowledge graph** — Zep/Graphiti is overkill; our position ledger with `lastUpdatedRound` timestamps serves the same purpose for bounded debates
- **No contradiction detection** — unlike Generative Agents which has no mechanism for this, our position ledger inherently handles it: when the orchestrator updates a persona's position, the old position is overwritten, not appended

---

## Migration Path

The blackboard is an internal orchestrator change. It does not affect:
- SSE event types (frontend receives the same events)
- Agent function signatures (they receive a string context, just a better one)
- The prompt architecture (system prompts stay in `buildConsolidatedPrompt`, user prompts stay in agent functions)
- Crux room event flow (same phases, just better context at entry)

The only visible change is that agents will produce more grounded, position-aware responses because they actually know where everyone stands.
