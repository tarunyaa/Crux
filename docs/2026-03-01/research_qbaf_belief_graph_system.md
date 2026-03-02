
# Research: QBAF + ArgLLM + Belief Revision for Debate System Design

**Research date:** March 1, 2026
**Task:** Comprehensive synthesis for designing a belief graph debate system
**Topics:** ArgLLM, QBAF semantics, belief revision, framework merging, benchmarking

---

## Research Summary

The QBAF + ArgLLM ecosystem is the most mature, implementable path for building a structured argumentation layer on top of the existing Faultline debate engine. The core pipeline is validated and publicly available (github.com/CLArg-group/argumentative-llms): LLMs generate pro/con arguments, assign base confidence scores, a QBAF is constructed, DF-QuAD semantics propagate strength through the graph, and a final verdict with full explanation trace is produced. This pipeline maps directly onto Faultline's crux card extraction step.

For belief revision, the field offers two practical mechanisms: the CE-QArg iterative algorithm for finding minimal counterfactual changes to QBAF base scores, and the Potyka et al. (KR 2024) open-mindedness/conservativeness balance framework. The former tells you *what changed* during a debate; the latter gives a principled update rule for *how much to change*. Neither requires fine-tuning or model weight access — both work over the QBAF graph structure.

Multi-framework merging has two validated approaches: MArgE's semantic merging via sentence-transformer cosine similarity (simple and API-compatible), and ARGORA's contextual orthogonality filter (tree-based, avoids redundancy). Neither produces a perfect "community graph" in one shot — crux identification requires a post-merge step comparing per-persona root strengths.

Benchmarking argumentation quality is an underspecified problem. The most actionable metrics for Faultline are: strength-change delta (ΔSD-style), argument coverage ratio, and crux card contestability score. The ArgQuality datasets (IBM-Rank-30k, IBM-ArgQ-5.3k) provide human-labeled data for calibrating claim quality, but they are single-turn — not applicable to multi-round dialogue directly.

---

## Key Findings

1. **QBAF has a fully specified, implementable math.** DF-QuAD is the semantics of choice — it avoids the discontinuity problem of QuAD, satisfies monotonicity, and has a closed-form two-step update: aggregate attacker/supporter strengths via a product formula, then combine with base score. The full formula is reproducible from paper (see Detailed Analysis section 1).

2. **ArgLLMs pipeline is a 3-stage deterministic process.** Stage 1: LLM generates BAF (arguments + relations, no scores). Stage 2: LLM assigns base scores τ(α) ∈ [0,1] per argument. Stage 3: DF-QuAD applied to produce σ(α) for every argument. The root argument's σ value is the claim verdict. This is the direct blueprint for Faultline crux card scoring.

3. **ArgRAG extends ArgLLMs with retrieval.** Instead of generating arguments from memory, ArgRAG retrieves k documents, classifies each as supporting/attacking/irrelevant, then runs QE semantics over the resulting QBAF. Outperforms all RAG baselines on PubHealth (0.838–0.898 accuracy) and is robust to noisy retrieved documents — the QBAF structure filters noise structurally rather than requiring clean retrieval.

4. **ARGORA introduces counterfactual interventions on QBAFs.** By modeling the QBAF as a Structural Causal Model, ARGORA can compute edge-local interventions: "what if this argument were removed?" The impact metric Δ_edge(x; m) = σ(m) − σ^⊖x(m) directly measures each argument's contribution. This is the mathematical basis for identifying *why* a crux exists.

5. **CE-QArg provides a practical belief revision algorithm.** Given a QBAF and a desired new strength for the root argument (the topic/claim), CE-QArg computes the minimal set of base score changes needed. The algorithm uses polarity analysis (path parity) + priority weighting (inverse path length) + iterative step-size adjustment. This maps to: "given that persona A changed their mind after round 3, which arguments account for that change?"

6. **MArgE's semantic merging is the simplest practical approach for multi-agent QBAF combination.** Two modes: (a) simple union of all argument nodes, (b) semantic deduplication via sentence-transformer cosine similarity threshold. Mode (b) produces a merged QBAF with reduced redundancy. This is a viable approach for building a community graph from per-persona QBAFs.

