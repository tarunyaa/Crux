# Belief Graph Debate: Algorithm Pseudocode

## Overview

A graph-driven debate system that extracts structured belief graphs from personas,
compares them structurally to find genuine disagreements, and identifies the most
pivotal crux points. No LLM hallucination — all outputs are derived from actual
persona beliefs and mathematical computation.

## References

- Rago et al. 2016 — DF-QuAD semantics (dialectical strength computation)
- Kampik, Potyka et al. 2024 — Contribution functions for QBAFs (arxiv 2401.08879)
- Multi-Agent QBAF Combinator (arxiv 2510.24303) — merge constraints, δ=0.5 threshold
- CE-QArg (arxiv 2407.08497) — polarity module, counterfactual explanations

---

## Phase 0: Belief Graph Extraction (offline, per persona)

```
INPUT: persona corpus (tweets, essays, scraped text)
OUTPUT: BeliefGraph = { nodes: BeliefNode[], edges: BeliefEdge[] }

For each persona P:
  1. Feed corpus to LLM → extract (subject, predicate, object) triples
  2. Each triple becomes a BeliefNode with:
     - claim: string (the assertion)
     - confidence: float ∈ [0,1]
  3. Each relationship becomes a BeliefEdge with:
     - source → target
     - type: 'causal' | 'evidential' | 'analogical'
     - polarity: 'positive' | 'negative'
  4. Save to data/seed/beliefs/{PersonaName}.json
```

## Phase 1: Topic-Scoped QBAF Extraction (per persona, parallel)

```
INPUT: BeliefGraph, topic string
OUTPUT: PersonaQBAF = tree-structured argumentation framework

For each persona P (run in parallel):
  1. DECOMPOSE topic into 4-6 aspects via LLM
     e.g., "Will AI cause job losses?" → [economic, social, technical, policy, ...]

  2. For each aspect:
     FILTER belief graph edges by relevance to this aspect (LLM call)
     Keep edges with relevance > 0.5

  3. MERGE filtered edges across all aspects, deduplicate

  4. BUILD QBAF tree:
     - Root node: the topic claim
       τ(root) = persona's overall confidence from their belief graph
     - Depth-1 nodes: key sub-arguments (pro and con)
       τ(node) = evidence-density score from matching belief graph triples
     - Depth-2 nodes: supporting evidence / counter-evidence
       τ(node) = derived from belief graph edge confidence
     - Edges: support (pro→root, evidence→pro) or attack (con→root, counter→pro)
       weight = belief graph edge strength

  5. COMPUTE dialectical strengths via DF-QuAD (bottom-up):

     For each node in topological order (leaves first):
       If leaf: σ(node) = τ(node)      // strength = base score
       Else:
         attackAgg  = 1 - Π(1 - σ(attacker_i) × w_i)    // independence aggregation
         supportAgg = 1 - Π(1 - σ(supporter_i) × w_i)

         If attackAgg > supportAgg:
           σ(node) = τ(node) - τ(node) × (attackAgg - supportAgg)     // pulled toward 0
         If supportAgg > attackAgg:
           σ(node) = τ(node) + (1-τ(node)) × (supportAgg - attackAgg) // pulled toward 1
         If equal:
           σ(node) = τ(node)

     Node claims are standalone assertions, NOT edge descriptions.
     WRONG: "AI automation causes/supports job displacement"
     RIGHT: "job displacement, driven by AI automation"
```

## Phase 2: Pairwise Structural Diffs (nC2 pairs, parallel)

```
INPUT: N persona QBAFs
OUTPUT: PairwiseDiff[] (one per pair)

For each pair (P_a, P_b):
  1. Send all claims from both QBAFs to LLM (single Haiku call):
     "Find pairs discussing the same topic. Classify: agreement/opposition/related"
     Return: { indexA, indexB, relationship, confidence, sharedTopic }

  2. Filter: keep only matches with confidence > 0.5

  3. Partition into:
     - contradictions: relationship == 'opposition'
     - agreements: relationship == 'agreement'
     - gaps: nodes in one QBAF with no match in the other
```

## Phase 3: Community Graph Construction

```
INPUT: N persona QBAFs, all pairwise mappings
OUTPUT: CommunityGraph with merged nodes and crux classifications

  1. COLLECT all pairwise claim mappings from Phase 2

  2. SORT mappings by confidence (highest first)

  3. BUILD node depth lookup (for root guard)

  4. UNION-FIND MERGE with guards:
     For each mapping (sorted by confidence):
       a. ROOT GUARD: if either node has depth == 0, SKIP
          (root nodes are objects of comparison, not merge candidates)

       b. SIZE GUARD: if group(nodeA).size + group(nodeB).size > 5, SKIP
          (prevents transitive snowball into mega-groups)

       c. MERGE: union(nodeA, nodeB)

       d. Track best sharedTopic per group (highest confidence)
       e. Track strongest relationship signal per group
          (opposition > related > agreement)

  5. BUILD community nodes from groups:
     For each group:
       - Collect base scores from all personas who have a node in this group
       - Compute variance across personas' base scores

       Claim text:
         If single member → use original claim
         If agreement → use first claim
         If has sharedTopic → use sharedTopic (NOT concatenation of all claims)
         Fallback → join max 2 unique claims with " vs. "

       Classification:
         If relationship == 'opposition' → CRUX
         If relationship == 'related' AND (variance > 0.3 OR baseScoreSpread > 0.3) → CRUX
         If variance > cruxThreshold → CRUX
         If variance < consensusThreshold → CONSENSUS
         Else → NEUTRAL

  6. REMAP edges to community node IDs (deduplicate)
```

