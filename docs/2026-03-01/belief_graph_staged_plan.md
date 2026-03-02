# Belief Graph Pipeline: Staged Implementation Plan

Each stage is self-contained. Run the script, inspect the output, decide whether to proceed.

---

## Stage 1: Raw Belief Graph Extraction

**Goal:** Extract the causal belief graph from each persona's corpus. This is the ground truth layer — every node and edge traces to specific text the persona actually wrote.

**What it does:**
1. Load corpus → chunk long entries at sentence boundaries (1100 chars max)
2. Haiku reads each chunk → extracts causal triples: `{cause, effect, polarity, confidence, type}`
3. Deduplicate: normalize concept names, merge identical (cause, effect, polarity) triples, average confidence, accumulate source chunks
4. Write `BeliefGraph` to `data/seed/beliefs/{Name}.json`

**Script:** `npx tsx scripts/extract-beliefs.ts` (or `--only "Citrini"`)

**Output:** `data/seed/beliefs/{Name}.json`

```typescript
BeliefNode { id, concept, type, grounding: string[] }   // grounding = corpus chunk IDs
BeliefEdge { from, to, polarity: 1|-1, confidence, sourceChunks: string[] }
```

**Current state:** Already run. Citrini: 739 nodes, 386 edges. Citadel: 64 nodes, 39 edges.

**What to inspect:**
- Do node concepts make sense? Are they actual claims/values the persona holds, not noise?
- Do edges represent real causal relationships from the text?
- Are `grounding` arrays populated with real corpus chunk IDs?
- Do edges with multiple `sourceChunks` represent claims the persona has made repeatedly (higher confidence)?
- Are there any contradictory beliefs flagged (same cause/effect, opposite polarity)? Those are interesting — genuine ambivalence in the persona's writing.
- Is the node count proportional to corpus size? Citrini (120 entries) → 739 nodes. Citadel (8 entries) → 64 nodes. Reasonable.

**Known weaknesses:**
- No topic scoping — this is the full belief graph across all topics
- Concept normalization is basic (`toLowerCase().trim()`) — may miss synonyms
- Node types (core_value, factual_claim, inference, assumption) are Haiku's judgment, not verified

---

## Stage 2: Topic-Scoped QBAF from Belief Graph

**Goal:** Given a topic, filter the raw belief graph down to relevant triples and restructure them into a QBAF tree (root → depth-1 → depth-2) with evidence-derived base scores.

**What needs to change:**
The current `extractQBAF()` ignores the belief graph entirely — it asks Sonnet to generate arguments from corpus text. Instead:

1. Load `BeliefGraph` from `data/seed/beliefs/{Name}.json`
2. Filter: Haiku selects the triples most relevant to the debate topic
3. Identify root: the triple whose effect is closest to the topic claim
4. Build tree: root → depth-1 (triples that attack/support root) → depth-2 (triples that attack/support depth-1)
5. Base scores from evidence density, not LLM vibes:
   ```
   τ = f(sourceChunk_count, extraction_confidence, engagement_metrics, recency)
   ```
6. DF-QuAD computes σ (unchanged)

**Script:** Modified `scripts/extract-qbafs-only.ts` or new script

**Output:** `data/experiments/{slug}/qbaf-{persona}.json`

**What to inspect:**
- Does every QBAF node map to a real belief graph triple?
- Are the base scores (τ) differentiated? A claim backed by 5 independent tweets should have higher τ than one mentioned once.
- Does the root claim actually represent the persona's core position on this topic?
- Is the tree structure natural, or forced? If the belief graph has no depth-2 connections for a given depth-1 node, that's fine — not every argument needs sub-arguments.
- Compare to the current Sonnet-generated QBAFs: are the claims more specific? More grounded? Less generic?

**Key design question:** What happens when the belief graph has too few topic-relevant triples for a full tree? Options:
- Accept smaller trees (honest)
- Supplement with LLM-generated arguments, flagged as `grounding: ["synthetic"]` with capped τ
- Augment with contract `anchorExcerpts`

---

## Stage 3: Community Graph (no debate rounds)

**Goal:** Merge two standalone QBAFs and identify where they disagree, *before* any debate happens. This is the "pre-debate snapshot" — what do they agree on, what do they disagree on, just from their writing?

**What to build:**
- Extract QBAF A and QBAF B (stage 2)
- Run `buildCommunityGraph(qbafA, qbafB)` directly — skip debate rounds
- Run `identifyCruxes(communityGraph, qbafA, qbafB)`

**Script:** `scripts/extract-community-graph.ts`

**Output:** `data/experiments/{slug}/community.json`, `cruxes.json`, both QBAFs

**What to inspect:**
- How many nodes got merged (semantic dedup)? If 0, the personas are talking past each other. If many, they're engaging the same claims.
- Are crux-classified nodes (variance > 0.3) genuine disagreements? Read the claims — does one persona really believe this and the other really doesn't?
- Are consensus nodes (variance < 0.1) real agreement? With evidence-density τ, this becomes more meaningful — both personas wrote about this claim with similar frequency/confidence.
- Do the settling questions make sense? Would answering them actually resolve the disagreement?
- Crux count: 0 = something wrong. 10+ from 20 nodes = threshold too loose.