7. **ARGORA does NOT merge QBAFs.** It maintains parallel per-expert trees and uses an orchestrator judgment layer. This is a design choice, not a limitation — it preserves interpretability by avoiding the semantic conflicts that arise from merging heterogeneous belief graphs.

8. **AGM postulates for argumentation are a formal soundness guarantee, not an algorithm.** Six rationality postulates (AE1–AE6) define what any "rational" revision of an argumentation framework must satisfy. The key postulate for Faultline: revision must produce minimal change to argument statuses. This is satisfied by CE-QArg's L_p norm minimization.

9. **Argument quality has three canonical dimensions (cogency, rhetoric, reasonableness) and two good benchmarks.** IBM-Rank-30k and IBM-ArgQ-5.3k are the standard datasets. For debate systems specifically, the DEBATE benchmark (arXiv:2510.25110) measures position divergence (ΔSD) — which is what Faultline cares about most: are personas actually holding distinct positions?

10. **Contestability is a first-class property of a well-designed QBAF system.** Argumentation frameworks are contestable when users can modify argument structures and observe changed outcomes. Faultline's crux cards should expose base scores, relation structure, and sensitivity — enabling users to challenge the derived verdict structurally, not just rhetorically.

---

## Detailed Analysis

### 1. QBAF: Formal Definition and DF-QuAD Semantics

A QBAF is a 4-tuple: **Q = ⟨𝒜, R⁻, R⁺, τ⟩**

- **𝒜**: finite set of arguments (e.g., "Bitcoin enables financial freedom", "Bitcoin wastes energy")
- **R⁻ ⊆ 𝒜 × 𝒜**: directed attack relations (α, β) means α attacks β
- **R⁺ ⊆ 𝒜 × 𝒜**: directed support relations (α, β) means α supports β
- **τ: 𝒜 → [0,1]**: base score function; τ(α) is the intrinsic strength of argument α in isolation

For each argument α, define:
- **S⁻(α)** = set of arguments that attack α (its attackers)
- **S⁺(α)** = set of arguments that support α (its supporters)

**DF-QuAD Semantics (Rago et al.):**

Step 1 — Aggregation function F (applied separately to attackers and supporters):
```
F(v₁, ..., vₙ) = 0                           if n = 0
F(v₁, ..., vₙ) = 1 - ∏ᵢ (1 - vᵢ)            if n ≥ 1
```

The product formula has a probabilistic interpretation: it computes "at least one attacker is effective" assuming independent attackers.

Step 2 — Combination function C (given base score v₀, aggregated attack vₐ = F(S⁻(α)), aggregated support vₛ = F(S⁺(α))):
```
if vₐ = vₛ:   σ(α) = v₀
if vₐ > vₛ:   σ(α) = v₀ - v₀ · |vₛ - vₐ|
if vₐ < vₛ:   σ(α) = v₀ + (1 - v₀) · |vₛ - vₐ|
```

Interpretation: Attack reduces σ proportionally to how much more attack exceeds support. Support raises σ proportionally to the gap between support and attack, but is bounded by (1 - v₀) so stronger arguments have less room to improve.

**Key properties:**
- Monotonicity: adding a new attacker never increases σ; adding a new supporter never decreases σ
- Boundedness: σ(α) always remains in [0,1]
- Discontinuity-free: small perturbations produce small changes (unlike QuAD)

