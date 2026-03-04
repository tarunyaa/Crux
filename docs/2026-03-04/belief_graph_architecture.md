# Belief Graph & Benchmark Suite Architecture

**Date**: 2026-03-04
**Status**: Active development

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Data Structures](#core-data-structures)
3. [Pipeline Stages](#pipeline-stages)
4. [DF-QuAD Semantics Engine](#df-quad-semantics-engine)
5. [QBAF Extraction](#qbaf-extraction)
6. [Belief Revision (CE-QArg)](#belief-revision-ce-qarg)
7. [Community Graph](#community-graph)
8. [Structural Crux Identification](#structural-crux-identification)
9. [Orchestrator (6-Phase Pipeline)](#orchestrator-6-phase-pipeline)
10. [Benchmark Suite](#benchmark-suite)
11. [CIG Benchmark](#cig-benchmark)
12. [Frontend Architecture](#frontend-architecture)
13. [File Map](#file-map)
14. [Data Formats](#data-formats)
15. [Key Design Decisions](#key-design-decisions)

---

## System Overview

The Belief Graph system extracts structured argumentation frameworks from persona belief data, compares them across personas, revises beliefs based on contradictions, and identifies structural cruxes — the load-bearing assumptions where personas fundamentally disagree.

```
Seed Beliefs (data/seed/beliefs/)
        │
        ▼
┌─────────────────────────┐
│  Stage 2: QBAF Extraction │  ← Topic-scoped filtering + DF-QuAD
│  (per persona, parallel)   │
└────────────┬────────────┘
             │ PersonaQBAF[]
             ▼
┌─────────────────────────┐
│  Pairwise Structural Diff │  ← Semantic matching (Haiku)
│  (nC2 pairs, parallel)     │
└────────────┬────────────┘
             │ PairwiseDiff[]
             ▼
┌─────────────────────────┐
│  Belief Revision (CE-QArg) │  ← Persona-modulated resistance
│  (sequential per persona)   │
└────────────┬────────────┘
             │ revised PersonaQBAF[]
             ▼
┌─────────────────────────┐
│  Community Graph Construction │  ← Union-find node merging
└────────────┬────────────┘
             │ CommunityGraph
             ▼
┌─────────────────────────┐
│  Crux Identification       │  ← Counterfactual sensitivity
└────────────┬────────────┘
             │ StructuralCrux[]
             ▼
┌─────────────────────────┐
│  Benchmark Computation     │  ← 7 metrics
└─────────────────────────┘
```

---

## Core Data Structures

### QBAF (Quantitative Bipolar Argumentation Framework)

```typescript
QBAFNode {
  id: string
  claim: string
  type: 'root' | 'pro' | 'con' | 'evidence'
  baseScore: number       // τ ∈ [0,1] — intrinsic plausibility
  dialecticalStrength: number  // σ ∈ [0,1] — computed by DF-QuAD
  grounding: string[]     // corpus chunk IDs
  personaId: string
  depth: number           // 0=root, 1=direct, 2=sub-argument
}

QBAFEdge {
  from: string            // source node (attacker/supporter)
  to: string              // target node
  type: 'attack' | 'support'
  weight: number          // ∈ [0,1]
}

PersonaQBAF {
  personaId: string
  topic: string
  rootClaim: string       // root node ID
  nodes: QBAFNode[]
  edges: QBAFEdge[]
}
```

### Community Graph

```typescript
CommunityNode {
  id: string
  claim: string
  mergedFrom: string[]            // source node IDs across personas
  baseScores: Record<string, number>  // per-persona τ values
  communityStrength: number
  variance: number
  classification: 'consensus' | 'crux' | 'neutral'
}

CommunityGraph {
  topic: string
  personas: string[]
  nodes: CommunityNode[]
  edges: CommunityEdge[]
  cruxNodes: string[]
  consensusNodes: string[]
}
```

### Structural Crux

```typescript
StructuralCrux {
  nodeId: string
  claim: string
  cruxScore: number
  disagreementType: 'base_score' | 'edge_structure' | 'both'
  personaPositions: Record<string, PersonaCruxPosition>
  counterfactual: string
  settlingQuestion: string  // Haiku-generated
}
```

---

## Pipeline Stages

### Stage 1: Belief Graph Extraction (pre-computed)

Raw persona corpus (tweets, essays) is processed into structured belief graphs stored at `data/seed/beliefs/{Name}.json`. This stage runs offline and produces:

- **Nodes**: concepts with type (factual_claim, inference, core_value, assumption) and grounding
- **Edges**: directed relationships with polarity (+1/-1), confidence, and source chunk references

The orchestrator does **not** run Stage 1 — it reads pre-extracted belief graphs from disk.

### Stage 2: Topic-Scoped QBAF Extraction

Converts a broad belief graph into a focused QBAF for a specific debate topic. See [QBAF Extraction](#qbaf-extraction).

### Stages 3-6: Diff → Revision → Community → Cruxes

Handled by the orchestrator. See [Orchestrator](#orchestrator-6-phase-pipeline).

---

## DF-QuAD Semantics Engine

**File**: `lib/belief-graph/df-quad.ts`

Pure mathematical computation, zero LLM calls. Implements Rago et al. 2016.

### Key Functions

**`aggregate(strengths: number[])`** — Independence-based aggregation:
```
agg = 1 - Π(1 - sᵢ)
```
Semantics: "probability that at least one argument is effective."

**`combine(τ, attackAgg, supportAgg)`** — DF-QuAD combination function:
```
if attacks > supports:  σ = τ - τ(a - s)        // pulls toward 0
if supports > attacks:  σ = τ + (1 - τ)(s - a)  // pulls toward 1
if equal:               σ = τ                     // base score preserved
```

**`computeStrengths(qbaf)`** — Bottom-up topological sort (Kahn's algorithm). Leaf nodes get σ = τ. Internal nodes compute σ from aggregated attacker/supporter strengths via the combination function.

**`counterfactualImpact(qbaf, nodeId, rootId)`** — Removes a node and all its edges, recomputes all strengths, returns `|σ(root_with) - σ(root_without)|`. Used for crux scoring.

---

## QBAF Extraction

**File**: `lib/belief-graph/extract-qbaf-from-beliefs.ts`

Every node in the output traces back to a real belief edge — no synthetic argument generation.

### Pipeline (all Haiku calls)

1. **Topic decomposition** → 5 aspects (at least 1 supportive, 1 undermining, 1 structural)
2. **Aspect-based edge filtering** → parallel Haiku calls score each belief edge's relevance to each aspect. Chunks of up to 100 edges per call.
3. **Merge + deduplicate** → union by relevance, best score per edge, ensure each aspect contributes 2-3 edges. Top 15 selected.
4. **Classify + root synthesis** → single Haiku call: synthesize root claim, classify each edge as supports/undermines the root. Edges that undermine the persona's position are intentionally kept (acknowledged risks).
5. **Build QBAF tree** → root + depth-1 (top 5 edges) + depth-2 (remaining, assigned to best parent by word overlap)
6. **Compute DF-QuAD strengths**

### Base Score Formula

```
sourceBreadth = min(|sourceChunks ∪ fromNode.grounding ∪ toNode.grounding| / 5, 1.0)
typeBonus: core_value +0.12, factual_claim +0.08, inference 0, assumption -0.05
raw = confidence × 0.40 + sourceBreadth × 0.35 + avgTypeBonus + 0.10
τ = clamp(raw, 0.05, 0.95)
```

---

## Belief Revision (CE-QArg)

**File**: `lib/belief-graph/belief-revision.ts`

Based on CE-QArg (arXiv:2407.08497). Minimally adjusts base scores (τ) so the root's dialectical strength (σ) approaches a target determined by contradictions.

### Revision Resistance (R)

Haiku assesses a persona's openness to belief change:

```
epistemicOpenness ∈ [0,1]   — dogmatic (0) to empiricist (1)
stakesRigidity ∈ [0,1]      — how much financial/reputational stakes prevent revision
flipTriggered: boolean       — whether attacks hit persona's stated flip conditions

R = (1 - epistemicOpenness) × 0.5 + stakesRigidity × 0.3 + 0.2
if flipTriggered: R = min(R, 0.2)
```

Typical range: 0.3-0.7. Dogmatic personas barely shift; empiricists accept more revision.

### Target Strength

```
σ_raw = Haiku(context-free assessment of contradiction severity)
σ_target = σ_current + (1 - R) × (σ_raw - σ_current)
max shift per round: 0.2
```

### Iterative Revision

1. Identify adjustable nodes (all except root)
2. Compute polarity per node: even attack-edge count on path to root = positive, odd = negative
3. Sort by priority = `1 / (depth + 1)` (closer to root adjusted first)
4. Gradient-style iteration: each step adjusts τ values by `stepSize × priority` in the direction that closes the gap between current and target σ(root)
5. Convergence: |gap| < ε (default 0.01), max 50 iterations

---

## Community Graph

**File**: `lib/belief-graph/community-graph.ts`

Merges per-persona QBAFs into a single unified graph using semantic matching and union-find.

### Construction

1. **Pairwise comparison**: all nC2 pairs of QBAFs compared via Haiku (single call per pair with all claims). Returns semantically matched pairs with confidence > 0.5.
2. **Union-find merge**: matched nodes are unioned transitively. Tracks strongest relationship signal (opposition > related > agreement).
3. **Community nodes**: group all QBAF nodes by union-find root. Collect per-persona base scores, compute variance.
4. **Classification**:
   - `opposition` relationship → **crux**
   - `agreement` + low variance → **consensus**
   - Otherwise → check variance against thresholds → **crux** or **neutral**
5. **Edge remapping**: skip intra-community self-loops, deduplicate by `from→to→type`.

---

## Structural Crux Identification

**File**: `lib/belief-graph/community-graph.ts` → `identifyCruxes()`

For each community node classified as crux:

1. Compute `counterfactualImpact` for each persona's constituent nodes
2. `cruxScore = |maxImpact - minImpact| + 0.1 × (mergedFrom.length ≥ 2)`
3. `disagreementType`: base_score (τ variance > 0.05), edge_structure (impact diff > 0.01), both
4. Sort by cruxScore, take top K (default 5)
5. Generate `settlingQuestion` via Haiku for each crux

The key insight: a crux isn't just a disagreement — it's an assumption whose removal **asymmetrically** affects personas' root conclusions.

---

## Orchestrator (6-Phase Pipeline)

**File**: `lib/belief-graph/orchestrator.ts`

Async generator yielding `BeliefGraphEvent` for SSE streaming.

### SSE Event Flow

```
experiment_start
  → extraction_start (per persona)
  → extraction_complete (per persona, with PersonaQBAF)
  → diff_start (per pair)
  → diff_complete (per pair, with PairwiseDiff)
  → revision_complete (per persona, with σ, cost, R, reasoning)
  → community_graph_built (CommunityGraph)
  → cruxes_identified (StructuralCrux[])
  → benchmarks_computed (BenchmarkMetrics)
  → experiment_complete (full ExperimentResult)
  | error
```

### Phase Details

| Phase | Parallelism | Description |
|-------|-------------|-------------|
| 1. QBAF Extraction | `Promise.all` per persona | Load belief graphs from disk, extract topic-scoped QBAFs |
| 2. Structural Diffs | `Promise.all` over nC2 pairs | Semantic matching via Haiku |
| 3. Belief Revision | Sequential per persona | CE-QArg with persona-modulated resistance |
| 4. Community Graph | Single call | Union-find merge + classification |
| 5. Crux Identification | Single call | Counterfactual sensitivity analysis |
| 6. Benchmarks | Single call | 7 metric computation |

---

## Benchmark Suite

**File**: `lib/belief-graph/benchmarks.ts`

### 7 Internal Metrics

| Metric | Formula | Good Threshold | Measures |
|--------|---------|----------------|----------|
| **RSD** (Root Strength Delta) | `\|σ_final - σ_initial\|` per persona | > 0.05 | Revision actually happened |
| **ΔSD** (Stance Divergence) | `stdDev(final) - stdDev(initial)` | ≥ 0 | Diversity maintained (no collapse to consensus) |
| **BRC** (Belief Revision Cost) | `Σ\|Δτ\| / \|nodes\|` per persona | < 0.2 | Revision was minimal/rational |
| **CLR** (Crux Localization Rate) | `cruxNodes / totalCommunityNodes` | 10-30% | Disagreements are focused, not everywhere |
| **AC** (Argument Coverage) | `\|community\| / (N × avg\|initial\|)` | > 0.6 | Community graph captured most arguments |
| **CS** (Counterfactual Sensitivity) | max impact of top crux | > 0.1 | Top crux actually matters |
| **DFS** (Decision Flip Score) | Haiku judge: does flipping top crux change conclusion? | flipped = true | Crux is genuinely decisive |

---

## CIG Benchmark

**Files**: `scripts/run-cig-benchmark.ts`, `lib/benchmark/cig-scoring.ts`

### Purpose

Comparative evaluation of crux discovery methods against ground-truth decisive assumptions.

### 4 Conditions

| Condition | Method | LLM Calls |
|-----------|--------|-----------|
| **single** | One Sonnet call: "list decisive assumptions" | 1 |
| **cot** | One Sonnet call with structured chain-of-thought (stakeholder perspectives, second-order effects) | 1 |
| **crux** | Role-based agents → parallel perspectives → disagreement detection → crux card extraction | 3 |
| **belief-graph** | Full pipeline: extractQBAF × 2 → structuralDiff → revision → communityGraph → identifyCruxes | Many |

### Scoring (v1, deprecated)

- **DAR** (Decisive Assumption Recall): Haiku strict semantic match against ground-truth
- **ANS** (Assumption Novelty Score): crux assumptions not in single-model baseline
- **DFS**: flip injection test
- **blindJudge**: Haiku rates clarity/robustness/novelty (1-5 each)

### CIG v2 (target, not yet implemented)

v1 is deprecated because DAR uses LLM-generated ground truth (self-referential). v2 redesign:

- Each task has a **hidden crux** variable determining a binary correct answer
- Context contains enough signal to find it, but surface-level reasoning misses it
- **4 new metrics**:
  - **CDR** (Crux Discovery Rate): did the method find the hidden crux?
  - **DA** (Decision Accuracy): correct binary answer?
  - **AE** (Assumption Efficiency): rank of hidden crux in output list
  - **FS** (Flip Sensitivity): does flipping the hidden crux flip the answer?
- **Target**: CDR for crux/belief-graph beats single by >15 pp on medium+hard tasks
- **Expected**: single=0.34, cot=0.42, crux=0.58, belief-graph=0.62

### Benchmark Tasks

5 tasks in `data/benchmarks/cig-tasks.json`:

| ID | Topic | Category |
|----|-------|----------|
| hbm-pricing | HBM semiconductor pricing | Semiconductor |
| btc-treasury | Corporate Bitcoin treasury adoption | Crypto |
| ai-scaling-laws | AI scaling law returns | AI |
| energy-transition | Clean energy transition timeline | Climate |
| ai-job-displacement | AI job displacement | AI Economics |

Each task has 4 domain analyst roles and 8 ground-truth decisive assumptions.

---

## Frontend Architecture

### Routes

- `/belief-graph` → `BeliefGraphSetup` (persona + topic selection) or `BeliefGraphView` (with query params)
- `/belief-graph/qbaf` → static QBAF tree viewer (reads pre-computed data from disk)

### Components

| Component | Role |
|-----------|------|
| `BeliefGraphSetup` | Persona grid (avatar, selection badge, "graph ready" tag), topic input, max 6 personas |
| `BeliefGraphView` | Main experiment dashboard. 2/3 graph + 1/3 crux panel. Phase-aware loading states. Tabs per persona + community view. Diffs table, revision table, benchmark dashboard below. |
| `QBAFGraph` | D3 force-directed SVG visualization. Two modes: persona QBAF (node radius = 8 + σ × 16, crux nodes red stroke) and community graph (averaged scores, crux/consensus/neutral coloring). |
| `QBAFTreeView` | Static SVG tree layout. 3 depth layers. Nodes colored by σ (white→red). Click for detail panel with τ/σ bars and grounding. |
| `StructuralCruxCard` | Claim, per-persona τ/σ, disagreement type badge, counterfactual summary, settling question. |
| `BenchmarkDashboard` | 3-column grid of 7 metric tiles with color-coded status (red/green/gray). |
| `BeliefGraphMini` | Canvas-based force graph for persona card pages. |

### SSE Hook

`useBeliefGraphStream(topic, personaIds)` — POSTs to `/api/belief-graph`, reads SSE via `ReadableStream`. State machine phases: `idle → extracting → diffing → revising → building-community → complete`.

---

## File Map

```
lib/belief-graph/
  types.ts                      — all shared types
  df-quad.ts                    — DF-QuAD semantics (pure math)
  extract-qbaf-from-beliefs.ts  — QBAF from belief graphs (Stage 2, used by orchestrator)
  extract-qbaf.ts               — QBAF from raw corpus (used by CIG benchmark only)
  belief-revision.ts            — CE-QArg belief revision
  community-graph.ts            — community graph + crux identification
  benchmarks.ts                 — 7 internal metrics
  orchestrator.ts               — 6-phase async generator

lib/benchmark/
  cig-scoring.ts                — DAR, ANS, DFS, blindJudge scoring

components/belief-graph/
  BeliefGraphSetup.tsx           — persona + topic selection UI
  BeliefGraphView.tsx            — main experiment dashboard
  QBAFGraph.tsx                  — D3 force-directed graph
  QBAFTreeView.tsx               — SVG tree layout
  StructuralCruxCard.tsx         — crux card display
  BenchmarkDashboard.tsx         — 7-metric panel
  BeliefGraphMini.tsx            — canvas mini graph
  BeliefGraphSection.tsx         — mini graph wrapper

app/belief-graph/
  page.tsx                       — server component
  BeliefGraphClient.tsx          — client wrapper
  qbaf/page.tsx                  — static QBAF viewer

app/api/belief-graph/
  route.ts                       — SSE POST endpoint

scripts/
  run-belief-experiment.ts       — CLI: full 6-phase experiment
  build-community-graph.ts       — CLI: Stage 3 only
  run-cig-benchmark.ts           — CLI: 4-condition CIG benchmark

data/seed/beliefs/{Name}.json    — pre-extracted belief graphs
data/experiments/{slug}/         — per-run experiment outputs
data/benchmarks/cig-tasks.json   — 5 benchmark tasks
data/benchmarks/cig-results/     — benchmark results
```

---

## Data Formats

### Belief Graph (`data/seed/beliefs/{Name}.json`)

```json
{
  "personaId": "citadel",
  "personaName": "Citadel",
  "nodes": [
    { "id": "n1", "concept": "...", "type": "factual_claim", "grounding": ["chunk-id"] }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "polarity": 1, "confidence": 0.85, "sourceChunks": ["..."] }
  ],
  "extractedAt": "2026-03-01T..."
}
```

### PersonaQBAF (`data/experiments/{slug}/qbaf-{Name}.json`)

```json
{
  "personaId": "citadel",
  "topic": "Will AI cause net job losses...",
  "rootClaim": "root-citadel",
  "nodes": [
    { "id": "root-citadel", "claim": "...", "type": "root", "baseScore": 0.7, "dialecticalStrength": 0.63, "depth": 0 }
  ],
  "edges": [
    { "from": "pro-1", "to": "root-citadel", "type": "support", "weight": 0.8 }
  ]
}
```

### Experiment Result (`data/experiments/{slug}/result.json`)

Contains: config, all diffs, all revision snapshots, community graph, cruxes, benchmarks, timestamp.

---

## Key Design Decisions

1. **Grounded arguments only**: Every QBAF node traces back to a real belief edge from the persona's corpus. No synthetic argument generation in the main pipeline.

2. **Aspect-based filtering**: Topic decomposed into 5 aspects before edge filtering ensures the QBAF includes counterarguments, not just the persona's strongest evidence.

3. **Persona-modulated revision**: CE-QArg resistance formula means dogmatic personas barely shift while empiricists accept revision. Flip conditions can override resistance.

4. **Counterfactual crux scoring**: A crux isn't just a disagreement — it's where removing the assumption **asymmetrically** affects personas' conclusions. `cruxScore = |maxImpact - minImpact|`.

5. **Union-find for community merging**: Semantic matches are unioned transitively. Opposition signal overrides agreement for classification.

6. **File-based data**: Belief graphs loaded from `data/seed/beliefs/`, not the database. Same pattern as persona contracts.

7. **CIG v1 → v2 transition**: v1's LLM-generated ground truth (DAR) is self-referential. v2 uses human-authored hidden crux tasks with binary correctness — not yet implemented.

8. **Two extraction paths**: `extract-qbaf-from-beliefs.ts` (main pipeline, from pre-computed belief graphs) vs `extract-qbaf.ts` (CIG benchmark only, from raw corpus with Sonnet generation).
