# Crux

**Structured adversarial debate between AI persona agents — built to surface the minimal disagreement structure of any complex topic.**

Crux runs high-fidelity persona agents through a natural group chat. When two agents disagree persistently, a focused sub-dialogue called a **crux room** automatically spawns. The room runs until the agents have diagnosed the root of their disagreement and stated concrete flip conditions. It terminates with a **crux card** — a structured artifact naming the core assumption driving the split, each side's position, and exactly what would change their mind.

The core hypothesis: expert disagreement is almost never "I think X, you think not-X." It's a clash over a prior assumption — a time horizon, an evidential standard, a value weighting — that neither party has made fully explicit. Crux is designed to surface that.

---

## Features

### Dialogue Layer

Personas engage in a natural round-robin group chat on any topic you provide. Each persona is driven by a **contract** — a structured belief state encoding their priors, confidence levels, reasoning style, and stated flip conditions, generated from their actual public writing. Conversations flow organically without a moderator or forced turn structure.

### Disagreement Detection

Every few messages, a lightweight Haiku call scans a 10-message rolling window for substantive disagreements. Detection is conservative — a disagreement must satisfy all of:

- Two personas taking **clearly opposing positions** on the same specific claim
- At least 2 back-and-forth exchanges on that topic (not passing comments)
- Both personas **committed** to a position (not just asking questions)
- Confidence ≥ 0.8
- Detected in **2 consecutive windows** (~6 messages on the same pair)

A `CandidateRegistry` tracks disagreement candidates over time with decay: candidates that aren't re-detected in consecutive windows lose score and don't spawn a room. A 5-minute cooldown prevents the same pair from re-entering a room immediately after one closes.

### Crux Rooms

When a disagreement clears the spawn threshold, a crux room opens for that pair. The room runs as a focused bilateral exchange:

1. Each persona opens with a 2–3 sentence position statement
2. Free alternating exchange — each turn responds directly to the opponent's last argument
3. An exit check fires every 2 full exchanges (from turn 3 onward) evaluating whether the crux has been surfaced
4. Room closes when the exit check confirms the crux is identified, or after a 20-turn safety cap

There is no forced moderator, no scripted phases — the crux must emerge from the argument itself.

### Crux Cards

When a room closes, a final extraction pass over the full transcript produces a **crux card** containing:

- **Crux statement** — the single assumption driving the split, rewritten for precision
- **Disagreement type** — one of: `claim` · `premise` · `evidence` · `values` · `horizon` · `definition`
- **Diagnosis** — plain-language explanation of why the disagreement exists and what kind it is
- **Per-persona data** — for each participant: position (YES / NO / NUANCED), their core reasoning, and an explicit **falsifier** (the specific evidence or condition that would flip their view)
- **Resolved / unresolved** — whether the exchange reached agreement

Cards are displayed as playing cards in a scrollable strip below the main chat and persist for the session.

### Alignment Polygon

A live SVG visualization in the sidebar maps all personas at polygon vertices with edges between every pair. Edges update in real time:

- **Red glowing line** — active crux room between that pair
- **Dashed muted line** — completed crux room (resolved or not)
- **Speaker pulse ring** — highlights the persona who last spoke in main chat
- **Faint background polygon** — always-on baseline connecting all vertices

### Debate Results Panel

When the debate ends, a results summary renders inline with:

| Metric | Description |
|---|---|
| **Resolution %** | Share of crux cards marked resolved, with progress bar |
| **Most Active** | Persona with the highest message count |
| **Root Cause** | Dominant disagreement type across all crux cards |
| **Deepest Clash** | The crux room with the most exchanges |

### Benchmark Metrics

Post-debate, Crux surfaces quantitative metrics from the evaluation suite described in the whitepaper:

- **H — Disagreement Entropy**: `−Σ p_i · ln(p_i)` over the distribution of disagreement types. Lower = debate converged onto fewer fundamental axes. Higher = disagreements are scattered across many types.
- **CCR — Crux Compression Rate**: `resolved / total cruxes`. Target ≥ 50%.
- **IQS** and **CRR** are shown as placeholders — they require expert raters or multi-session data respectively.

### Position Matrix

A table showing each persona's position (YES / NO / NUANCED) across all crux cards from the session — a quick read on who stands where on every surfaced crux.

### Fault Lines Summary

A compact list of every completed crux room: the pair that clashed, the classified disagreement type, and resolved/unresolved status.

### Persona Contracts