**Why this stage matters:**
If the community graph can't find meaningful cruxes from standalone QBAFs, debate rounds won't fix that — they'll just add noise. Pre-debate crux quality is a litmus test.

---

## Stage 4: Single Debate Round

**Goal:** Both personas read each other's QBAF and respond. Do the responses target real weaknesses, or just generate generic counterpoints?

**What to build:**
- After community graph (stage 3), run exactly 1 debate round
- Each persona reads opponent's serialized QBAF, generates 1-3 attacks/supports
- Apply moves to opponent's graph, recompute DF-QuAD

**Script:** Add `--rounds 1` to experiment script

**Output:** `round-0-*.json` (pre-debate), `round-1-*.json` (post-debate)

**What to inspect:**
- Do debate moves target specific opponent nodes, or generic topics?
- Are `targetNodeId` values valid?
- Do attacks actually challenge the claim they target?
- How much does σ(root) change? 0.00 = no impact. > 0.2 = devastating attack.
- Compare pre-debate and post-debate community graphs: did new cruxes emerge?

**Note:** Debate moves are LLM-generated reasoning (not corpus-derived). This is correct — debate is about *reasoning about the opponent's evidence*, not reciting your own.

---

## Stage 5: Belief Revision

**Goal:** After debate moves, personas update their base scores. Does revision produce sensible results?

**Current approach:**
1. Haiku picks target σ* (context-free — doesn't know persona's stubbornness)
2. CE-QArg iteratively adjusts τ to reach σ*

**What to inspect:**
- Does target σ* feel right? Collapse to 0 = unmoored. Barely moves = too conservative.
- Which nodes had τ adjusted? The right ones (directly impacted by attacks)?
- `totalShift` (Σ|Δτ|) per round: < 0.05 conservative, > 0.5 extreme
- Run 2-3 rounds: does σ(root) drift toward reasonable value, or oscillate/collapse?

**The big risk:** σ* is context-free. Both personas revise identically. If this looks bad, implement persona-modulated revision (stage 7).

---

## Stage 6: Full Experiment Loop

**Goal:** Multi-round debate + revision + convergence + community graph + cruxes + benchmarks.

**Script:** `npx tsx scripts/run-belief-experiment.ts --topic "..." --personas "Citrini,Citadel" --rounds 5`

**Output:** Full experiment directory with per-round QBAFs, community graph, cruxes, benchmarks

**What to inspect:**
- Convergence: did root strengths stabilize? How many rounds?
- Benchmarks:
  - RSD: how much did each persona's position change?
  - ΔSD: did they converge or diverge?
  - BRC: who revised more?
  - CLR: % crux nodes (5-20% healthy, >50% too loose)
  - CS: does removing top crux actually matter?
- Are settling questions concrete and central?

---

## Stage 7 (future): Persona-Modulated Belief Revision

**Goal:** Personas revise differently based on their contract.

```
σ_target = σ_previous + (1 - R) × (σ_raw - σ_previous)

R = revision resistance from:
  - epistemology (empiricist → low R, dogmatic → high R)
  - flipConditions (triggered → R drops to ~0.1)
  - evidencePolicy (attack uses accepted sources → lower R)
  - stakes (high → higher R)
```

**Why deferred:** Stage 5 needs to work first. If σ* is fundamentally broken, persona modulation makes it worse.

---

## Current Status

| Stage | Status | Notes |
|-------|--------|-------|
| 1. Belief graph extraction | ✅ Done | Citrini: 739 nodes / 386 edges. Citadel: 64 / 39. |
| 2. Topic-scoped QBAF from belief graph | ✅ Done | `extract-qbaf-from-beliefs.ts` — edges classified by Haiku, tree built, base scores from evidence density |
| 3. Community graph (no debate) | ✅ Done | Batch comparison, opposition detection, 4 cruxes + 4 consensus found |
| 4. Single debate round | ✅ Done | 6 targeted attacks generated, specific + substantive, Δσ small (0.0001/0.0015) |
| 5. Belief revision | ✅ Done | CE-QArg works. Citrini: 1.000→0.944, Citadel: 0.893→0.726. σ* context-free, Citrini under-revised. |
| 6. Full experiment | ✅ Done | 3 rounds, 90s, 5 cruxes. Both σ decayed (Citrini 1.0→0.64, Citadel 0.89→0.28). No convergence. |
| 7. Persona-modulated revision | ✅ Done | R from contract (epistemology+stakes+flipConditions). Citadel: 0.283→0.428 (fixed collapse). |

**All 7 stages complete.** Pipeline runs end-to-end in ~114s for 3 rounds.

### Stage 2 Run Results (2026-03-01)

Topic: "Will AI cause net job losses in the next decade?"

