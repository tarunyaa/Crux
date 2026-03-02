# Belief Graph Debate Experiment

**Date:** 2026-03-01
**Personas:** Citrini (macro bear, AI displacement thesis) vs Citadel Securities (institutional macro, AI-as-complement thesis)
**Focus:** Novel crux generation via structured belief graph revision — not dialogue viewing

---

## 1. Concept

Run an offline experiment where two personas debate through their **belief graphs**, not through conversational turns. Each "round" of debate is a graph operation, not a chat message. The output is a set of **novel cruxes** — structurally identified via QBAF semantics — and a **minimal community graph** representing the irreducible disagreement.

### Why This Matters

The current dialogue system generates cruxes by detecting disagreement in conversation and spawning focused crux rooms. This works, but the crux identification is LLM-judgment-based (Haiku confidence scores). The belief graph approach makes crux identification **structural and deterministic** — a crux is the node where removing or flipping it changes the debate outcome. This is formally grounded in QBAF counterfactual edge impact analysis (ARGORA, arXiv:2601.21533).

### Shift in Philosophy

- **Old model:** Debate → dialogue → detect disagreement → spawn crux room → extract crux card
- **New model:** Extract belief graphs → run QBAF debate rounds → belief revision updates graphs → structural crux identification → minimal community graph with measured benchmarks
- The dialogue is not the product. The **crux cards and community graph** are the product.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Experiment Pipeline                    │
│                                                          │
│  Phase 1: Extraction                                     │
│  ┌──────────┐    ┌──────────┐                           │
│  │ Citrini  │    │ Citadel  │                           │
│  │ Corpus   │    │ Corpus   │                           │
│  └────┬─────┘    └────┬─────┘                           │
│       │               │                                  │
│       ▼               ▼                                  │
│  ┌──────────┐    ┌──────────┐                           │
│  │ Topic    │    │ Topic    │     Haiku extraction       │
│  │ QBAF_A   │    │ QBAF_B   │     per topic             │
│  └────┬─────┘    └────┬─────┘                           │
│       │               │                                  │
│  Phase 2: Debate Rounds                                  │
│       │               │                                  │
│       ▼               ▼                                  │
│  ┌─────────────────────────┐                            │
│  │  Round N:                │                            │
│  │  1. A reads B's QBAF    │                            │
│  │  2. A generates attacks/ │                            │
│  │     supports on B's nodes│                            │
│  │  3. B reads A's QBAF    │                            │
│  │  4. B generates attacks/ │                            │
│  │     supports on A's nodes│                            │
│  │  5. Both run CE-QArg     │                            │
│  │     belief revision      │                            │
│  │  6. Recompute DF-QuAD    │                            │
│  └────────┬────────────────┘                            │
│           │ repeat 3-5 rounds                            │
│           ▼                                              │
│  Phase 3: Community Graph                                │
│  ┌─────────────────────────┐                            │
│  │  Semantic merge nodes    │                            │
│  │  Per-persona base scores │                            │
│  │  DF-QuAD on merged QBAF │                            │
│  │  Crux = max variance     │                            │
│  │  Consensus = min variance│                            │
│  └────────┬────────────────┘                            │
│           ▼                                              │
│  Phase 4: Output                                         │
│  ┌─────────────────────────┐                            │
│  │  Crux cards (structural) │                            │
│  │  Community graph JSON    │                            │
│  │  Benchmark metrics       │                            │
│  └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

### 3.1 QBAF Node (extends existing BeliefNode)

```typescript
interface QBAFNode {
  id: string
  claim: string                          // natural language claim
  type: 'root' | 'pro' | 'con' | 'evidence'
  baseScore: number                      // τ ∈ [0,1] — intrinsic plausibility
  dialecticalStrength: number            // σ ∈ [0,1] — computed by DF-QuAD
  grounding: string[]                    // corpus chunk IDs
  personaId: string                      // who originated this node
  depth: number                          // distance from root (0 = root claim)
}
```

### 3.2 QBAF Edge

```typescript
interface QBAFEdge {
  id: string
  from: string                           // source node ID
  to: string                             // target node ID
  type: 'attack' | 'support'
  weight: number                         // edge strength ∈ [0,1]
}
```

### 3.3 Per-Persona QBAF

```typescript
interface PersonaQBAF {
  personaId: string
  topic: string                          // the debate topic
  rootClaim: string                      // root node ID
  nodes: QBAFNode[]
  edges: QBAFEdge[]
  round: number                          // which debate round this represents
}
```

