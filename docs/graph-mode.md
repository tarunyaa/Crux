# Argumentation Graph with Dung's Semantics

## Context

The existing debate orchestrator uses a blackboard model where LLMs produce free-text responses, entropy heuristics detect convergence, and a final Haiku pass extracts cruxes/faultlines. Graph mode replaces the core with a formal argumentation graph: structured arguments, typed attacks, validated edges, and algorithmically computed cruxes from Dung's preferred extensions. The existing blitz/classical modes remain untouched — this is a new `graph` mode.

## Architecture Overview

```
Topic
  │
  ▼
decomposeClaims()        ← reused from blitz
  │
  ▼
initializeAgents()       ← reused from blitz
  │
  ▼
Round 0: Initial Arguments (parallel Sonnet calls)
  │   Each persona generates 2-4 structured arguments
  │   (claim + premises + assumptions + evidence)
  │
  ▼
┌─────────────────────────────────────┐
│  Attack Rounds (1-3)                │
│                                     │
│  1. Attack generation (1 Sonnet/    │
│     persona, parallel)              │
│     - Each attack creates a         │
│       counter-argument node +       │
│       attack edge                   │
│                                     │
│  2. Batch validation (1 Haiku call) │
│     - Checks: no fallacy, relevant, │
│       correct attack type           │
│                                     │
│  3. Deduplication (pure code)       │
│                                     │
│  4. Recompute Dung semantics        │
│     (pure code)                     │
│     - buildFramework()              │
│     - computeGroundedExtension()    │
│     - computePreferredExtensions()  │
│     - computeLabelling()            │
│                                     │
│  5. Convergence check:              │
│     labelling stable OR no new      │
│     edges OR max rounds             │
└─────────────────────────────────────┘
  │
  ▼
extractGraphOutput()     ← pure code, no LLM
mapToDebateOutput()      ← backward compat mapping
```

## New Files

| File | Purpose |
|------|---------|
| `lib/types/graph.ts` | Argument, Attack, AttackTarget, ValidationResult, DungFramework, Labelling, ArgumentationGraphState, CruxAssumption, GraphDebateOutput |
| `lib/argumentation/dung.ts` | Pure TS: buildFramework, computeGroundedExtension, computeLabelling, computePreferredExtensions |
| `lib/argumentation/graph-state.ts` | createGraphState, addArguments, addAttacks, deduplicateAttacks, recomputeSemantics |
| `lib/argumentation/crux-extractor.ts` | extractGraphOutput (symmetric diff of preferred extensions → crux assumptions), mapToDebateOutput |
| `lib/orchestrator/graph-orchestrator.ts` | async generator `runGraph()` — the main pipeline |
| `lib/llm/graph-prompts.ts` | initialArgumentPrompt, attackGenerationPrompt, batchValidationPrompt |

## Modified Files

| File | Change |
|------|--------|
| `lib/types/index.ts` | Added `'graph'` to DebateMode, 5 new SSE event variants |
| `app/api/debate/route.ts` | Routes `mode === 'graph'` to `runGraph()` |
| `lib/hooks/useDebateStream.ts` | Handles new SSE events, adds `graph` state field |
| `lib/hooks/hydrateDebateState.ts` | Same new event cases for replay hydration |
| `components/MatchClient.tsx` | Graph sidebar panel (IN/OUT/UNDEC counts, camps, attack log) |
| `components/DebateReplay.tsx` | Graph results view (common ground, camps, crux assumptions) |
| `components/SetupClient.tsx` | Added 'Graph' as third mode option |

## Untouched Files

`lib/llm/client.ts`, `lib/personas/loader.ts`, `lib/orchestrator/agents.ts`, `lib/orchestrator/claims.ts`, `lib/orchestrator/blitz.ts`, `lib/orchestrator/classical.ts`

---

## Phase 1: Types

### `lib/types/graph.ts`

Core graph node and edge types:

```
Argument { id, speakerId, claim, premises[], assumptions[], evidence[], round }
Attack { id, fromArgId, toArgId, type: rebut|undermine|undercut, target: AttackTarget, counterProposition, rationale, evidence[], confidence, speakerId, round }
AttackTarget { argId, component: claim|premise|assumption, index }
ValidationResult { attackId, valid, attackStrength, corrections }
DungFramework { arguments: Set<string>, attacks: Map<argId, Set<targetId>>, attackedBy: Map<targetId, Set<attackerIds>> }
Labelling { labels: Map<argId, IN|OUT|UNDEC> }
ArgumentationGraphState { topic, arguments[], attacks[], validationResults[], groundedExtension: Set, preferredExtensions: Set[], labelling, round }
CruxAssumption { assumption, dependentArgIds[], centrality, settlingQuestion }
GraphDebateOutput { commonGround: Argument[], camps[], cruxAssumptions[], symmetricDifference: Argument[] }
```

