# Belief Graph Pipeline: Step-by-Step Analysis

**Date:** 2026-03-01
**Status:** Corpus grounding implemented, extraction verified for Citrini + Citadel

---

## 0. Current State

The first experiment run exposed two problems. Both have been addressed:

1. **~~Base scores are LLM-hallucinated.~~** ~~Solved partially.~~ Base scores are still LLM-assigned plausibility ratings (Haiku), but the LLM now sees the actual corpus text when making claims, so the arguments it scores are grounded in real writing. Full evidence-density scoring (section 4.4) remains a future improvement.

2. **~~Arguments are not corpus-derived.~~** **Fixed.** `extractQBAF()` now loads the persona's corpus, filters it by topic relevance (Haiku call), and injects a `## Source Material` block with real corpus entry IDs into every generation prompt. The LLM is instructed to cite only those IDs in its `grounding` field.

### Verification Results

Extraction run with topic "Will AI cause net job losses in the next decade?":

**Citrini** (120 corpus entries, ~15 filtered by topic):
- 10 nodes, 9 edges, root σ = 0.763
- All grounding arrays contain real corpus IDs: `tweet-2025653614430023864`, `substack-0`, `substack-17`, etc.
- Root claim derived from the 2028 GIC article (`substack-0`)

**Citadel** (8 corpus entries, all passed filtering since under threshold):
- 10 nodes, 9 edges, root σ = 0.424
- All grounding arrays contain real corpus IDs: `article-citadel-2026-global-intelligence-crisis`, `article-citadel-compute-constraints`, etc.
- IDs verified against actual `data/seed/corpus/Citadel.json` entries

---

## 1. What We Have: The Data Layer

### 1.1 Corpus Files

```
data/seed/corpus/Citrini.json    — 120 entries (tweets + Substack articles)
data/seed/corpus/Citadel.json    — 8 entries (article chunks from one Citadel Securities paper)
```

Each entry:
```typescript
{
  id: string                    // "tweet-2027468973088854448" or "article-citadel-..."
  content: string               // actual text (tweet body or article excerpt)
  source: string                // URL
  date: string                  // ISO timestamp
  platform: 'twitter' | 'substack'
  metrics?: { likes, retweets, replies }  // Twitter only
}
```

**Key observation:** Citrini has ~100+ substantive tweets + full articles. Citadel has 8 chunks from a single long-form paper. The pipeline handles both — small corpora skip filtering entirely (threshold: 15 entries).

### 1.2 Persona Contracts

```
data/seed/contracts/Citrini.json
data/seed/contracts/Citadel.json
```

Each contract has:
- `personality` — who they are
- `bias` — their known biases
- `stakes` — what they care about
- `epistemology` — how they evaluate evidence
- `flipConditions` — what would change their mind
- `anchorExcerpts` — 5-10 direct quotes from their writing
- `evidencePolicy` — what sources they accept/reject

**Key observation:** The contract is used as the system prompt (`buildConsolidatedPrompt`) for all extraction calls. This ensures the LLM generates arguments in-character, informed by the persona's stated worldview.

### 1.3 Existing Belief Extraction (`scripts/extract-beliefs.ts`)

A separate pipeline that produces `BeliefGraph` (not QBAF) from raw corpus:
1. Loads corpus → chunks into 1100-char segments
2. Haiku extracts causal triples: `{cause, effect, polarity, confidence, type}`
3. Deduplicates by normalizing cause/effect
4. Writes to `data/seed/beliefs/{Name}.json`

**Output type (BeliefGraph):**
```typescript
BeliefNode { id, concept, type, grounding[] }
BeliefEdge { from, to, polarity: 1|-1, confidence, sourceChunks[] }
```

This is a flat causal graph (not a tree). The QBAF system uses a different extraction path — see section 3.

### 1.4 Types

```typescript
// lib/types/index.ts
interface CorpusExcerpt {
  id: string
  content: string
  source: string
  date?: string
  platform: 'twitter' | 'substack'
}
```

Loaded by `loadCorpus(personaId)` in `lib/personas/loader.ts`. Returns `CorpusExcerpt[]`, empty array if file doesn't exist.

