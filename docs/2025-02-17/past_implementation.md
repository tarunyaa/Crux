# Faultline — Past Debate Engine Implementations

This document captures every debate engine architecture attempted, including what was built, why it was abandoned or superseded, and what was learned. Organized chronologically.

---

## 1. Blitz / Classical Mode (Original Engine)

**Status**: Implemented, frontend removed. DB schema + archive still live.

### What It Was

The original debate engine. Personas engage in structured, round-based debates on a shared "blackboard" state. Two variants:

**Blitz**: All agents respond to each claim in parallel each round. Fast, but produces parallel monologues rather than dialogue.

**Classical**: Agents score their urgency to speak; the agent with highest urgency gets selected for each turn. Produces sequential turns with intent-tracking.

### Architecture

```
Topic
  → Claim Decomposer (Haiku) — produces 2-4 testable sub-claims
  → Table Assigner — splits personas across "tables" of 3-5
  → Initial Stance Generator (Sonnet, parallel) — each persona states position + confidence
  → Debate Rounds (parallel or sequential):
      Each agent receives: blackboard summary, their past stances, claim text
      Agent produces: stance update (pro/con/uncertain + confidence), argument content
  → Blackboard Merge — crux candidates, dispute tracking, flip condition tracking
  → Final Table — top crux candidates across all tables consolidated
  → Output Generator (Haiku) — structured DebateOutput: cruxes, fault lines, flip conditions, resolution paths
```

**Convergence**: Entropy of stance distribution + confidence-weighted distance between agents. Stops when entropy drops below threshold, divergence detected, or max rounds hit.

### Key Files (all deleted)
- `lib/orchestrator/blitz.ts` — async generator yielding SSE events
- `lib/orchestrator/classical.ts` — sequential turn selection
- `lib/orchestrator/claims.ts` — topic → 2-4 testable claims
- `lib/orchestrator/blackboard.ts` — BlackboardState CRUD, dispute building, LLM summarization
- `lib/orchestrator/convergence.ts` — entropy, confidence distance, crux tracking
- `lib/orchestrator/context.ts` — per-turn context assembly
- `lib/orchestrator/agents.ts` — load contracts, generate initial stances
- `lib/orchestrator/output.ts` — final Haiku pass for structured output
- `lib/llm/prompts.ts` — CLAIM_DECOMPOSITION, AGENT_TURN, BLACKBOARD_SUMMARY, INITIAL_STANCE, FINAL_OUTPUT
- `app/api/debate/route.ts` — POST SSE endpoint

### Problems
- "Debates" were parallel monologues, not conversations. Agents didn't respond to each other, just to the topic.
- Blackboard summaries were lossy — agents lost context across rounds.
- Classical mode's urgency scoring was expensive (Haiku call per round per agent).
- Cruxes were hallucinated by Haiku at the end, not emergent from the debate.
- No actual disagreement surfacing — agents stated positions but didn't clash.

---

## 2. Graph Mode — Dung's Argumentation Semantics

**Status**: Implemented, frontend removed.

### What It Was

A formal argumentation graph engine layered on top of the blitz infrastructure. Replaced free-text debate turns with structured arguments (claim + premises + assumptions + evidence) and typed attack edges. Dung's semantics computed cruxes algorithmically from the graph structure — no Haiku hallucination.

### Architecture

```
Topic
  → Claim Decomposer (reused from blitz)
  → Round 0: Each persona generates 2-4 structured arguments (parallel Sonnet)
  → Attack Rounds (1-3):
      a. Attack generation: each persona generates 0-4 attacks on other's arguments (parallel Sonnet)
         Each attack = a counter-argument node + attack edge
      b. Batch validation: 1 Haiku call validates all attacks for fallacies, relevance, type correctness
      c. Deduplication: pure code
      d. Recompute Dung semantics: buildFramework → groundedExtension → preferredExtensions → labelling
      e. Convergence check: labelling stable OR no new edges OR max rounds
  → Graph output extraction: pure code (no LLM)
      - Common ground = grounded extension
      - Camps = preferred extensions
      - Crux assumptions = symmetric diff of preferred extensions
```

**Dung semantics**:
- **IN** (accepted): argument in grounded extension — unattacked or all attackers defeated
- **OUT** (defeated): attacked by at least one IN argument
- **UNDEC** (undecided): in a mutual attack cycle