**Iteration:** For graphs with cycles or depth > 1, apply the DF-QuAD update iteratively until convergence. For tree-structured QBAFs (ARGORA's approach), computation is bottom-up in one pass — O(n) where n = number of arguments.

**Alternative semantics:**
- **QE (Quadratic Energy):** Used by ArgRAG. Update formula: σ(α) ← β(α) + (1−β(α))·h(E(α)) − β(α)·h(−E(α)) where E(α) = Σσ(supporters) − Σσ(attackers) and h(x) = max(x,0)² / (1 + max(x,0)²). Less interpretable than DF-QuAD but handles bidirectional evidence-evidence relations well.
- **Euler-based:** σ(α) = 1/(1 + e^{−f(v₀, vₐ, vₛ)}); smooth and differentiable but harder to interpret for explainability.

**Implementation recommendation for Faultline:** Use DF-QuAD for crux cards (interpretable, tree-structured graphs with depth ≤ 3), QE for ArgRAG-style retrieval-backed fact checking if that feature is built.

---

### 2. ArgLLMs: The 4-Stage Pipeline in Detail

**Paper:** Freedman, Dejl, Gorur, Yin, Rago, Toni — AAAI 2025, arXiv:2405.02079
**Code:** github.com/CLArg-group/argumentative-llms (public)

The pipeline is a function composition: `f_ArgLLM(x) = g ∘ Σ_σ ∘ ℰ_E ∘ Γ_G(x)`

**Stage 1 — BAF Generation (Γ):**
Input: claim text x, LLM G, parameters θ (depth d, max-width w)
Process: LLM is prompted to generate at most w arguments directly supporting/attacking x. For each generated argument α_i, if depth > 1, recursively prompt for sub-arguments supporting/attacking α_i.
Output: BAF ℬ = ⟨𝒜, R⁻, R⁺⟩ (no scores yet)

Typical configuration in evaluation: depth=1 or depth=2, width≤3. Depth=2 produces a two-level tree with 7–15 arguments.

**Stage 2 — Base Score Attribution (ℰ):**
Input: BAF ℬ, evaluative LLM E
Process: For each argument α ∈ 𝒜, prompt LLM E to assign a confidence score within the same context window. Options evaluated:
- Neutral (τ(α) = 0.5 for all arguments): No LLM judgment on argument quality
- Estimated (τ(α) ∈ [0,1] from LLM): LLM assigns intrinsic confidence
Output: QBAF 𝒬 = ⟨𝒜, R⁻, R⁺, τ⟩

**Stage 3 — Dialectical Strength (Σ):**
Input: QBAF 𝒬, gradual semantics σ (DF-QuAD)
Process: Apply DF-QuAD bottom-up for tree-structured graphs, iteratively for general graphs
Output: σ_𝒬(x) ∈ [0,1] for the root claim x

**Stage 4 — Verdict (g):**
σ_𝒬(x) ≥ 0.5 → claim is True; otherwise False

**Performance vs. baselines (averaged across TruthfulClaim, StrategyClaim, MedClaim):**
- Direct Q&A: ~76% accuracy
- Chain-of-thought: ~77% accuracy
- ArgLLM (neutral base scores, depth=1): ~75% accuracy
- ArgLLM (estimated base scores, depth=2): ~77% accuracy

ArgLLMs match CoT accuracy while providing a complete, auditable argument tree as explanation. The advantage is not accuracy — it is that the reasoning structure is visible, modifiable, and formally sound.

**Four variants evaluated:**
- ArgLLM₁₅ (depth=1, neutral base scores)
- ArgLLM₁ₑ (depth=1, estimated base scores)
- ArgLLM₂₅ (depth=2, neutral base scores)
- ArgLLM₂ₑ (depth=2, estimated base scores, best overall)

---

### 3. ArgRAG: QBAF + Retrieval

**Paper:** Zhu et al. 2025, arXiv:2508.20131

**Pipeline:**

```
retrieve(query, k=10) → {doc₁, ..., docₖ}
↓
for each docᵢ: classify(docᵢ, claim) → {supports, contradicts, irrelevant}
remove irrelevant docs
↓
for each pair (docᵢ, docⱼ): classify(docᵢ, docⱼ) → {supports, contradicts, irrelevant}
add bidirectional edges
↓
construct QBAF: arguments = {claim a₀} ∪ {surviving docs}
all base scores β(a) = 0.5 (no bias)
↓
apply QE semantics until convergence
↓
σ(a₀) ≥ τ=0.5 → True
```

**Why QE over DF-QuAD for ArgRAG:** The evidence-evidence relation matrix may include cycles (doc A supports doc B, doc B supports doc A when both corroborate the same source). QE handles cycles gracefully via iterative energy minimization; DF-QuAD requires acyclic graphs for clean bottom-up evaluation.

**Key insight:** Structural argumentation is robust to retrieval noise because irrelevant/weak documents are explicitly filtered at the relation annotation step, before they enter the QBAF. Pure retrieval methods suffer because all retrieved chunks contribute to the LLM context with equal weight.

**Crux relevance for Faultline:** If personas have corpus-backed claim nodes, ArgRAG's retrieval-to-relation-annotation step is a blueprint for grounding crux card claims in corpus evidence rather than in LLM-generated arguments alone. This would partially solve the hallucination problem in crux extraction.

---

### 4. ARGORA: Multi-Agent QBAF Orchestration

**Paper:** arXiv:2601.21533 (January 2026)

**Key architectural distinction from MArgE:** ARGORA does NOT produce a merged QBAF. Each expert LLM builds its own independent argument tree. The orchestrator selects the best main argument and applies counterfactual analysis — it does not fuse argument trees into a single shared graph.

**Per-expert tree construction:**
1. Expert generates main argument (claim + 1-sentence support)
2. Orchestrator extracts main argument node as QBAF root
3. Orchestrator prompts expert for up to w supplementary arguments per layer
4. Contextual orthogonality filter: for each candidate node, compute cosine similarity to existing nodes at same depth level; reject candidates with similarity > ρ_sim (typically 0.8)
5. Fallback: if all candidates exceed threshold, retain lowest-similarity candidate anyway
6. Repeat to depth d (typically d=2)

**Strength evaluation:**
```
σ(a) = ι_{w(a)}(α_{π(a)}(σ(c₁), ..., σ(cₙ)))
```
Where α aggregates child strengths with polarity (support or attack), and ι applies influence mapping from base score. For DF-QuAD, this reduces to the two-step formula above.

**Counterfactual edge impact:**
```
Q^⊖x = remove edge x→parent(x) from Q
Δ_edge(x; root) = σ(root) - σ^⊖x(root)
```
Positive Δ means x is a net contributor; negative means x is a net detractor (even if labeled as support, it may have weak children that dilute strength). This is a useful diagnostic for crux card generation: the argument with |Δ_edge| closest to the disagreement gap between two personas is the crux.

**Override process:** When the internal QBAF winner and an external judge disagree, ARGORA minimizes a JS-divergence + perturbation-cost objective to find the minimal single-edge intervention that reconciles them. This is an elegant conflict resolution mechanism but requires an external judge signal — not applicable to autonomous debate without a separate evaluation oracle.

---

### 5. Belief Revision in QBAF: CE-QArg Algorithm

**Paper:** arXiv:2407.08497, KR 2024

**Problem formulation:** Given QBAF 𝒬 with current root strength σ(α*), find a modified base score function τ* (close to τ under L_p distance) such that the new root strength σ_{τ*}(α*) crosses a desired threshold s*.

This is the computational realization of the intuition: "I want to understand what belief changes would lead this argument to succeed/fail."

**Module 1 — Polarity Analysis:**
For each argument β ∈ 𝒜, enumerate all non-cyclic directed paths from β to the root α*:
- If no path exists: β has polarity **Neutral** (encoded as -2)
- If all paths contain an even number of attack edges: β has polarity **Positive** (encoded as 1)
- If all paths contain an odd number of attack edges: β has polarity **Negative** (encoded as -1)
- Otherwise (mixed paths): β has polarity **Unknown** (encoded as 0)

Interpretation: A positive argument supports the claim through even-attack paths (supporters of supporters, attackers of attackers, etc.). A negative argument undermines the claim. Unknown arguments have context-dependent effects.

**Module 2 — Priority Scoring:**
```
Priority(β → α*) = 1 / min_path_length(β, α*)
Priority(α* → α*) = constant c > 1  (self-priority)
Priority(β → α*) = 0  if β is Neutral
```
Arguments closer to the root are modified first — they have greater leverage per unit of base score change.

**Module 3 — Iterative Update:**
```python
while σ(α*) < s*:
    for each β in 𝒜:
        if polarity[β] == Neutral:
            Δ[β] = 0
        elif polarity[β] == Positive:
            Δ[β] = +1  # increase this argument's base score to push root up
        elif polarity[β] == Negative:
            Δ[β] = -1  # decrease this argument's base score to stop it harming root
        else:  # Unknown
            # compute difference quotient numerically
            Δ[β] = sign((σ_{τ+h·eβ}(α*) - σ(α*)) / h)  for small h

    for each β in 𝒜:
        τ*(β) = clamp(τ*(β) + Δ[β] * ε * Priority(β → α*), 0, 1)

    recompute σ(α*) under τ*
```
Step size ε ≈ 0.01 in experiments. Perturbation h ≈ 0.001 for difference quotient estimation.

**Cost metric:** The counterfactual explanation's "cost" is d_p(τ, τ*) = (Σ_α |τ(α) - τ*(α)|^p)^{1/p}. The CE-QArg algorithm minimizes this implicitly by updating high-priority arguments first and taking small steps.

**Application to Faultline debate belief revision:**
- Before a debate round: persona A holds QBAF_A with root σ_A(claim)
- After seeing persona B's arguments: some nodes in QBAF_A should be revised
- Run CE-QArg with s* = actual post-round strength (extracted from persona's stated position)
- Output: the minimal set of base score changes — these are the *belief updates* that explain persona A's position shift (or stubbornness)

---

### 6. Multi-Framework Merging: MArgE Semantic Merging

**Paper:** arXiv:2508.02584

**Formal setup:** K personas each generate a BAF Bᵢ = ⟨𝒜ᵢ, Rᵢ⁻, Rᵢ⁺⟩. The merge produces a single BAF B = ℳ({B₁, ..., Bₖ}).

**Two merge strategies:**

**Strategy A — Simple Union:**
```
𝒜_merged = {root_claim} ∪ 𝒜₁ ∪ 𝒜₂ ∪ ... ∪ 𝒜ₖ
R⁻_merged = R₁⁻ ∪ R₂⁻ ∪ ... ∪ Rₖ⁻
R⁺_merged = R₁⁺ ∪ R₂⁺ ∪ ... ∪ Rₖ⁺
```
Simple but produces redundant nodes (same argument expressed differently by different personas).

**Strategy B — Semantic Merge:**
```
For each pair of arguments (αᵢ from Bᵢ, αⱼ from Bⱼ) at the same depth level:
    sim(αᵢ, αⱼ) = cosine(embed(αᵢ), embed(αⱼ))
    if sim(αᵢ, αⱼ) > ρ_merge:
        merge αᵢ and αⱼ into single node (keep higher-priority text, average base scores)
Apply DF-QuAD to merged QBAF
```

Threshold ρ_merge ≈ 0.85 in practice. The merged node inherits all attack/support relations from both source nodes.

**Post-merge scoring:**
After semantic merge, assign base scores τ(α) to all argument nodes. Options:
- Uniform τ = 0.5 (no prior beliefs)
- Averaged scores from participating personas: τ(α) = mean(τᵢ(αᵢ), τⱼ(αⱼ)) for merged nodes
- Conflict score: τ(α) = |τᵢ(αᵢ) - τⱼ(αⱼ)| for merged nodes (highlights disagreement intensity)

**MArgE evaluation results:**
- Semantic merge + estimated scores (MArgE₂ₑ): best overall (77.4% avg accuracy on claim verification)
- Beats single-LLM ArgLLM₂ₑ by ~2.5 percentage points on MedClaim
- Simple union + estimated scores: slightly worse than semantic merge but more robust to embedding quality

**Crux identification via merge diff:**
The community graph produced by semantic merge enables crux identification through a structural comparison:
```
For each persona pair (A, B):
    compute σ_A(root) and σ_B(root) from their respective QBAFs
    find argument nodes α where |τ_A(α) - τ_B(α)| is largest
    find argument nodes α where Δ_edge_A(α; root) and Δ_edge_B(α; root) have opposite signs
    crux candidates = intersection of high-divergence and sign-flip nodes
```
A sign-flip node is one where α helps A's root conclusion but hurts B's — this is the structural definition of a crux.

---

### 7. AGM Postulates for Argumentation Revision

**Foundation:** Alchourrón, Gärdenfors, Makinson (1985) — three operations on belief sets:
- **Expansion (K + φ):** Add new belief φ without consistency check
- **Revision (K * φ):** Add φ while restoring consistency (minimal change)
- **Contraction (K ÷ φ):** Remove φ while preserving as much as possible

**Translation to argumentation frameworks (Villata et al., Dung AF):**

Six rationality postulates for argumentation revision (AF * φ):
1. (AE1) **Closure:** The revised AF has a defined, non-empty extension
2. (AE2) **Success:** φ (the target argument) is in-extension in the revised AF
3. (AE3) **Inclusion:** The revised AF is a subset of the original + φ
4. (AE4) **Vacuity:** If adding φ doesn't create conflict, the revision equals expansion
5. (AE5) **Consistency:** The revised AF is consistent
6. (AE6) **Minimality:** The revision produces minimal change to argument statuses

**Representation theorem (Bisquert et al.):** A revision operator satisfies (AE1)–(AE6) if and only if there exists a *faithful assignment* (total preorder over possible AFs) encoding how far each AF is from the current one. Revising to φ selects the closest AF in which φ succeeds.

**Practical implication for Faultline:** When a new argument α_new arrives (from the opponent in a debate round), the minimal change to the persona's QBAF that incorporates α_new while maintaining consistency is well-defined under AGM. CE-QArg computes this minimally-changing base-score assignment. The two approaches are compatible: AGM defines *what* a rational update looks like; CE-QArg provides the *algorithm* for computing it.

**Dynamic collective argumentation (2024):**
When the group (not an individual) must update its collective extension after new arguments arrive:
- **Revision operator:** Given new argument α to accept, add α to the collective extension while satisfying AGM minimality
- **Contraction operator:** Given argument α to reject, remove α from collective extension while preserving other accepted arguments
- The 2024 paper (ScienceDirect, IJAR 173) shows these operators can be constructed satisfying all AGM postulates for collective argumentation — but the construction is not provided as a concrete algorithm.

---

### 8. Community/Merged Argumentation Graphs: Design Approaches

Three architectures for multi-agent QBAF combination:

**Architecture A: Full Merge (MArgE approach)**
- Produce single QBAF from all persona QBAFs via semantic deduplication
- Single DF-QuAD evaluation produces community verdict
- Crux = argument nodes with highest cross-persona base score variance
- Pro: single integrated view, directly contestable
- Con: loses per-persona traceability; conflates individual positions

**Architecture B: Parallel Trees with Orchestrator (ARGORA approach)**
- Each persona maintains its own QBAF tree
- Orchestrator evaluates all trees independently under identical semantics
- Orchestrator compares root strengths: disagreement = |σ_A(root) - σ_B(root)| > threshold
- Crux = arguments where Δ_edge signs differ between persona trees
- Pro: preserves per-persona explainability; no semantic merging errors
- Con: no community consensus signal; requires orchestrator judgment

**Architecture C: Shared Blackboard with Per-Persona Annotations**
- Single argument graph (nodes = claims, edges = attack/support)
- Each persona annotates each node with their own base score τ_persona(α)
- Community strength = aggregate function over per-persona scores (mean, median, or weighted by persona confidence)
- Crux = max |τ_A(α) - τ_B(α)| × |Δ_edge(α; root)|
- Pro: most flexible for Faultline's existing architecture (debate context as blackboard)
- Con: requires tracking per-persona annotations; more complex data model

**Recommendation for Faultline:** Architecture C maps onto the existing `DebateContext` blackboard architecture. Each `DialogueMessage` contributes argument nodes; each persona's position-tracking object stores their base scores for shared nodes. The community graph is the union of all nodes; crux detection compares per-persona base scores for each node.

**Crux localization formula:**
```
For argument node α in the community graph:
    contribution_A(α) = τ_A(α) × Δ_edge(α; root_A)
    contribution_B(α) = τ_B(α) × Δ_edge(α; root_B)
    crux_score(α) = |contribution_A(α) - contribution_B(α)|

Crux = argmax_α crux_score(α)
```

---

### 9. Benchmarking Argumentation Quality

**Existing standard datasets:**
- **IBM-Rank-30k:** 30,000 arguments with human quality rankings; used for training and evaluating argument quality models. Annotation covers overall quality, effectiveness, and persuasiveness.
- **IBM-ArgQ-5.3k:** 5,300 arguments with fine-grained quality scores (cogency, rhetorical effectiveness, reasonableness, overall). Available at research.ibm.com/haifa/dept/vst/debating_data.shtml.
- **GAQCorpus:** Multi-domain (reviews, QA, debates) with cogency, effectiveness, and reasonableness labels.

**Three canonical quality dimensions (Wachsmuth et al. 2017 taxonomy):**

| Dimension | What it measures | Relevant for Faultline? |
|-----------|-----------------|------------------------|
| Cogency | Logical validity: are premises acceptable and sufficient? | Yes — crux card premises |
| Rhetoric | Persuasive strategy: ethos, logos, pathos | Partial — speech profiles |
| Reasonableness | Dialectical quality: does argument rebut counterarguments? | Yes — crux exchange |

**MPAQ (Multi-Persona Argument Quality Assessment, ACL 2025):**
- Generates diverse evaluator personas targeting the specific argument being assessed
- Coarse-to-fine scoring: first integer score, then refined decimal
- Each persona provides a rationale, not just a score
- Outperforms baselines on IBM-Rank-30k and IBM-ArgQ-5.3k
- Most useful for Faultline if crux card quality needs to be rated by a third party

**DEBATE benchmark (arXiv:2510.25110):**
- 107 topics, Likert stance scale [-3, +3]
- ΔSD = final standard deviation − initial standard deviation
- Humans: ΔSD ≈ 0 (maintain diversity)
- LLMs: strongly negative ΔSD (converge)
- This is the primary external benchmark for evaluating whether Faultline's anti-conformity mechanisms work

**Proposed metric suite for QBAF-based Faultline evaluation:**

| Metric | Formula | Measures |
|--------|---------|---------|
| Root strength delta (RSD) | \|σ_A(root) - σ_B(root)\| at end of debate | Divergence maintained |
| Crux localization rate (CLR) | Fraction of debates where crux_score(α) > threshold for some α | Structural disagreement detection rate |
| Base score shift (BSS) | Σ_α \|τ_before(α) - τ_after(α)\| / \|𝒜\| | How much beliefs actually changed per debate round |
| Argument coverage (AC) | \|𝒜_merged\| / expected_args | Breadth of argumentation (penalizes degenerate debates) |
| Crux contestability (CC) | Whether presented crux cards have modifiable base scores with observable outcome change | Whether crux cards are actionable |

---

## Gaps and Limitations

1. **No validated graph→text→graph round-trip.** The extraction direction (text→QBAF nodes) is validated. The reverse — generating persona text grounded in a QBAF, then updating the QBAF from the response — is not. Faultline must build and validate this loop itself.

2. **Semantic merge quality depends on embedding quality.** MArgE's deduplication step requires sentence-transformer embeddings. For short, highly domain-specific claims ("Bitcoin enables financial freedom"), general-purpose embeddings may conflate distinct claims or fail to merge genuinely equivalent ones. Domain-specific embeddings or explicit claim normalization may be needed.

3. **CE-QArg convergence guarantee is conditional.** The iterative algorithm converges when no unknown-polarity arguments exist. For graphs with cycles (support cycles between arguments), convergence is not guaranteed. Faultline should ensure QBAF graphs are acyclic (tree structure) to guarantee CE-QArg termination.

4. **The "crux localization formula" in section 8 is proposed, not validated.** It combines CE-QArg edge impact scores (from ARGORA) with base score divergence (from MArgE) in a novel way. It is theoretically motivated but has not been tested in a debate system. Faultline would need to validate this empirically.

5. **MPAQ evaluation requires a separate LLM call per argument per persona.** At O(k·m) LLM calls for k personas and m arguments, this becomes expensive for multi-round debates. Use selectively for crux card quality scoring, not for every argument.

6. **AGM minimality in QBAF revision is computationally hard in general.** Finding the minimal faithful assignment is NP-hard for large AFs (Baumann & Ulbricht 2019). CE-QArg approximates minimality via priority-weighted greedy updates — this is not guaranteed optimal. For Faultline's shallow (depth ≤ 2) QBAFs with ≤ 15 arguments, greedy is acceptable.

---

## Implementation Recommendations for Faultline

### Phase 1: Offline QBAF Construction (minimal viable)

For each persona's corpus, during `build-personas.ts`:
```
1. Extract argument nodes: Haiku prompt per corpus chunk
   Output: { claim: string, polarity: "supports"|"attacks", target: "root"|argument_id }

2. Assign base scores: single Haiku pass over all extracted claims
   Output: { claim_id: string, base_score: float (0-1) }

3. Build QBAF JSON: { root: root_claim, arguments: [...], attacks: [...], supports: [...] }
   Store at: data/seed/qbafs/[PersonaName].json
```
Cost: ~$0.20/persona. Runs once. Clear schema.

### Phase 2: Crux Card Scoring (in-debate)

At the point where `lib/crux/orchestrator.ts` generates a crux card:
```
1. Extract claim nodes from the crux room exchange (existing crux extraction prompts)
2. Classify each claim as supporting/attacking the crux topic
3. Score each claim (Haiku, 0-1 confidence)
4. Build mini-QBAF (claim nodes + relations + scores)
5. Apply DF-QuAD to produce root strength σ(crux_topic) per persona
6. Compute crux_score per argument node using the localization formula
7. Attach top-3 crux nodes + their scores to the CruxCard output
```

### Phase 3: Belief Update Tracking (post-debate)

After each debate round:
```
1. Compare per-persona base scores before and after
2. Run CE-QArg to find the minimal explanation for any position shift
3. Store as PositionShift event: { persona, changed_nodes: [{arg_id, τ_before, τ_after}], cost: d_p }
```

### Phase 4: Community Graph (stretch goal)

After all rounds:
```
1. Collect all argument nodes from all crux rooms
2. Run semantic merge (sentence-transformer cosine, threshold 0.85)
3. Produce community QBAF with per-persona base score annotations
4. Compute community consensus: nodes where all personas agree (base score variance < 0.1)
5. Compute persistent crux: nodes where personas diverge most (base score variance > 0.5)
6. Render as "Disagreement Map" — the core Faultline output
```

---

## Sources

- [ArgLLMs: Argumentative LLMs for Explainable Claim Verification (AAAI 2025, arXiv:2405.02079)](https://arxiv.org/html/2405.02079)
- [ARGORA: Orchestrated Argumentation for Causally Grounded LLM Reasoning (arXiv:2601.21533)](https://arxiv.org/html/2601.21533)
- [MArgE: Meshing Argumentative Evidence from Multiple LLMs (arXiv:2508.02584)](https://arxiv.org/html/2508.02584)
- [ArgRAG: Explainable RAG using Quantitative Bipolar Argumentation (arXiv:2508.20131)](https://arxiv.org/html/2508.20131)
- [CE-QArg: Counterfactual Explanations for QBAF (KR 2024, arXiv:2407.08497)](https://arxiv.org/html/2407.08497v1)
- [Change in Quantitative Bipolar Argumentation: Sufficient, Necessary, Counterfactual Explanations (arXiv:2509.18215)](https://arxiv.org/abs/2509.18215)
- [Contestability in Quantitative Argumentation (arXiv:2507.11323)](https://arxiv.org/pdf/2507.11323)
- [Balancing Open-Mindedness and Conservativeness in QBAF (KR 2024)](https://proceedings.kr.org/2024/56/kr2024-0056-potyka-et-al.pdf)
- [Dynamic Collective Argumentation: Revision and Contraction Operators (IJAR 2024, ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0888613X2400121X)
- [A Multi-persona Framework for Argument Quality Assessment, MPAQ (ACL 2025)](https://aclanthology.org/2025.acl-long.593/)
- [Argument Quality Assessment in the Age of Instruction-Following LLMs (arXiv:2403.16084)](https://arxiv.org/html/2403.16084v1)
- [Towards a Perspectivist Turn in Argument Quality Assessment (NAACL 2025)](https://aclanthology.org/2025.naacl-long.382/)
- [DEBATE Benchmark: LLM Over-convergence (arXiv:2510.25110)](https://arxiv.org/abs/2510.25110)
- [A Numerical Approach to the Merging of Argumentation Networks (Springer 2012)](https://link.springer.com/chapter/10.1007/978-3-642-32897-8_14)
- [On the Revision of Argumentation Systems (AAAI 2014)](https://cdn.aaai.org/ocs/7967/7967-36853-1-PB.pdf)