---

## 2. Papers Informing the Design

### What ARGORA Does (arXiv:2601.21533)

ARGORA is a multi-expert debate system:

1. **Expert QBAFs are pre-constructed** — each expert has a QBAF representing their position. Nodes are claims with base scores (τ). Edges are attack/support relationships.

2. **Counterfactual edge impact** — crux identification. For each edge in the merged graph, compute: "if this edge were removed, how much would each expert's root strength change?" Edges where the impact diverges are cruxes.

3. **Community graph** — merge individual QBAFs via semantic dedup, annotate nodes with per-expert scores, classify into consensus/crux/neutral.

**What ARGORA does NOT specify:** How to *build* the individual QBAFs from data. We use corpus-grounded extraction (section 3).

### What ArgLLMs Does (arXiv:2405.02079)

ArgLLMs is the QBAF generation paper:

1. **Γ stage (generation):** LLM generates arguments for/against a topic as a tree (root → pro/con at depth 1 → sub-arguments at depth 2). Width and depth are configurable.

2. **ℰ stage (evaluation):** LLM assigns base scores τ ∈ [0,1] to each node.

3. **DF-QuAD:** Bottom-up computation of dialectical strengths σ from base scores.

**Our adaptation:** We follow the same tree structure (root → 3 × depth-1 → 6 × depth-2) but inject actual corpus text into every generation prompt so arguments are grounded in what the persona has written.

### What CE-QArg Does (arXiv:2407.08497)

CE-QArg is belief revision for QBAFs:

1. Given a QBAF and a desired target strength for the root, find the **minimal set of base score adjustments** that achieve that target.

2. Uses polarity analysis (does increasing node X raise or lower the root?) and priority scoring (closer to root = adjust first).

3. The key insight: belief revision should be **minimal** — change as few base scores as possible.

**Current limitation:** The target strength (σ*) is still LLM-determined via Haiku. See section 4.6 for planned persona-modulated revision.

---

## 3. The Current Pipeline: How Belief Graphs Are Created

### 3.1 `extractQBAF()` — Step by Step

```
extractQBAF(persona, contract, topic, corpus)

Step 0: filterCorpusByTopic(corpus, topic)
├── If corpus ≤ 15 entries: use all (Citadel case)
├── If corpus > 15 entries: Haiku selects 10-15 most relevant
│   Input: topic + corpus entry IDs + first 200 chars of each
│   Output: array of selected IDs
├── Fallback: if filter returns < 5, use first 15 entries
└── Result: filteredCorpus[] → formatted into sourceMaterial block
    ✅ Verified: Citrini 120 → ~15 filtered; Citadel 8 → all 8 used

Step 1: Generate root claim (Sonnet, temp 0.7)
├── System: buildConsolidatedPrompt(contract, persona)
│   Contains: personality, bias, stakes, epistemology, voice profile, anchor excerpts
├── User prompt includes:
│   - Topic
│   - ## Source Material block (filtered corpus with IDs)
│   - Instruction: cite IDs from Source Material in grounding field
├── Output: { claim: string, grounding: string[] }
└── Creates rootNode with depth=0, baseScore=0.5 (placeholder)
    ✅ Verified: grounding contains real corpus IDs

Step 2: Generate depth-1 arguments (Sonnet, temp 0.7)
├── Same system prompt
├── User prompt: root claim + Source Material + "generate exactly 3 arguments"
├── Output: 3 arguments, each { claim, type: pro|con, grounding }
├── Creates 3 nodes at depth=1
└── Creates 3 edges → root (support or attack based on type)
    ✅ Verified: mix of pro/con, all grounded

Step 3: Generate depth-2 sub-arguments (Sonnet, temp 0.7)
├── For each depth-1 node:
│   ├── Same system prompt
│   ├── User prompt: parent claim + Source Material + "generate exactly 2 sub-arguments"
│   ├── Output: 2 sub-arguments, each { claim, type: pro|con, grounding }
│   ├── Creates 2 nodes at depth=2
│   └── Creates 2 edges → parent (support or attack)
└── Total: 6 depth-2 nodes, 6 edges
    ✅ Verified: all grounded

Step 4: Assign base scores (Haiku, temp 0.2)
├── System: "You are scoring intrinsic plausibility..."
├── Input: all 10 nodes listed as "id: claim (type)"
├── Output: { scores: { nodeId: number } }
├── Scores clamped to [0, 1], fallback 0.5
└── ⚠️ Still LLM vibes, not evidence-density (see section 4.4)

Step 5: DF-QuAD — compute dialectical strengths
├── Topological sort: leaves first, root last
├── For each node: σ = combine(τ, attackAgg, supportAgg)
│   - aggregate() = 1 - Π(1 - sᵢ)
│   - combine(): attacks > supports → σ = τ - τ(a-s)
│                supports > attacks → σ = τ + (1-τ)(s-a)
│                equal → σ = τ
└── Result: every node has final dialecticalStrength
    ✅ Pure math, correct
```

