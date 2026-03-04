# Crux Quality Redesign: Worldview Synthesis + Assumption Extraction

## Problem Statement

Current cruxes are shallow topic restatements:
- "Whether memory pricing decline is driven by oversupply vs strong AI demand"
- "Whether a $200B capex announcement will cause stock decline"

These just rephrase the debate topic. A good crux identifies the **buried assumption** that separates positions:
- "Whether hyperscaler HBM orders represent real pull-through demand or speculative double-booking"
- "Whether productivity gains from AI reach labor markets within 5 years or 15+"

## Root Cause Analysis

The pipeline has 5 structural problems:

1. **Belief extraction is per-chunk**: Each tweet/essay is processed independently. The prompt says "only extract relationships the author clearly expressed" — biasing toward surface claims, never synthesizing cross-corpus worldview.

2. **100% single-source edges**: Every edge connects nodes from the same tweet. No cross-corpus inference happens. The belief graph is a collection of disconnected tweet-islands.

3. **30-40% noise nodes**: "spitting out drink in public", "dinosaurs dying", "becoming NPC" — extracted from conversational tweets as if they're beliefs.

4. **QBAF claims are surface concatenation**: `edgeToClaim()` produces `"X, driven by Y"` — these are edge descriptions, not analytical claims.

5. **No assumption layer exists**: The pipeline goes corpus → surface claims → QBAF → crux. It never asks "what implicit assumptions underlie this position?"

## Design: New Pipeline Stage — Worldview Synthesis

### Overview

Insert a new stage between raw belief extraction (Stage 1) and QBAF generation (Stage 2):

```
Stage 1: extract-beliefs.ts (existing, unchanged)
   ↓ data/seed/beliefs/[Name].json — raw causal triples per chunk

Stage 1.5: synthesize-worldview.ts (NEW)
   ↓ data/seed/worldviews/[Name].json — cross-corpus positions + assumptions

Stage 2: extract-qbaf-from-beliefs.ts (MODIFIED)
   ↓ Uses worldview data to build better QBAFs

Stage 3+: community-graph.ts, orchestrator.ts (MODIFIED crux prompt)
   ↓ Crux descriptions reference assumptions, not surface claims
```

### Stage 1.5: Worldview Synthesis

**Input**: Raw belief graph (nodes + edges) + corpus file + contract file
**Output**: Structured worldview with positions, assumptions, and causal mechanisms

#### Step 1: Cluster & Deduplicate (no LLM)

Group belief nodes by semantic similarity (simple word overlap + co-occurrence in edges). This collapses the hundreds of sparse tweet-islands into ~15-30 topic clusters.

```typescript
interface BeliefCluster {
  id: string
  theme: string              // e.g., "HBM demand trajectory"
  nodeIds: string[]           // belief node IDs in this cluster
  edgeIds: string[]           // edges within/between nodes in cluster
  sourceChunks: string[]      // all corpus chunks grounding this cluster
  representativeClaims: string[] // top 3-5 claims by confidence
}
```

#### Step 2: Position Extraction (1 Sonnet call per persona)

Feed ALL clusters + the persona's contract (personality, bias, stakes, epistemology) into a single Sonnet call. Ask it to synthesize:

```typescript
interface WorldviewPosition {
  id: string
  claim: string              // "HBM demand is structural, driven by AI training scaling"
  confidence: number          // how strongly the persona holds this (0-1)
  type: 'thesis' | 'concern' | 'assumption' | 'value_judgment'
  grounding: string[]         // cluster IDs this is derived from
  implicitAssumptions: string[] // what must be true for this position to hold
}
```

**Prompt design** (Sonnet, temperature 0.3):
```
You are analyzing {personaName}'s worldview based on their public writing.

Here are {N} topic clusters extracted from their tweets and essays:
{clusters with representative claims and source counts}

And here is their persona contract:
{personality, bias, stakes, epistemology from contract}

Synthesize their worldview into 8-12 positions. For each position:
1. State the position as a specific, falsifiable claim
2. Rate their confidence (0-1) based on how often/strongly they assert it
3. Classify: thesis (core argument), concern (risk they acknowledge),
   assumption (something they take for granted), value_judgment (priority/preference)
4. List 2-3 IMPLICIT ASSUMPTIONS that must be true for this position to hold.
   These are things the persona does NOT explicitly state but which their position requires.

   Example: If position is "HBM demand is structural", implicit assumptions might be:
   - "AI training compute demand grows >50% annually for 3+ years"
   - "No alternative memory technology displaces HBM in the training stack"
   - "Hyperscaler capex budgets are not constrained by ROI pressure"

Focus on assumptions that are:
- Falsifiable (could be proven wrong by evidence)
- Non-obvious (not just restating the position)
- Differentiating (another analyst might assume the opposite)
```

#### Step 3: Cross-Persona Assumption Diff (1 Haiku call per pair)

After synthesizing all personas' worldviews, compare their implicit assumptions:

```typescript
interface AssumptionConflict {
  id: string
  assumptionA: string         // persona A's implicit assumption
  assumptionB: string         // persona B's opposing assumption
  personaA: string
  personaB: string
  conflictType: 'empirical' | 'causal' | 'temporal' | 'value' | 'boundary'
  settlingQuestion: string    // what evidence would resolve this?
}
```