### 3.4 Community Graph

```typescript
interface CommunityNode {
  id: string
  claim: string
  mergedFrom: string[]                   // original node IDs from persona QBAFs
  baseScores: Record<string, number>     // personaId → τ
  communityStrength: number              // DF-QuAD on averaged base scores
  variance: number                       // std dev of per-persona strengths
  classification: 'consensus' | 'crux' | 'neutral'
}

interface CommunityGraph {
  topic: string
  personas: string[]
  nodes: CommunityNode[]
  edges: QBAFEdge[]
  cruxNodes: string[]                    // node IDs where variance > threshold
  consensusNodes: string[]               // node IDs where variance < threshold
}
```

### 3.5 Structural Crux Card

```typescript
interface StructuralCrux {
  id: string
  nodeId: string                         // the community graph node that is the crux
  claim: string
  cruxScore: number                      // |contribution_A - contribution_B|
  disagreementType: 'base_score' | 'edge_structure' | 'both'
  personaPositions: Record<string, {
    baseScore: number
    dialecticalStrength: number
    contribution: number                 // τ × Δ_edge toward their root
  }>
  counterfactual: string                 // "If [persona] accepted this at τ=X, their root strength would shift from Y to Z"
  settlingQuestion: string               // generated: what evidence would resolve this?
}
```

---

## 4. Implementation Plan

### Phase 1: Topic-Scoped QBAF Extraction

**Goal:** Given a persona's corpus + a debate topic, produce a QBAF tree rooted at that persona's stance on the topic.

**Pipeline:**

