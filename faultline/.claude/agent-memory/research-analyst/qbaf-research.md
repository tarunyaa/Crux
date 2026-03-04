# QBAF Research: Multi-Agent Merging, Pivotal Arguments, Claim Normalization

## Researched: 2026-03-04

---

## Q1: Multi-Agent QBAF Merging

### Primary Source
"Retrieval- and Argumentation-Enhanced Multi-Agent LLMs for Judgmental Forecasting" (arxiv 2510.24303, 2024)
- Multi-Agent QBAF Combinator module is the only published paper with a concrete algorithm for merging independently-generated QBAFs.

### Algorithm 1 (Multi-Agent QBAF Combinator)
- Embedding model: Jina-V3, similarity metric: cosine similarity
- Threshold δ = 0.5 for merging arguments into same cluster
- Bottom-up, layer-by-layer clustering (NOT union-find)
- Hard merge constraint: arguments only clustered if they (a) share a parent AND (b) have same relation type (support or attack) to that parent
- Never clusters arguments with different parents or opposite relations to same parent
- After clustering, base scores aggregated via user-specified function (average or maximum)

### Transitive Merging Problem
- The paper avoids transitivity by construction: pairwise constraint (same parent + same relation) prevents chain-merging
- Union-find without this constraint can create "mega-groups" where semantically disparate arguments get merged because A~B and B~C even if A≁C
- The Faultline `buildCommunityGraph` uses union-find with a MAX_GROUP_SIZE cap (5) — this is a practical heuristic but less principled than the parent-relation constraint

### Related Prior Work on Merging
The paper cites three prior approaches (without specific paper names found in accessible text):
1. Alignment pipeline: align frameworks to common domain + minimal edit distance operators + extension voting → group consensus
2. Weighted approach: embed relative disagreement strengths → single weighted AF
3. Selection-based: keep arguments/attacks from agents that vary least from others

### Practical Recommendation for Faultline
The current LLM batch comparison approach in `batchCompareQBAFs` handles semantic equivalence well (LLM understands paraphrase), but the union-find merge step would benefit from adding: "only merge nodes that have the same structural role (depth/relation-type to their parent)" as an additional guard against over-merging at depth 0 (root claims should never be merged across personas).

---

## Q2: Pivotal Argument Identification

### Three Algorithmic Families

**A. Removal-Based Argument Attribution Explanations (AAEs)**
- Formula: φ^σ_α(β) = σ(α) - σ_{A\{β}}(α)
  - Remove argument β and all its edges; recompute σ(α) on the smaller graph
  - Score = absolute change in topic argument's strength
- Fast, O(n) graph evaluations for n arguments
- Source: "Argument Attribution Explanations in Quantitative Bipolar Argumentation Frameworks" (arxiv 2307.13582), "Applying Attribution Explanations in Truth-Discovery QBAFs" (arxiv 2409.05831)
- Faultline's `counterfactualImpact` in `lib/belief-graph/df-quad.ts` IS this function — correctly implemented

**B. Shapley-Based AAEs**
- Formula: ψ^σ_α(β) = Σ_{U⊆A\{α,β}} [(|A\{α}|-|U|-1)!|U|! / |A\{α}|!] × [σ_{U∪{β}}(α) - σ_U(α)]
  - Game-theoretic average marginal contribution across all coalitions
- Approximated via Monte Carlo sampling (1000 samples standard in literature)
- More robust than removal-based for highly connected graphs where removal order matters
- Computationally expensive: O(n × N_samples × T) where T is one DF-QuAD pass

**C. Gradient-Based (Sensitivity Analysis)**
- Computes ∂σ(root)/∂τ(node) — partial derivative of root strength w.r.t. node's base score
- Referenced in literature as "gradient-based contribution functions" (Yin et al. 2023)
- For DF-QuAD semantics: can be computed analytically for acyclic graphs (composition of differentiable functions)
- Captures "if I were slightly more/less certain of this claim, how much would it move my root?"
- Useful for belief revision scenarios; not directly implemented in Faultline