**Result:** `PersonaQBAF` with 10 nodes (1 root + 3 depth-1 + 6 depth-2), 9 edges, all nodes with grounding arrays pointing to real corpus entry IDs.

### 3.2 Full Experiment Pipeline (`orchestrator.ts`)

```
runBeliefGraphExperiment(config)

Phase 1: Extract QBAFs
├── Load personas, contracts, corpora
├── extractQBAF(personaA, contractA, topic, corpusA) → qbafA
└── extractQBAF(personaB, contractB, topic, corpusB) → qbafB

Phase 2: Debate Rounds (up to maxRounds=5)
├── For each round:
│   ├── runDebateRound(qbafA, qbafB, ...)
│   │   ├── Persona A reads serialized qbafB → generates 1-3 attacks/supports
│   │   ├── Persona B reads serialized qbafA → generates 1-3 attacks/supports
│   │   ├── A's moves applied to B's graph, B's moves applied to A's graph
│   │   └── DF-QuAD recomputed on both
│   ├── Belief revision for both personas
│   │   ├── Haiku: determine target σ* given new attacks
│   │   ├── CE-QArg: minimal τ adjustments to reach σ*
│   │   └── DF-QuAD recomputed
│   ├── Convergence check: both |Δσ(root)| < threshold?
│   └── If converged, break
│
Phase 3: Community Graph
├── Semantic dedup: match nodes across QBAFs (similarity ≥ 0.85)
├── Classify by per-persona base score variance:
│   ├── Crux: variance > 0.3
│   ├── Consensus: variance < 0.1
│   └── Neutral: otherwise

Phase 4: Crux Identification
├── For each crux node: counterfactual impact on each persona's root
├── cruxScore = |impactA - impactB|
├── Generate counterfactuals and settling questions via LLM
└── Return top K cruxes

Phase 5: Benchmarks (7 metrics)
├── Root Strength Delta (RSD)
├── Stance Divergence (ΔSD)
├── Belief Revision Cost (BRC)
├── Crux Localization Rate (CLR)
├── Argument Coverage (AC)
├── Graph Growth Rate (GGR)
└── Counterfactual Sensitivity (CS)
```

### 3.3 Supporting Modules

| Module | Purpose | Status |
|--------|---------|--------|
| `extract-qbaf.ts` | Corpus-grounded QBAF extraction | ✅ Working, verified |
| `df-quad.ts` | DF-QuAD semantics: aggregate, combine, computeStrengths, counterfactualImpact | ✅ Pure math, correct |
| `debate-round.ts` | Persona reads opponent QBAF, generates targeted attacks/supports | ✅ Logic correct |
| `belief-revision.ts` | CE-QArg: polarity analysis, priority scoring, iterative τ adjustment | ⚠️ Works but target σ* is LLM-guessed |
| `community-graph.ts` | Semantic dedup, variance classification, crux identification | ✅ Correct |
| `benchmarks.ts` | 7 experiment metrics | ✅ Correct |
| `orchestrator.ts` | Async generator yielding 12 SSE event types | ✅ Correct |
| `types.ts` | All interfaces: QBAFNode, QBAFEdge, PersonaQBAF, CommunityGraph, StructuralCrux, etc. | ✅ Complete |