### `lib/types/index.ts` changes

- `DebateMode = 'blitz' | 'classical' | 'graph'`
- 5 new SSE events: `arguments_submitted`, `attacks_generated`, `validation_complete`, `graph_update`, `graph_convergence`

---

## Phase 2: Dung Engine

### `lib/argumentation/dung.ts`

Pure TypeScript, zero LLM dependencies.

**`buildFramework(arguments, attacks, validationResults) → DungFramework`**
- Filters to validated attacks only
- Builds forward (attacks) and reverse (attackedBy) adjacency maps

**`computeGroundedExtension(fw) → Set<string>`**
- Iterative fixed-point: start with unattacked args (IN), mark their targets OUT, repeat until stable

**`computeLabelling(fw) → Labelling`**
- Same fixed-point as grounded, but returns full IN/OUT/UNDEC map

**`computePreferredExtensions(fw) → Set<string>[]`**
- Optimized: compute grounded first, then backtrack over UNDEC args only
- UNDEC args are typically few (only those in mutual attack cycles)
- Finds maximal admissible supersets of the grounded extension
- Capped at 2^16 subsets to prevent explosion

---

## Phase 3: Prompts

### `lib/llm/graph-prompts.ts`

**`initialArgumentPrompt(topic, claims, anchorExcerpts)`**
- Persona submits 2-4 structured arguments (claim + premises + assumptions + evidence)
- Memory-augmented: includes anchorExcerpts from PersonaContract so agents reference their own prior statements
- Returns JSON array

**`attackGenerationPrompt(allArguments, ownArgIds, topic, labelling)`**
- Combined router + attack gen (one call per persona)
- Shows all arguments with their IN/OUT/UNDEC labels so persona can target strategically
- ID-based targeting: `toArgId` + `targetComponent` + `targetIndex` (no quote matching)
- Returns 0-4 attacks per persona
- Rule: cannot attack own arguments
- Each attack also includes a counter-argument node

**`batchValidationPrompt(attacks, arguments)`**
- Single call validates ALL attacks in a round
- Checks: no fallacy, relevant, correct attack type, target exists
- Returns per-attack: valid, attackStrength, corrections
- Uses Haiku (cheap, extraction task)

---

## Phase 4: Graph State Management

### `lib/argumentation/graph-state.ts`

**`createGraphState(topic) → ArgumentationGraphState`** — empty initial state

**`addArguments(state, args) → state`** — append arguments, immutable

**`addAttacks(state, attacks, validations) → state`** — append validated attacks

**`deduplicateAttacks(attacks) → attacks`** — same toArgId + same target component+index + same type → keep highest confidence

**`recomputeSemantics(state) → state`** — calls buildFramework → computeGrounded → computePreferred → computeLabelling, updates state

---

## Phase 5: Crux Extraction

### `lib/argumentation/crux-extractor.ts`

**`extractGraphOutput(state) → GraphDebateOutput`**
1. Common ground = arguments in grounded extension
2. Camps = arguments in each preferred extension
3. Symmetric difference of top 2 preferred extensions
4. For each disputed argument, collect its `assumptions`
5. Rank assumptions by: (a) count of dependent disputed args, (b) graph centrality (attack degree)
6. Return top 3 as CruxAssumptions with settling questions

**`mapToDebateOutput(graphOutput, state, personaIds) → DebateOutput`**
- Maps cruxAssumptions → `cruxes[]`
- Maps camps → `faultLines[]`
- Maps per-persona evidence → `evidenceLedger[]`
- Maps settling questions → `resolutionPaths[]`
- Maps defeated args → `flipConditions[]`
- Pure code, no LLM call needed (unlike current `extractOutput`)

---

## Phase 6: Graph Orchestrator

### `lib/orchestrator/graph-orchestrator.ts`

Pipeline (async generator yielding SSE events):