### Key Files (all deleted)
- `lib/types/graph.ts` — Argument, Attack, AttackTarget, ValidationResult, DungFramework, Labelling, ArgumentationGraphState, CruxAssumption, GraphDebateOutput
- `lib/argumentation/dung.ts` — pure TS: buildFramework, computeGroundedExtension, computeLabelling, computePreferredExtensions
- `lib/argumentation/graph-state.ts` — state management, immutable updates, recomputeSemantics
- `lib/argumentation/crux-extractor.ts` — symmetric diff → crux assumptions, mapToDebateOutput
- `lib/orchestrator/graph-orchestrator.ts` — runGraph() async generator
- `lib/llm/graph-prompts.ts` — initialArgumentPrompt, attackGenerationPrompt, batchValidationPrompt

### Problems
**Fake consensus bug**: The Argument/Attack model allowed free-floating claims that didn't explicitly attack each other. The crystallizer would extract "reasonable" arguments that should conflict but had no attack edge between them. Dung semantics then labeled all of them IN → reported as "consensus" when it was actually "polarized".

**Example**: A polarized Bitcoin debate between Saylor (determinism) and Hayes (probabilism) reported:
```
"Consensus: 3 of 8 arguments in common ground"
```
Inspecting the grounded extension: arg-2 ("Bitcoin adoption is deterministic"), arg-7 ("Bitcoin success is contingent on policy mistakes") — these are contradictory, not common ground.

**Other problems**:
- Structured argument format felt unnatural. Personas were generating academic argument forms, not their actual voice.
- Attack typing (rebut/undermine/undercut) added complexity without improving output quality.
- Graph grew monotonically (only added nodes/edges, never pruned). By round 3, graph was dense and hard to interpret.

### Planned Fix: Dispute-Centric Graph (DCG)

Designed but never implemented. The key insight: replace Argument/Attack with a structure that enforces one rule — every formal claim must attach to an explicit binary dispute.

```
Dispute (binary question: "Is X true?")
  → Stance (YES/NO per speaker)
    → Reason (supports/attacks the stance)
```

**Invariants**:
1. Every Stance must reference an existing Dispute
2. Every Reason must reference an existing Stance
3. A Dispute only exists if ≥1 YES stance and ≥1 NO stance (real divergence required)
4. No free-floating claims allowed

This structurally prevents fake consensus: contradictory stances on the same dispute → crux, not common ground.

**Files planned** (never created):
- `lib/types/dispute-graph.ts`
- `lib/dispute/dcg-state.ts`
- `lib/dispute/dcg-crystallizer.ts`
- `lib/dispute/dcg-analysis.ts`

---

## 3. Debate Engine v2 — Dialogue + Crystallization

**Status**: Implemented. Backend + CLI deleted. Frontend removed.

### What It Was

The insight driving v2: most dialogue turns don't create formal argument nodes. The graph should be sparse and meaningful — crystallized positions, not individual utterances.

**Three components**:
1. **Dialogue layer** — short natural exchanges (2-4 sentences), tagged with move types: CLAIM, CHALLENGE, CLARIFY, CONCEDE, REFRAME, PROPOSE_CRUX. No formal argument structure.
2. **Crystallizer** — periodic LLM call (Sonnet) that reads a cluster of recent turns and extracts formal graph mutations. Runs every 4-6 turns, not every turn.
3. **Argument graph** — sparse Dung framework. Only crystallized positions enter. Graph **shrinks** via concessions (nodes removed when agents concede).

### Phase Structure

- **Phase 1** (Opening): Each agent states position (4-6 sentences). Initial crystallization. No steering.
- **Phase 2** (Free Exchange): Short back-and-forth. Light steering. Crystallization every 4-6 turns.
- **Phase 3** (Crux Seeking): Controller steers toward crux identification. Agents produce PROPOSE_CRUX moves.
- **Phase 4** (Resolution): Each agent summarizes agreements, remaining disagreements, core question.

### Convergence Signals
- Graph shrinking (concessions happening)
- Crux proposed by agent
- Contested frontier stable across 3+ crystallizations
- Dialogue repetition (word overlap detection)

### Expected Output Shape
- After 24 dialogue turns: ~4-8 arguments, ~6-12 attacks
- Regime: consensus (1 preferred ext, large grounded) | polarized (multiple preferred ext, small grounded) | partial
- Concession trail: ordered list of what was conceded, when, and graph effect