**D. Counterfactual Explanation Approach (CE-QArg, KR 2024)**
- Paper: arxiv 2407.08497
- Polarity module: DFS to enumerate non-cyclic paths; count attack edges on each path (even = positive influence, odd = negative)
- Priority module: priority(β→α) = 1 / min_path_length(β→α); self-priority = constant c > 1
- Update rule: τ*(α) ← max(0, min(1, τ*(α) + update[α] × ε × priority[α]))
- Iterates until σ(topic) reaches desired value — useful for "what would it take to flip this crux?"

**E. Strength Inconsistency Explanations (arxiv 2509.18215)**
- Defines "sufficient/necessary/counterfactual" explanations for when argument ranking reverses
- Pivotal argument = argument appearing in all minimal counterfactual explanation sets
- Heuristic search via QBAF reversal operation
- Applied to cross-QBAF comparison (when two personas' QBAFs are compared)

### Principle-Based Survey
"Contribution Functions for Quantitative Bipolar Argumentation Graphs" (arxiv 2401.08879, Kampik, Potyka et al. 2024):
- No single contribution function satisfies all desirable principles
- Selection depends on use case: removal-based = simple/interpretable, Shapley = theoretically fair, gradient = sensitivity analysis

### Practical Recommendation for Faultline
For crux identification: the current `identifyCruxes` function correctly uses removal-based counterfactual impact. The crux score = |impact_A - impact_B| is sound but could be enhanced:
1. Add gradient-based sensitivity: for each community crux node, compute ∂σ(root_A)/∂τ(node) and ∂σ(root_B)/∂τ(node) — their sign difference reveals whether personas have opposite sensitivity to the same claim
2. The CE-QArg polarity module (even/odd path attack counting) would improve the `disagreementType` classification by revealing whether a node is positively or negatively influencing each persona's root

---

## Q3: Claim Normalization

### What the Literature Actually Says
No published paper defines a QBAF-specific claim text normalization standard. The field has converged on a different approach.

### Consensus Approach: LLM-Based Comparison, Not String Matching
- ArgRAG (arxiv 2508.20131): argument nodes = raw natural language; no preprocessing; LLM classifies relations directly
- Relation-based AM (arxiv 2402.11243): entity masking noted as future work but not implemented; LLMs handle variation holistically
- Multi-Agent QBAF Combinator (arxiv 2510.24303): embeddings (Jina-V3) used for similarity; threshold δ=0.5; no text preprocessing step described

### Edge-Type Separation from Claim Content
- The QBAF literature uniformly treats edge type (attack/support) as a separate structural relation, NOT encoded in node text
- Faultline's type system correctly separates these: `QBAFNode.type: 'root' | 'pro' | 'con'` (claim content) vs. `QBAFEdge.type: 'attack' | 'support'` (relation)
- The problematic pattern to avoid: encoding "X does NOT support Y" in the claim text of a node that is also a support edge
- In `extractQBAF`, nodes have claim text that is direction-neutral (the edge carries the polarity) — this is architecturally correct

### Practical Normalization for Embedding-Based Comparison
For the `batchCompareQBAFs` LLM approach:
1. Strip leading/trailing whitespace and collapse internal whitespace — minimal normalization
2. Do NOT lowercase or strip punctuation before sending to LLM — the LLM handles this better than rule-based stripping
3. If using embedding similarity as a pre-filter (before LLM comparison), then standard embedding preprocessing applies: lowercase, remove special characters, but this is only for the embedding step not the displayed claim text
4. The `sharedTopic` field correctly acts as a normalized canonical label for cross-persona groups — using this as the community node's `claim` text is the right approach

### Key Anti-Pattern
Do not embed edge polarity into claim text. Example of anti-pattern:
- Claim: "AI will NOT cause net job losses" (negation encoded in text) + edge type: support
This creates ambiguity in community merging — a persona claiming "AI will cause net job losses" (no negation) + edge type: attack would be misidentified as a different topic when compared by text similarity.
The correct representation: claim = "AI will cause net job losses" + edge type: attack OR support (persona-specific).