**Prompt** (Haiku, temperature 0.2):
```
Compare these two personas' implicit assumptions on {topic}:

{personaA} assumes:
{list of implicit assumptions}

{personaB} assumes:
{list of implicit assumptions}

Find 3-5 assumption CONFLICTS — places where one persona takes something
for granted that the other would explicitly disagree with.

For each conflict, classify the type:
- empirical: they disagree on a measurable fact
- causal: they disagree on which mechanism dominates
- temporal: they disagree on timeframes
- value: they prioritize different outcomes
- boundary: they disagree on scope (which markets, which time period)

And state what single piece of evidence would resolve it.
```

### Stage 2 Modifications: extract-qbaf-from-beliefs.ts

**Change 1**: Replace `edgeToClaim()` with worldview-grounded claims.

Instead of `"X, driven by Y"` surface concatenation, map each QBAF node to the closest WorldviewPosition. The claim text comes from the synthesized position, not the raw edge.

**Change 2**: Add assumption nodes as depth-2 evidence.

Each WorldviewPosition has `implicitAssumptions`. These become depth-2 nodes in the QBAF with type `'evidence'`, grounded in the clusters that support the parent position.

### Stage 3+ Modifications: community-graph.ts

**Change 1**: Crux identification uses AssumptionConflicts.

Instead of finding high-variance community nodes, prioritize nodes where the underlying assumptions are in direct conflict (from Stage 1.5 Step 3).

**Change 2**: Crux description prompt references assumptions.

```
Current prompt: "State the core disagreement in one sentence"
New prompt: "State the buried assumption that separates these positions.
             Not what they disagree about — but what they each take for granted
             that the other would challenge."
```

**Change 3**: Settling questions come from AssumptionConflict.settlingQuestion instead of a separate LLM call.

## Type Definitions

```typescript
// lib/belief-graph/worldview-types.ts

export interface BeliefCluster {
  id: string
  theme: string
  nodeIds: string[]
  edgeIds: string[]
  sourceChunks: string[]
  representativeClaims: string[]
  claimCount: number
}

export interface WorldviewPosition {
  id: string
  claim: string
  confidence: number
  type: 'thesis' | 'concern' | 'assumption' | 'value_judgment'
  groundingClusters: string[]
  implicitAssumptions: string[]
}

export interface PersonaWorldview {
  personaId: string
  personaName: string
  positions: WorldviewPosition[]
  clusters: BeliefCluster[]
  synthesizedAt: string
}

export interface AssumptionConflict {
  id: string
  assumptionA: string
  assumptionB: string
  personaA: string
  personaB: string
  conflictType: 'empirical' | 'causal' | 'temporal' | 'value' | 'boundary'
  settlingQuestion: string
  relevance: number  // 0-1, how central this assumption is to each persona's thesis
}
```

## File Changes

| File | Change | Why |
|------|--------|-----|
| `scripts/synthesize-worldviews.ts` | NEW | Runs Stage 1.5 |
| `lib/belief-graph/worldview-types.ts` | NEW | Type definitions |
| `lib/belief-graph/worldview-synthesis.ts` | NEW | Core synthesis logic |
| `lib/belief-graph/extract-qbaf-from-beliefs.ts` | MODIFY | Use worldview positions instead of raw edges for claims |
| `lib/belief-graph/community-graph.ts` | MODIFY | Crux prompt uses assumptions |
| `package.json` | MODIFY | Add `synthesize-worldviews` npm script |

Files that DON'T change:
- `scripts/extract-beliefs.ts` — raw extraction is fine, it feeds into synthesis
- `lib/belief-graph/df-quad.ts` — pure math, unchanged
- `lib/belief-graph/types.ts` — QBAF types unchanged
- `lib/belief-graph/belief-revision.ts` — revision logic unchanged
- `lib/belief-graph/orchestrator.ts` — just needs to load worldview data

## Cost Estimate

Per persona (Stage 1.5):
- Clustering: 0 LLM calls (pure code)
- Position extraction: 1 Sonnet call (~4K tokens in, ~2K out) = ~$0.04
- Total per persona: ~$0.04

Per persona pair (assumption diff):
- 1 Haiku call (~2K tokens in, ~1K out) = ~$0.001
- For 5 personas: 10 pairs × $0.001 = $0.01

**Total for 11 personas**: ~$0.45 for synthesis + ~$0.05 for diffs = **~$0.50**

This is negligible compared to the existing Stage 1 extraction cost (~$2-5 per persona for hundreds of Haiku calls).

## Implementation Order

1. Create types file (`worldview-types.ts`)
2. Implement clustering logic (pure code, no LLM)
3. Implement position extraction (Sonnet call)
4. Implement assumption diff (Haiku call)
5. Write `synthesize-worldviews.ts` script
6. Modify `extract-qbaf-from-beliefs.ts` to use worldview data
7. Modify `community-graph.ts` crux prompt
8. Test with 2-3 personas on memory supercycle topic
9. Evaluate crux quality vs old pipeline