### Key Files (all deleted)
- `lib/types/debate-engine.ts` — DialogueMove, DialogueTurn, CrystallizationResult, Concession, ControllerState, DebatePhase, DebateEngineConfig, DebateEngineOutput, DebateEvent
- `lib/debate/engine.ts` — 4-phase async generator
- `lib/debate/controller.ts` — moderator: turn-taking, steering hints, phase transitions, crystallization triggers
- `lib/debate/crystallizer.ts` — crystallization LLM call + graph mutation logic
- `lib/debate/prompts.ts` — openingStatementPrompt, dialogueTurnPrompt, crystallizationPrompt, centralizedDiscoveryPrompt, resolutionPrompt
- `lib/debate/convergence.ts` — graph stability + crux proposal convergence
- `scripts/run-debate.ts` — CLI entry point (--topic, --personas, --max-turns)
- `app/api/debate-v2/route.ts` — SSE endpoint
- `app/debate-v2/page.tsx` — server component

### Problems Encountered

**Fake consensus** (inherited from graph mode): The crystallizer could extract args that should conflict but didn't have attack edges → same Dung semantics bug. Required DCG fix (planned but not implemented before system was abandoned).

**Concession reluctance**: LLM personas were stubborn and rarely conceded. "You can and should concede" in the prompt helped but wasn't reliable.

**Circling detection**: Word-overlap heuristic for detecting repeated arguments was crude. Embedding similarity would work better.

**Phase transitions**: Heuristic triggers (turn count thresholds, repetition detection) needed per-topic tuning.

**SSE parsing bug** (fixed): Parser was trying to match both `event:` and `data:` on a single line, but SSE format is multi-line blocks. Fixed by splitting event blocks on `\n` before pattern matching.

---

## 4. Multi-Agent Async Architecture (DEPRECATED, Never Implemented)

**Status**: Designed as a plan, never built. Deprecated in favor of Feb 14 dialogue system.

### What It Was

An ambitious async, event-driven architecture for 3-12 agents engaging in parallel dialogues. Key ideas:

- **Message bus**: All messages published to a shared bus, tagged with thread/topic
- **Attention scorer**: Each agent scores incoming messages for relevance (semantic similarity + @mentions + thread participation)
- **Thread manager**: Spawn new threads when divergence detected, track convergence per thread
- **Agenda manager**: Track 1-2 active disputes, boost attention to hot disputes
- **Hierarchical crystallizer**: Thread-level → cross-thread → global crux graph

### Why It Wasn't Built

Identified as too complex for the value it would deliver. The Feb 14 plan (dialogue + crux rooms) achieved the same goals (emergent disagreement, focused crux exploration) with far simpler machinery.

---

## 5. Dialogue + Crux Room System (Feb 14, 2025)

**Status**: Implemented and currently deployed at `/dialogue`.

### Concept

Think Discord/Slack with AI personas:
- **Main Channel** (Dialogue Layer): Group chat where all personas talk naturally (1-2 sentences each)
- **Crux Threads** (Crux Layer): Private rooms that spawn when disagreements detected
- **Crux Cards**: Insights from crux rooms posted back to main channel

### Architecture

```
Dialogue Orchestrator
  → Round-robin dialogue loop
  → Disagreement Detector (runs every 3 messages)
    → If disagreement detected: Spawn Crux Room
  → Crux Room Orchestrator (5 phases):
      1. Steelman — each persona accurately represents the other's position
      2. Validation — opponent confirms the steelman
      3. Diagnosis — LLM identifies root cause type (horizon/evidence/values/definition/claim/premise)
      4. Falsifiers — what would change each persona's mind
      5. Resolution — attempt resolution, or acknowledge irreducibility
      → Card Generator — creates CruxCard from completed room
  → Forward crux card back to main channel
```

### Disagreement Detection

LLM-based (Haiku). Detects:
- Direct opposition ("I disagree", "No, actually...")
- Claim contradiction (A says X, B says not-X)
- Repeated engagement (same 2-3 personas keep exchanging on same topic)

Spawn criteria: ≥2 personas, confidence > 0.7

**Current limitation**: Runs every 3 messages on a 6-message sliding window. No persistence tracking — same disagreement can spawn multiple rooms. No dedup by persona pair + topic.

### Crux Card Format

```typescript
interface CruxCard {
  id: string
  question: string                       // "Is Bitcoin a risk asset or hedge?"
  personas: {
    [personaId: string]: {
      position: 'YES' | 'NO' | 'NUANCED'
      reasoning: string
      falsifier?: string
    }
  }
  disagreementType: 'horizon' | 'evidence' | 'values' | 'definition' | 'claim' | 'premise'
  diagnosis: string
  resolved: boolean
  resolution?: string
}
```