## Phase 4: Belief Revision

```
INPUT: persona QBAFs, pairwise diffs (contradictions)
OUTPUT: revised QBAFs with adjusted base scores

For each persona P:
  1. COLLECT all contradicting claims from other personas' diffs

  2. If no contradictions: skip (cost = 0, no revision needed)

  3. DETERMINE target strength via LLM:
     Feed: current QBAF, contradicting claims, persona contract
     Ask: "Given these counter-arguments, what should the root strength be?"
     Output: target σ, revision resistance R, reasoning

  4. REVISE base scores:
     Compute minimal Δτ adjustments that move σ(root) toward target
     Apply adjustments, track total cost = Σ|Δτ_i|

  5. RECOMPUTE DF-QuAD strengths with new base scores
```

## Phase 5: Crux Identification

```
INPUT: CommunityGraph, all persona QBAFs
OUTPUT: ranked list of StructuralCrux objects

For each community node classified as CRUX:

  1. COUNTERFACTUAL IMPACT (per persona):
     For each persona P:
       impact_P = |σ(root) - σ(root | node removed)|
       // How much would removing this argument change the persona's root strength?

  2. GRADIENT SIGN (per persona):
     // Reference: arxiv 2401.08879 contribution functions
     For each persona P:
       Bump τ(node) by ε=0.01
       Recompute σ(root)
       gradient_P = sign(σ_bumped(root) - σ_original(root))
       // +1: increasing this node's belief STRENGTHENS the persona's root
       // -1: increasing this node's belief WEAKENS the persona's root

  3. CRUX SCORE:
     impactDelta = |max(impacts) - min(impacts)|
     multiPersonaBonus = 0.1 if merged from 2+ persona nodes
     gradientBonus = 0.3 if any persona has gradient +1 AND any has -1
       // Opposite gradients = strongest crux signal:
       // same claim structurally supports one persona's position
       // but undermines another's
     cruxScore = impactDelta + multiPersonaBonus + gradientBonus

  4. DISAGREEMENT TYPE:
     hasBaseScoreDiff = variance(base scores across personas) > 0.05
     hasEdgeDiff = impactDelta > 0.01 OR hasOppositeGradients
     type = BOTH if both, BASE_SCORE if only base, EDGE_STRUCTURE if only edge

  5. SETTLING QUESTION (LLM):
     Generate a precise, evidence-answerable question
     that would resolve this specific disagreement.

Sort crux candidates by cruxScore DESC, take top 5.
```

## Phase 6: Benchmarks

```
INPUT: initial QBAFs, final QBAFs, revisions, community graph, cruxes
OUTPUT: BenchmarkMetrics

Metrics computed:

  RSD (Root Strength Delta):
    Per persona: |σ_final(root) - σ_initial(root)|
    Higher = debate had more impact on this persona's position

  ΔSD (Stance Divergence):
    Change in spread between all personas' root strengths
    Positive = positions diverged, negative = converged

  BRC (Belief Revision Cost):
    Per persona: Σ|Δτ_i| / |nodes|
    Average base score change across all nodes
    Lower = more rational/minimal revision

  CLR (Crux Localization Rate):
    |crux nodes| / |total community nodes|
    Target: 10-30%. Too low = no disagreement. Too high = everything is a crux.

  AC (Argument Coverage):
    |community nodes| / (N × |average persona nodes|)
    How much overlap exists between personas' arguments

  CS (Counterfactual Sensitivity):
    |Δσ(root)| when top crux is hypothetically removed
    Higher = identified crux genuinely matters

  DFS (Decision Flip Score):
    Would removing the top crux flip any persona's stance?
    (σ from >0.5 to <0.5 or vice versa)
```

## Data Flow Summary

```
Persona Corpus
    ↓ (offline LLM extraction)
Belief Graph (per persona)
    ↓ (topic-scoped filtering + DF-QuAD)
QBAF (per persona)
    ↓ (pairwise LLM comparison)
Structural Diffs (nC2 pairs)
    ↓ (union-find with guards)
Community Graph (merged nodes)
    ↓ (counterfactual + gradient analysis)
Structural Cruxes (ranked)
    ↓ (LLM settling questions)
Final Output
```

## Key Invariants

1. **No hallucinated cruxes**: If no community nodes qualify as crux, return empty list.
   The UI shows "No cruxes identified" rather than making something up.

2. **Root nodes never merge**: Persona root claims are the subject of comparison,
   not candidates for equivalence. Merging roots would destroy the debate structure.

3. **Group size capped at 5**: Prevents transitive snowball where
   A~B, B~C, C~D chains create one mega-group.

4. **Gradient sign > impact magnitude for crux detection**: Two personas having
   opposite structural sensitivity to a claim (one is strengthened, one is weakened)
   is a stronger crux signal than raw impact difference.

5. **Claim text is clean**: QBAF node claims are standalone assertions.
   Edge types (support/attack) are structural, not encoded in text.