---

## 4. Remaining Improvements

### 4.1 Evidence-Density Base Scores (not yet implemented)

Current: Haiku assigns τ based on "how plausible does this claim sound."

Proposed: τ derived from how much evidence exists in the persona's corpus.

```typescript
function computeBaseScore(triple: CausalTriple): number {
  const sourceBonus = Math.min(triple.sourceChunks.length / 5, 1.0) * 0.3
  const extractionConfidence = triple.confidence * 0.4
  const engagementBonus = computeEngagementScore(triple.sourceChunks) * 0.2
  const recencyBonus = computeRecencyScore(triple.sourceChunks) * 0.1
  return Math.min(1.0, sourceBonus + extractionConfidence + engagementBonus + recencyBonus)
}
```

This would require restructuring extraction to use the BeliefGraph triples (section 1.3) as input instead of generating claims from scratch.

### 4.2 Persona-Modulated Belief Revision (not yet implemented)

Current: Haiku picks target σ* with no personality context. Results can be unmoored.

Proposed: Two-component revision.

1. **Structural impact** — DF-QuAD says what σ *should* be given the graph topology.
2. **Personality resistance (R)** — how much this persona would actually update.

```
σ_target = σ_previous + (1 - R) × (σ_raw - σ_previous)
```

R is computed via LLM call with the persona's own system prompt, evaluating attacks against their stated epistemology, flip conditions, and evidence policy.

| Contract Field | Revision Signal |
|---|---|
| `epistemology` | "Base rate driven" → accepts statistical arguments. "First principles" → resists empirical counterexamples. |
| `flipConditions` | If an attack matches a stated flip condition, R drops dramatically. |
| `evidencePolicy.acceptableSources` | Attacks from respected sources get higher weight. |
| `evidencePolicy.unacceptableSources` | Attacks from dismissed sources get near-zero weight. |
| `bias` | Arguments aligned with bias face less scrutiny. |
| `stakes` | High personal stakes = high resistance to updating. |

### 4.3 Sparse Corpus Handling

Citadel has only 8 corpus entries. Options for thin corpora:

1. **Accept smaller graphs.** Honest — less evidence means simpler QBAF.
2. **Supplement with contract `anchorExcerpts`.** Direct quotes used as additional corpus entries.
3. **LLM generation as last resort.** Mark as `grounding: ["synthetic"]`, cap τ ≤ 0.3.

Currently the pipeline handles this naturally — small corpora skip the filtering step and all entries are injected.

---

## 5. Implementation Status

| ARGORA Concept | Our Implementation | Status |
|---|---|---|
| Expert QBAF | `PersonaQBAF` with corpus-grounded nodes | ✅ Working — nodes grounded to real corpus IDs |
| DF-QuAD semantics | `df-quad.ts`: aggregate, combine, computeStrengths | ✅ Pure math, correct |
| Debate rounds | `debate-round.ts`: read opponent graph, generate responses | ✅ Logic correct |
| CE-QArg revision | `belief-revision.ts`: polarity analysis, iterative adjustment | ⚠️ Works, but σ* target is LLM-guessed (see 4.2) |
| Counterfactual edge impact | `df-quad.ts`: counterfactualImpact | ✅ Correct |
| Community graph merge | `community-graph.ts`: semantic dedup, variance classification | ✅ Correct |
| Structural crux identification | `community-graph.ts`: identifyCruxes | ✅ Correct — quality depends on QBAF quality |
| Benchmarks (ΔSD, RSD, etc.) | `benchmarks.ts`: 7 metrics | ✅ Correct |
| Corpus grounding | `extract-qbaf.ts`: filterCorpusByTopic + Source Material injection | ✅ Verified for Citrini + Citadel |

**Bottom line:** The extraction pipeline is now corpus-grounded. Every QBAF node traces to specific corpus entry IDs. The remaining improvements (evidence-density τ, persona-modulated revision) are quality enhancements, not correctness fixes.