Every persona is backed by a contract — generated from their public writing via `scripts/build-personas.ts` (X API + Substack RSS + Claude). Contracts encode:

- Core beliefs and stated priors
- Reasoning style and rhetorical tendencies
- Confidence levels on key claims
- Explicit flip conditions (what would change their mind)

Contracts are stored in `data/seed/contracts/` as JSON and loaded at runtime. The database schema exists but is not used at runtime — contracts are always loaded from files.

---

## Quick Start

**Prerequisites**: Node.js, Docker

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
cd crux
npm install

# 3. Set environment variables
cp .env.example .env.local
# Add: ANTHROPIC_API_KEY, DATABASE_URL

# 4. Push DB schema
npm run db:push

# 5. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Go to `/setup` to pick personas and a topic, then `/dialogue` to run a live debate.

---

## Routes

| Route | Description |
|---|---|
| `/` | Lobby |
| `/setup` | Pick a deck, select personas, enter debate topic |
| `/dialogue` | Live debate — chat feed, alignment polygon, crux rooms, crux cards |
| `/cards` | Browse all persona contracts |
| `/cards/[id]` | Individual persona contract detail |
| `/debates` | Archive of historical debates |
| `/debates/[id]` | Replay viewer |

---

## File Structure

```
crux/                                    ← Next.js app (inside faultline/ directory)
├── app/
│   ├── api/dialogue/route.ts            # SSE endpoint — streams all debate events
│   ├── dialogue/page.tsx                # Live debate view
│   ├── setup/page.tsx                   # Persona + topic selection
│   └── cards/                          # Persona browser
│
├── lib/
│   ├── dialogue/
│   │   ├── orchestrator.ts              # Main loop: runDialogue() async generator
│   │   ├── agent.ts                     # Per-persona LLM call (generateMicroTurn)
│   │   ├── disagreement-detector.ts     # Haiku scanning + CandidateRegistry
│   │   └── prompts.ts                   # Natural short-turn chat prompts
│   │
│   ├── crux/
│   │   ├── orchestrator.ts              # runCruxRoom(): free exchange + exit check + card
│   │   ├── steelman.ts                  # Generate + validate steelmans
│   │   ├── diagnosis.ts                 # Root cause classification
│   │   ├── card-generator.ts            # Produces CruxCard from completed room
│   │   └── prompts.ts                   # Crux-specific LLM prompts
│   │
│   ├── personas/loader.ts               # File-based persona + contract loader
│   ├── llm/client.ts                    # Anthropic SDK wrapper (retry, JSON repair)
│   └── hooks/useDialogueStream.ts       # Frontend SSE → React state
│
├── components/
│   ├── dialogue/
│   │   ├── DialogueView.tsx             # Top-level debate UI
│   │   ├── ThreeColumnLayout.tsx        # Chat + sidebar + polygon + results
│   │   └── MessageThread.tsx            # Threaded message display
│   └── crux/
│       ├── PlayingCard.tsx              # Crux card playing card display (expandable)
│       └── CruxRoom.tsx                 # Live crux room message view
│
└── data/seed/
    ├── personas.json                    # Persona list (id, name, handle, picture)
    ├── deck-config.json                 # Deck definitions
    ├── contracts/[Name].json            # PersonaContract per persona
    └── corpus/[Name].json               # Raw scraped text (tweets, essays)
```

---

## SSE Event Stream

`POST /api/dialogue` streams events in order:

```
dialogue_start
dialogue_message          ← one per persona turn in main chat
crux_room_start           ← when disagreement threshold is crossed
crux_message              ← one per turn inside the crux room
crux_card                 ← when a crux room closes
dialogue_end
```

---

## LLM Architecture

All calls go through `lib/llm/client.ts`:

| Model | Used for |
|---|---|
| `claude-sonnet-4-6` | Persona turns, crux room exchanges, card extraction |
| `claude-haiku-4-5` | Disagreement detection, exit checks |

- Auto-retry on 429 / 500 / 529 with exponential backoff
- `completeJSON<T>()` handles markdown fences and JSON truncation repair automatically

---

## Rebuilding Persona Contracts

To regenerate contracts from live data (requires `X_BEARER_TOKEN`):

```bash
cd crux
npm run build-personas
```

Scrapes X/Twitter + Substack RSS for each persona, then runs a Claude pass to generate their contract JSON.

---

## Env Vars

```
ANTHROPIC_API_KEY      # Required
DATABASE_URL           # Postgres with pgvector
X_BEARER_TOKEN         # Optional — only needed for build-personas
```