### Key Files (current codebase)
- `lib/dialogue/types.ts` — DialogueMessage, DialogueState, DialogueEvent
- `lib/dialogue/prompts.ts` — natural 1-2 sentence chat prompts
- `lib/dialogue/agent.ts` — persona response generation with skip capability
- `lib/dialogue/orchestrator.ts` — round-robin loop with disagreement detection
- `lib/dialogue/disagreement-detector.ts` — LLM-based detection
- `lib/crux/types.ts` — CruxRoom, CruxMessage, CruxCard, CruxEvent
- `lib/crux/prompts.ts` — steelman, validation, diagnosis, falsifier, resolution prompts
- `lib/crux/steelman.ts` — generate steelman, validate, extract positions
- `lib/crux/diagnosis.ts` — root cause analysis
- `lib/crux/card-generator.ts` — generate crux cards from completed rooms
- `lib/crux/orchestrator.ts` — 5-phase crux room flow
- `app/api/dialogue/route.ts` — SSE endpoint
- `app/dialogue/page.tsx` — dialogue page
- `components/dialogue/DialogueView.tsx`, `MessageThread.tsx`, `ThreeColumnLayout.tsx`
- `components/crux/CruxCard.tsx`, `CruxRoom.tsx`, `PlayingCard.tsx`
- `lib/hooks/useDialogueStream.ts`

### Known Problems

**Crux room is a pipeline, not a conversation**: The 5-phase flow generates monologues in sequence. Personas don't actually talk to each other inside the crux room — each phase is an isolated LLM call. There's a `cruxArgumentPrompt()` written in `lib/crux/prompts.ts` with combative back-and-forth dialogue that was never called anywhere.

**Dialogue tone**: 120-character hard cap on messages makes personas sound curt and generic. Michael Saylor doesn't sound like Michael Saylor — he sounds like a compressed LLM answer.

**Aesthetic**: Dialogue/crux components use gray/blue Tailwind classes instead of the project's CSS vars (bg-card-bg, text-accent, border-card-border). Crux cards use purple gradient that violates the black/red/white mandate.

**Crux room is a black box**: The steelman, diagnosis, and falsifier phases happen invisibly. Users see "crux room spawned" then eventually a card appears. The most interesting intellectual work is hidden.

**No app integration**: Lives at /dialogue with hardcoded route. Not reachable from normal setup flow (was integrated via SetupClient mode button).

---

## 6. Feb 17 Quality Pass Plan (Planned, Not Implemented)

**Status**: Designed and documented, not built before cleanup.

### Six Areas

**Area 1: Dialogue Naturalness**

Voice quality improvements:
- Speech pattern encoding (not just personality traits): "You speak in declarative statements, never hedge" > "You believe Bitcoin is good"
- Few-shot voice examples in system prompt (Character.AI technique): show how the persona responds to specific situations
- Forbidden phrases list: "That's a great point", "I understand your perspective", passive voice, hedging
- No hard length cap — context-sensitive: opening (3-5 sentences), direct reply (2-3), dismissal (1), key argument (4-6)
- Per-persona rhetorical fingerprints: Saylor (declarative → dismissal), Hayes (cynical observation + rhetorical question), Schiff (classical economics + precedent)
- Real corpus grounding: include 5-10 representative quotes from each persona's actual writing/tweets verbatim in system prompt
- Add `voice.json` per persona with speechPatterns, vocabulary, forbiddenPhrases, realQuotes, voiceExamples

**Area 2: Crux Room Visibility**

Stream crux room messages in real-time to frontend. IDE-style bottom drawer:
- Collapsed by default (tab bar at bottom)
- Each active crux room = one tab with pulsing dot
- Click tab → panel slides up ~40% viewport
- Shows live crux room conversation as it streams
- When complete → tab shows card suit icon, stays accessible

**Area 3: App Integration**

Wire dialogue mode into normal deck → hand → topic setup flow. Route to `/dialogue?personas=...&topic=...` instead of `/match`.

**Area 4: Aesthetic Overhaul**

Replace gray/blue classes with CSS vars throughout all dialogue/crux components. New crux card design: black background, red accent border, white text, suit symbol in corners (actual playing card aesthetic). Two-column layout (70% chat + 30% crux card sidebar) + bottom drawer for crux rooms.

**Area 5: Crux Room Redesign — Personas Diagnose Themselves**