```
1. Decompose topic → claims (reuse existing decomposeClaims)
2. Initialize agents (reuse existing initializeAgents)
3. Round 0: Each persona generates 2-4 structured arguments (parallel Sonnet calls)
   - Each attack also creates a counter-argument node in the graph
   - Emit: arguments_submitted + initial_stance (backward compat)
4. For rounds 1-3:
   a. Attack generation: 1 Sonnet call per persona (parallel)
      - Each attack creates a new counter-argument node + attack edge
      - Emit: attacks_generated
   b. Batch validation: 1 Haiku call total
      - Emit: validation_complete
   c. Deduplication (pure code)
   d. Recompute Dung semantics (pure code)
      - Emit: graph_update
   e. Backward compat: emit agent_turn for each validated attack (populates message feed)
   f. Convergence check: labelling stable OR no new edges OR max rounds
      - Emit: graph_convergence + convergence_update (backward compat)
   g. Break if converged
5. Extract output from graph (pure code, no LLM)
   - Emit: debate_complete
```

**Backward compatibility events emitted:**
- `debate_start`, `table_assigned`, `status` — unchanged
- `initial_stance` — derived from initial arguments
- `agent_turn` — one per validated attack, content = counter-proposition + attack type badge
- `convergence_update` — mapped from graph convergence state
- `blackboard_update` — text summary of graph state
- `debate_complete` — DebateOutput from mapToDebateOutput

---

## Phase 7: Frontend Updates

### `useDebateStream.ts` + `hydrateDebateState.ts`
- Added cases for 5 new SSE events in processEvent switch
- Stores graph-specific state (labelling, arguments, attacks) in new optional `graph` field
- Existing events continue to work — message feed, convergence sidebar already populated

### `MatchClient.tsx`
- When `mode === 'graph'`: shows graph sidebar panel instead of crux/flip panels
  - IN/OUT/UNDEC argument counts
  - Preferred extension count (number of "camps")
  - Attack log (latest attacks with type badges and validation status)
- Message feed works via backward-compat `agent_turn` events

### `DebateReplay.tsx`
- When `mode === 'graph'`: shows graph-specific results
  - "Common Ground" section: grounded extension arguments with IN labels
  - "Camps" section: preferred extension count
  - "Crux Assumptions" label replaces "Key Cruxes" with graph-specific description
  - Existing cruxes/faultLines/resolutionPaths still rendered (populated by mapToDebateOutput)

### `SetupClient.tsx`
- Added 'Graph' as third mode option alongside Blitz/Classical (3-column grid)

---

## Phase 8: API Route

### `app/api/debate/route.ts`
- Accepts `mode === 'graph'` in validation
- Routes to `runGraph()` generator
- Everything else (SSE streaming, save logic) unchanged

---

## LLM Call Budget (4 personas, 3 rounds)

| Step | Calls | Model |
|------|-------|-------|
| Claim decomposition | 1 | Haiku |
| Initial arguments | 4 | Sonnet |
| Round 1: attacks | 4 | Sonnet |
| Round 1: validation | 1 | Haiku |
| Round 2: attacks | 4 | Sonnet |
| Round 2: validation | 1 | Haiku |
| Round 3: attacks | 4 | Sonnet |
| Round 3: validation | 1 | Haiku |
| **Total** | **20** | |

Current blitz: 26-31 calls. Graph mode uses fewer calls, no final extraction LLM call (pure computation), and cruxes are computed not hallucinated.

---

## Key Design Decisions

1. **Cruxes from graph structure, not LLM hallucination**: The symmetric difference between preferred extensions identifies exactly which arguments are genuinely disputed. Their underlying assumptions are the true cruxes.

2. **Backward compatibility**: Graph mode emits all legacy SSE events (`initial_stance`, `agent_turn`, `convergence_update`, etc.) so the existing message feed and result rendering work without changes.

3. **Attack = counter-argument + edge**: Every attack in the graph also creates a new argument node. This means the graph grows with both sides of every dispute, and Dung's semantics can properly evaluate the full attack/defense structure.

4. **Batch validation**: Instead of validating attacks one-by-one, a single Haiku call validates all attacks per round. This is cheaper and ensures consistent validation criteria.

5. **Preferred extension enumeration is bounded**: The backtracking over UNDEC args is capped at 2^16 subsets. In practice, UNDEC args are few (only those in mutual attack cycles), so this is rarely hit.

---

## Verification Checklist

1. **Unit test Dung engine**: empty graph, single arg, chain A→B, cycle A↔B, odd cycle A→B→C→A, Nixon diamond
2. **Unit test crux extractor**: symmetric diff computation, assumption ranking, DebateOutput mapping
3. **Integration test**: run `runGraph` with 2 personas, verify all required SSE events emitted in correct order
4. **Manual test**: run graph debate in browser, verify message feed populates, sidebar updates, results render
5. **Compare**: run same topic in blitz vs graph, compare crux quality