1. Load persona contract + corpus from `data/seed/`
2. Sonnet call: given topic + corpus excerpts, generate root claim (persona's main thesis)
3. Sonnet call: generate width=3 pro/con arguments at depth 1 (ArgLLMs Γ stage)
4. Sonnet call: for each depth-1 argument, generate width=2 sub-arguments at depth 2
5. Haiku call: assign base scores τ ∈ [0,1] to each node (ArgLLMs ℰ stage)
6. Apply DF-QuAD bottom-up to compute dialectical strengths (pure math, no LLM)
7. Write to `data/experiments/qbaf/[topic]/[PersonaId].json`

**LLM calls per persona:** 1 (root) + 1 (depth 1) + 3 (depth 2) + 1 (scoring) = **6 calls**

**Estimated nodes:** 1 root + 3 depth-1 + 6 depth-2 = **10 nodes per persona**

**File:** `lib/experiment/extract-qbaf.ts`

### Phase 2: DF-QuAD Engine

**Goal:** Pure TypeScript implementation of DF-QuAD semantics.

```typescript
// DF-QuAD aggregation: "at least one effective" under independence
function aggregate(strengths: number[]): number {
  if (strengths.length === 0) return 0
  return 1 - strengths.reduce((prod, s) => prod * (1 - s), 1)
}

// DF-QuAD combination
function combine(baseScore: number, attackAgg: number, supportAgg: number): number {
  if (Math.abs(attackAgg - supportAgg) < 1e-9) return baseScore
  if (attackAgg > supportAgg) return baseScore - baseScore * (attackAgg - supportAgg)
  return baseScore + (1 - baseScore) * (supportAgg - attackAgg)
}

// Bottom-up pass for tree-structured QBAF
function computeStrengths(qbaf: PersonaQBAF): PersonaQBAF {
  // topological sort (leaves first), then propagate up
}
```

**File:** `lib/experiment/df-quad.ts`

### Phase 3: Debate Rounds (Graph-Level)

**Goal:** Each round, personas examine each other's QBAF and generate new attack/support edges.

**Per round:**

1. **A reads B's QBAF:** Serialize B's QBAF to structured text (claim tree with strengths)
2. **A generates responses:** Sonnet call with A's contract + A's current QBAF + B's QBAF → new attack/support nodes targeting B's arguments. Output: 1-3 new nodes + edges.
3. **B reads A's QBAF:** Same, reversed
4. **B generates responses:** Same, reversed
5. **Belief revision (CE-QArg):** For each persona, given the new attacks/supports received:
   - Identify which of your own nodes are now under pressure (attacked by strong arguments) or bolstered (supported)
   - Run CE-QArg: find minimal base score adjustments to your nodes such that your root strength accounts for the new evidence
   - Apply the adjustments
6. **Recompute DF-QuAD** on both updated QBAFs

**LLM calls per round:** 2 (A responds to B) + 2 (B responds to A) + 2 (CE-QArg target strength extraction) = **~6 calls**

**Rounds:** 3-5 (based on MacNet logistic plateau finding)

**Convergence check:** If |Δσ(root)| < 0.02 for both personas across a round, stop early.

**File:** `lib/experiment/debate-round.ts`

### Phase 4: CE-QArg Belief Revision

**Goal:** After receiving new attacks, minimally adjust base scores to account for them.

**Algorithm (simplified from arXiv:2407.08497):**

```typescript
interface RevisionResult {
  adjustedScores: Record<string, number>  // nodeId → new τ
  totalShift: number                       // Σ|Δτ| — revision cost
  polarityMap: Record<string, 'positive' | 'negative' | 'neutral'>
}

function reviseBeliefs(
  qbaf: PersonaQBAF,
  targetRootStrength: number,  // σ* — where the persona "should" end up given new evidence
  epsilon: number = 0.01
): RevisionResult {
  // 1. Polarity analysis: for each node, determine if increasing its τ
  //    raises or lowers root strength (trace paths to root, count attack edges)
  // 2. Priority scoring: Priority(node) = 1 / distance_to_root
  // 3. Iterative gradient step until σ(root) reaches target
  // 4. Return minimal Δτ per node
}
```

**How to determine target root strength (σ*):**
- Haiku call: given persona's current position + the attacks received this round, what should their updated confidence be? Output: single float [0,1].
- This is the one place where LLM judgment enters the revision process. Everything else is deterministic math.

**File:** `lib/experiment/belief-revision.ts`

### Phase 5: Community Graph Construction

**Goal:** Merge two persona QBAFs into a single community graph with per-persona annotations.

**Algorithm:**

1. **Semantic dedup:** For all node pairs (one from each QBAF), compute semantic similarity (embed claims via Haiku → cosine similarity). Threshold ρ = 0.85 → merge into single community node.
2. **Unmatched nodes:** Keep as persona-specific nodes in the community graph.
3. **Per-persona base scores:** For merged nodes, store both personas' τ values. For persona-specific nodes, only the originating persona has a score.
4. **Edge merge:** Union of all edges, redirected to community node IDs.
5. **Classify nodes:**
   - `consensus`: variance(τ_A, τ_B) < 0.1
   - `crux`: variance(τ_A, τ_B) > 0.3
   - `neutral`: everything else
6. **Crux scoring:** For each crux node, compute counterfactual edge impact:
   ```
   contribution_A(α) = τ_A(α) × Δ_edge_A(α; root_A)
   contribution_B(α) = τ_B(α) × Δ_edge_B(α; root_B)
   crux_score(α) = |contribution_A(α) - contribution_B(α)|
   ```
7. **Output:** Top-K crux nodes as StructuralCrux cards

**Semantic similarity:** Use Haiku with a simple "are these two claims saying the same thing? respond 0.0-1.0" call. Cheaper and more reliable than embedding + cosine for <100 node pairs.

**File:** `lib/experiment/community-graph.ts`

### Phase 6: Benchmarks

Metrics computed automatically after each experiment run:

| Metric | Formula | Target |
|--------|---------|--------|
| **Root Strength Delta (RSD)** | \|σ_A(root_final) - σ_A(root_initial)\| | > 0.05 (beliefs actually moved) |
| **Stance Divergence (ΔSD)** | std(σ_roots_final) - std(σ_roots_initial) | ≥ 0 (no false consensus) |
| **Belief Revision Cost (BRC)** | Σ\|Δτ\| across all rounds / \|nodes\| | Low = rational, High = volatile |
| **Crux Localization Rate (CLR)** | % of nodes with crux_score > 0.3 | 10-30% (focused disagreement) |
| **Argument Coverage (AC)** | \|community_nodes\| / (2 × \|initial_nodes_per_persona\|) | > 0.6 (substantive overlap) |
| **Graph Growth Rate (GGR)** | \|final_nodes\| / \|initial_nodes\| | 1.5-3.0 (debate added substance) |
| **Counterfactual Sensitivity (CS)** | For top crux: \|Δσ(root)\| when crux node τ is flipped | > 0.1 (crux actually matters) |

**File:** `lib/experiment/benchmarks.ts`

---

## 5. Frontend Visualization

### 5.1 Experiment Page (`/experiment`)

Not a live debate viewer. A results dashboard.

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Experiment: [topic]                             │
│  Citrini vs Citadel  •  Rounds: 4  •  Nodes: 38│
├──────────────────────┬──────────────────────────┤
│                      │                           │
│   Belief Graph       │   Crux Cards             │
│   Visualization      │   (ranked by crux_score) │
│                      │                           │
│   [toggle: A / B /   │   ┌─────────────────┐    │
│    community / diff]  │   │ Crux #1: ...    │    │
│                      │   │ score: 0.82     │    │
│   ┌──────────┐       │   │ counterfactual  │    │
│   │  D3/force │       │   └─────────────────┘    │
│   │  directed │       │   ┌─────────────────┐    │
│   │  graph    │       │   │ Crux #2: ...    │    │
│   └──────────┘       │   └─────────────────┘    │
│                      │                           │
├──────────────────────┴──────────────────────────┤
│  Benchmark Dashboard                             │
│  RSD: 0.12  ΔSD: +0.03  BRC: 0.08  CLR: 22%   │
│  AC: 0.71   GGR: 2.1    CS: 0.18               │
├─────────────────────────────────────────────────┤
│  Round-by-Round Timeline                         │
│  [R0] ──── [R1] ──── [R2] ──── [R3] ──── [R4] │
│  Click round to see graph state at that point    │
└─────────────────────────────────────────────────┘
```

### 5.2 Graph Visualization

Use a force-directed graph (D3 or a lightweight React wrapper like `@visx/network`).

**Node encoding:**
- Color: red (persona A), white (persona B), gray (both/merged in community view)
- Size: proportional to dialectical strength σ
- Border: thick for crux nodes, dashed for low-confidence nodes (τ < 0.3)
- Label: truncated claim text

**Edge encoding:**
- Red dashed: attack
- Solid: support
- Thickness: proportional to weight

**Views (toggle):**
- **Persona A:** Citrini's QBAF only
- **Persona B:** Citadel's QBAF only
- **Community:** Merged graph with dual-colored nodes where both have scores
- **Diff:** Highlight only nodes/edges that changed in the selected round

### 5.3 Crux Card (Structural)

Extends existing `CruxCard.tsx` design but with graph-derived data:

```
┌──────────────────────────────────────┐
│ CRUX #1                    score 0.82│
│                                      │
│ "Will AI labor displacement exceed   │
│  historical technology displacement  │
│  rates within 10 years?"             │
│                                      │
│ Citrini: τ=0.85 → σ=0.71            │
│ "Historical analogies undercount the │
│  speed of AI adoption curves"        │
│                                      │
│ Citadel: τ=0.25 → σ=0.38            │
│ "Every prior displacement wave was   │
│  predicted to be 'different this     │
│  time' — base rates hold"            │
│                                      │
│ Counterfactual: If Citrini accepted  │
│ τ=0.25, root shifts 0.71 → 0.48     │
│                                      │
│ Settling question: "What adoption    │
│ rate data would distinguish AI from  │
│ prior technology waves?"             │
└──────────────────────────────────────┘
```

---

## 6. File Structure

```
faultline/
├── lib/experiment/
│   ├── types.ts              — QBAFNode, QBAFEdge, PersonaQBAF, CommunityGraph, StructuralCrux
│   ├── df-quad.ts            — DF-QuAD semantics (pure math, no LLM)
│   ├── extract-qbaf.ts       — Topic-scoped QBAF extraction from corpus
│   ├── debate-round.ts       — Single round: read opponent graph → generate responses → revise
│   ├── belief-revision.ts    — CE-QArg minimal base score adjustment
│   ├── community-graph.ts    — Merge two QBAFs → community graph + crux identification
│   ├── benchmarks.ts         — Compute all metrics from experiment state
│   └── run-experiment.ts     — Orchestrator: extraction → N rounds → community → benchmarks
├── scripts/
│   └── run-belief-experiment.ts  — CLI entry point
├── app/experiment/
│   └── page.tsx              — Results dashboard
├── components/experiment/
│   ├── BeliefGraphView.tsx   — D3 force-directed graph
│   ├── StructuralCruxCard.tsx— Graph-derived crux card
│   ├── BenchmarkDashboard.tsx— Metric display
│   └── RoundTimeline.tsx     — Round-by-round scrubber
└── data/experiments/
    └── [topic-slug]/
        ├── round-0-citrini.json
        ├── round-0-citadel.json
        ├── round-1-citrini.json
        ├── ...
        ├── community.json
        ├── cruxes.json
        └── benchmarks.json
```

---

## 7. Execution Plan

### Step 1: Types + DF-QuAD engine
- Define `QBAFNode`, `QBAFEdge`, `PersonaQBAF`, `CommunityGraph`, `StructuralCrux` types
- Implement DF-QuAD `aggregate()`, `combine()`, `computeStrengths()`
- Unit test: hand-computed 7-node tree matches paper examples

### Step 2: QBAF extraction
- Implement `extractQBAF(personaId, topic)`
- Run on Citrini + Citadel for topic "Will AI cause net job losses in the next decade?"
- Validate: root claims are genuinely oppositional, depth-2 tree is coherent

### Step 3: Debate round logic
- Implement `runDebateRound(qbafA, qbafB, round)`
- Each persona sees opponent's graph, generates 1-3 attack/support nodes
- New nodes attached to existing opponent nodes

### Step 4: Belief revision (CE-QArg)
- Implement polarity analysis + priority scoring + iterative update
- Validate: revision cost is minimal, root strength moves in expected direction

### Step 5: Community graph + crux identification
- Semantic merge, per-persona annotations, crux scoring
- Generate StructuralCrux cards with counterfactuals

### Step 6: Benchmarks
- Compute all 7 metrics
- Output to `benchmarks.json`

### Step 7: Frontend
- Graph visualization (D3 force-directed)
- Crux cards (structural variant)
- Benchmark dashboard
- Round timeline scrubber

---

## 8. Cost Estimate

Per experiment run (2 personas, 1 topic, 4 rounds):

| Phase | LLM Calls | Model | Est. Tokens |
|-------|-----------|-------|-------------|
| Extraction (×2) | 12 | Sonnet + Haiku | ~20K |
| Debate rounds (×4) | 24 | Sonnet | ~40K |
| Belief revision (×8) | 8 | Haiku | ~8K |
| Community merge | 2 | Haiku | ~4K |
| Crux generation | 1 | Sonnet | ~3K |
| **Total** | **~47** | | **~75K tokens** |

Estimated cost: **~$0.50-0.75 per experiment run**

---

## 9. Key Design Decisions

1. **Tree-structured QBAFs only (no cycles).** DF-QuAD converges in one pass for trees. Cycles require iteration and complicate CE-QArg polarity analysis. If debate rounds create cycles (A attacks B's node which supports A's node), break the cycle by keeping only the stronger edge.

2. **Depth 2, width 3.** Matches ArgLLMs best-performing config. Keeps graphs small enough to serialize into LLM context (~10 nodes per persona initially, growing to ~20-30 after 4 rounds).

3. **CE-QArg over DeGroot scalar update.** DeGroot only works for single-dimensional beliefs. CE-QArg operates on the full graph structure, producing per-node explanations of what changed and why.

4. **Semantic similarity via Haiku, not embeddings.** For <100 node pairs, a direct LLM comparison is cheaper than setting up an embedding pipeline and more accurate for nuanced claim matching.

5. **No dialogue generation.** The personas never "talk" to each other in natural language. They read structured graphs and produce structured responses (new nodes + edges). The LLM calls are for argument generation and scoring, not conversation.

6. **Community graph is the product.** The experiment produces a single artifact: a community graph with annotated crux nodes and consensus nodes. The crux cards are views into this graph, not separate objects.

---

## 10. References

- **ArgLLMs** — Freedman et al., AAAI 2025, arXiv:2405.02079. QBAF pipeline, public code.
- **DF-QuAD** — Rago et al., 2016. Dialectical strength semantics for bipolar AFs.
- **CE-QArg** — arXiv:2407.08497, KR 2024. Belief revision via minimal base score adjustment.
- **ARGORA** — arXiv:2601.21533. Multi-expert debate with counterfactual edge impact.
- **MArgE** — arXiv:2508.02584. Merging multiple ArgLLM trees into community verdict.
- **ArgRAG** — arXiv:2508.20131. QBAF applied to RAG retrieval verification.
- **DEBATE benchmark** — Chuang et al., arXiv:2510.25110. ΔSD metric.
- **MacNet** — arXiv:2406.07155. Logistic scaling, 3-5 round plateau.
- **Graph-Theoretic Model of Belief** — arXiv:2508.03465. Credibility vs confidence separation.
- **QBAF Change Explanations** — arXiv:2509.18215. Sufficient/necessary/counterfactual explanations.