Replace the 5-phase pipeline with a conversation loop:
1. Entry statements (each persona states position, 1-3 sentences)
2. Free exchange (alternate turns, respond to what other just said, no phases)
3. Exit check after each exchange: Haiku call — "Has the crux been surfaced?" Returns yes/no
4. Safety cap: max 20 turns
5. Card extraction: one final Sonnet call reads full conversation, extracts crux statement, positions, disagreement type, falsifiers

Delete `steelman.ts` and `diagnosis.ts` — their logic is replaced by the conversation itself. Personas diagnose themselves through argument.

**Area 6: Crux Room Triggering — Staged Commitment Model**

Replace the immediate-spawn detector with a two-stage model:

Stage 1 — Track candidates: every 3 messages, run detection and record `DisagreementCandidate` with `seenCount`. No immediate spawning.

Stage 2 — Spawn gate: only spawn when candidate passes ALL of:
- `seenCount` ≥ 3 consecutive windows (9+ messages on same topic)
- `confidence` ≥ 0.8 (raised from 0.7)
- No existing room for this persona pair (dedup)
- Cooldown ≥ 5 minutes since last room for this pair

This prevents one-off quibbles from spawning rooms and prevents multiple rooms on the same argument.

---

## Persona Engineering Notes

### Contract Format (current, working)

Each persona has a `PersonaContract` at `data/seed/contracts/[Name].json`:

```typescript
interface PersonaContract {
  personaId: string
  version: string             // ISO timestamp of corpus build
  personality: string         // Who they are, their worldview
  bias: string                // Blind spots, motivated reasoning
  stakes: string              // What they have to gain/lose
  epistemology: string        // How they evaluate evidence and form beliefs
  timeHorizon: string         // Short-term vs long-term framing
  flipConditions: string      // What evidence would change their position
  evidencePolicy: EvidencePolicy
  anchorExcerpts: AnchorExcerpt[]   // Actual quotes from their real corpus
}
```

Built by `scripts/build-personas.ts` using:
- X API scraping for tweets
- Substack RSS for essays
- Claude Sonnet to synthesize into contract format

### Prompt Engineering Problems

The current dialogue prompts in `lib/dialogue/prompts.ts` produce generic AI-sounding output despite the contract. Key identified failure modes:

1. **Personality traits ≠ speech patterns**: "You are contrarian and data-driven" doesn't tell the model *how* to speak. Speech pattern encoding ("You speak in declarative statements, never hedge. When challenged, you zoom out rather than defend.") is far more effective.

2. **No forbidden phrases**: Without explicit blocking, LLMs drift toward AI politeness: "That's a great point", "I can see where you're coming from", "It depends". These phrases never appear in the real persona's output.

3. **Missing real corpus in voice prompt**: The corpus scraping exists but gets embedded for retrieval, not included verbatim in system prompts. Few-shot voice examples from real text dramatically improve persona fidelity.

4. **No turn-type guidance**: The model doesn't know whether this should be an opening statement, a dismissal, or a substantive reply. Different registers warrant different lengths and tones.

---

## What Stays in the Codebase

After cleanup, what remains:

### Personas (unchanged)
- `data/seed/personas.json` — persona definitions
- `data/seed/contracts/` — personality contracts (24 personas)
- `data/seed/corpus/` — raw corpus text embeddings
- `lib/personas/loader.ts` — file-based loader
- `scripts/build-personas.ts` — automated persona builder
- `lib/llm/client.ts` — Anthropic SDK wrapper

### Dialogue + Crux System (active)
- `lib/dialogue/` — dialogue orchestrator, agents, prompts, detector
- `lib/crux/` — crux room orchestrator, steelman, diagnosis, card generator
- `app/api/dialogue/route.ts` — SSE endpoint
- `app/dialogue/` — dialogue UI
- `components/dialogue/` — MessageThread, DialogueView, ThreeColumnLayout
- `components/crux/` — CruxCard, CruxRoom, PlayingCard
- `lib/hooks/useDialogueStream.ts`

### Debate Archive (read-only, for historical debates)
- `app/debates/` — debate archive list + detail pages
- `app/cards/` — deck/persona browser
- `components/DebateReplay.tsx` — replay viewer for archived blitz/graph debates
- `components/AgentPolygon.tsx` — agent dynamics visualization (used by DebateReplay)
- `lib/hooks/hydrateDebateState.ts` — deserialize stored SSE events into UI state
- `lib/types/graph.ts` — graph types (used by hydrateDebateState)
- `lib/db/debates.ts` — DB queries for debate archive

### Infrastructure
- `lib/db/` — Drizzle ORM schema, client, queries
- `docker-compose.yml` — Postgres + pgvector