**Citrini:** 16 nodes (1+5+10), 15 edges (15 support, 0 attack), root σ = 1.000
- Root: "AI will cause significant net job losses...driven by a self-reinforcing cycle of automation"
- All supports — persona is very convicted. Claims like "Fortune 500 clients cutting 15% of workforce", "layoffs due to human obsolescence → margin expansion"
- Base scores: 0.530–0.700 (narrow range — most edges have similar confidence + 1 source chunk)

**Citadel:** 16 nodes (1+5+10), 15 edges (13 support, 2 attack), root σ = 0.893
- Root: "AI will not cause net job losses...productivity gains will generate new demand"
- 2 attacks: "elasticity of substitution → labor share collapse" and "redistribution failure → structural demand fall"
- Supports include: "rising software engineer postings up 11% YoY", compute/energy/regulatory constraints limiting automation

**Known issues:**
- Citrini QBAF has 0 attacks — Haiku over-classified everything as supporting the root thesis
- Base score range is narrow (0.53–0.70) because most belief edges have 1 source chunk and similar extraction confidence
- Depth-2 parent assignment is heuristic (word overlap) — could be improved with semantic similarity

### Stage 6 Run Results (2026-03-02)

Topic: "Will AI cause net job losses in the next decade?" | 3 rounds | 90.4s | 60K in / 10K out

**Trajectories:**
- Citrini: σ 1.000 → 0.958 → 0.718 → 0.639 (Δ = −0.361)
- Citadel: σ 0.893 → 0.723 → 0.528 → 0.283 (Δ = −0.610)

**Benchmarks:**
- RSD: Citrini 0.361, Citadel 0.610
- ΔSD: +0.124 (diverged)
- BRC: Citrini 0.520, Citadel 0.316
- CLR: 35.3% (12/34 community nodes are cruxes)
- AC: 1.06 (community covers initial arguments)
- GGR: 1.56x both (18 debate nodes added per side)
- CS: 0.639 (top crux has massive counterfactual impact)
- DFS: ✓ flipped (top crux genuinely decisive)
- Convergence: did not converge in 3 rounds

**5 structural cruxes identified** with concrete settling questions.

**Critical issue: Double-descent.** Both personas' root σ monotonically decays because:
1. Debate rounds only add attacks (no defensive supports)
2. CE-QArg revision always reduces conviction in response to attacks
3. No mechanism to strengthen own position or generate counterattacks to incoming attacks
4. Citadel collapsed to 0.283 — unrealistically low for a position with real evidence

**Stage 7 (persona-modulated revision) addresses the double-descent:**

With R ≈ 0.15-0.18 (both personas are epistemically open, flip conditions triggered):
- Citrini: 1.000 → 0.966 → 0.762 → 0.639 (same endpoint, smoother path)
- Citadel: 0.893 → 0.744 → 0.606 → 0.428 (0.283 → 0.428 = fixed collapse)
- ΔSD: 0.124 → 0.052 (less divergence)
- R reasoning cites specific contract properties (epistemic openness, stakes, flip conditions)

**Remaining double-descent mitigation**: personas still only receive attacks, never generate defensive supports. A future enhancement would allow each persona to strengthen their own nodes in response to attacks (not just weaken in the direction of σ*).

---

### Stage 5 Run Results (2026-03-02)

**Citrini** (pro job losses): σ trajectory 1.000 → 1.000 → 0.944
- Target σ* = 0.80 (Haiku), actual post-revision σ = 0.944 (didn't reach target)
- All 15 own nodes had τ reduced (−0.33 to −0.50), 3 opponent attack nodes boosted (+0.25 to +0.33)
- Total shift Σ|Δτ| = 6.67 — heavy revision but still under-revised
- CE-QArg hit iteration limit before reaching target

**Citadel** (anti job losses): σ trajectory 0.893 → 0.891 → 0.726
- Target σ* = 0.72 (Haiku), actual post-revision σ = 0.726 (close to target)
- More responsive to attacks — Haiku judged Citrini's attacks as more compelling
- Total shift Σ|Δτ| = 4.46

**Observations:**
- Stance divergence widened: |σA − σB| = 0.107 (pre) → 0.219 (post-revision)
- BRC asymmetry: Citadel revised 3× more than Citrini
- Citrini's all-support QBAF structure (0 attacks from Stage 2) makes CE-QArg less effective — with only positive-polarity nodes, every node adjustment fights against the others
- The context-free σ* concern is validated: both personas get similar treatment but respond very differently based on graph structure

---

## Decision Points

| Stage | Question | If No |
|-------|----------|-------|
| 1 | Are belief graph triples grounded and sensible? | Re-run extraction with better prompts or chunking |
| 2 | Do topic-scoped QBAFs reflect what the persona actually wrote? | Adjust topic filtering or tree-building logic |
| 3 | Does the community graph find real disagreements? | Check similarity threshold, topic scope |
| 4 | Do debate moves target real weaknesses? | Improve debate prompt, maybe inject opponent's corpus |
| 5 | Does belief revision produce sensible updates? | Jump to stage 7 (persona-modulated revision) |
| 6 | Do benchmarks tell a coherent story? | Diagnose which upstream stage is producing bad data |
