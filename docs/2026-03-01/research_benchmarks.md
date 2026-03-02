# Benchmark Frameworks for Multi-Agent Debate Evaluation

**Research date:** March 1, 2026
**Scope:** Named benchmarks (Moltbook, RECAP/GenMinds, PRISM, LaMP, ToM) + additional relevant work. Critical assessment for Faultline's "scaling law for multi-agent debate."

---

## Executive Summary

Of the five named frameworks, two are immediately actionable (Moltbook, DEBATE/PRISM), two require significant adaptation (LaMP, NoveltyBench/IdeaBench), and one is a position paper without implementation (RECAP/GenMinds). The most useful finding for Faultline: **epistemic diversity consistently degrades at scale** — LLM agents over-converge, lose lexical innovation, and fail to transmit influence. This is the pathology Faultline's crux room is designed to counteract. The benchmarks below provide the measurement vocabulary to quantify whether it succeeds.

---

## 1. Moltbook (Li, Li, Zhou — arXiv:2602.14299, Feb 2026)

### What It Is

The paper studies **Moltbook**, the largest publicly accessible AI-only social network (~39,000 agents, ~290,000 posts, ~1.8M comments). It asks: does socialization emerge from sustained large-scale interaction? The answer is **no** — and the diagnostic framework it introduces is the most technically complete benchmark here.

### Metrics (with formal definitions)

All metrics are computed from sentence embeddings and temporal post sequences.

**Lexical Innovation Dynamics**

```
Unique n-gram Birth Rate:   R_birth^(n)(t) = |ℬ_t^(n)| / |𝒜_t^(n)|
Unique n-gram Death Rate:   R_death^(n)(t) = |𝒟_t^(n)| / |𝒜_{t-1}^(n)|
```

Birth = proportion of active vocabulary that is newly introduced on day t.
Death = proportion of previous day's n-grams that disappeared.
Non-zero birth/death equilibrium = dynamic lexical churn with no progressive innovation.

**Semantic Distribution Convergence**

```
Centroid Stability:   S_centroid(t_i, t_j) = cos(𝐜_{t_i}, 𝐜_{t_j})
Micro-Homogeneity:    S_pairwise(t_i, t_j) = mean pairwise cosine across all cross-day post pairs
Cluster Tightening:   S_K(p) = (1/K) Σ_{q∈𝒩_K(p)} cos(𝐯_p, 𝐯_q)   [K=10 nearest neighbors]
```

Centroid similarity near 1.0 = macro-stable society. Low pairwise similarity = persistent individual diversity. No increasing cluster tightening = no progressive homogenization.

**Individual Inertia (Agent-Level Drift)**

```
Drift Magnitude:     D_a = 1 - cos(𝐜_a^(early), 𝐜_a^(late))
Drift Consistency:   S_a = cos(𝐝_a, 𝐝̄)   [alignment with global mean drift]
Societal Pull:       ΔS_a = cos(𝐜_a^(late), 𝐜_global) - cos(𝐜_a^(early), 𝐜_global)
```

All three centered near zero in Moltbook: agents drift, but neither coherently nor toward each other.

**Feedback Adaptation**

```
Net Progress: NP = Δ_bot - Δ_top
```

Where Δ = change in semantic distance from high/low feedback cluster centroids. Centered near zero = agents do not learn to optimize toward high-feedback content.

**Structural Influence (PageRank)**

Daily directed interaction graphs with agents as nodes, comments as weighted edges. Top-5 PageRank concentration drops sharply after the first few days. Supernodes are transient (identity changes daily). No persistent hierarchical influence structure emerged.

### Key Findings

- Macro-level semantic centroid saturates quickly — **global vocabulary stabilizes fast**
- Individual diversity persists — **agents do not homogenize despite scale**
- No feedback responsiveness — **agents ignore which content generates engagement**
- No interaction influence — **being replied to does not change your semantic output**
- No persistent supernodes — **influence is fleeting, not structural**

The root cause: **absent shared social memory**. Agents have no mechanism to accumulate learning from interactions. This is precisely Faultline's bet — crux rooms and crux cards ARE the shared social memory layer.

### Relevance to Faultline: HIGH

Moltbook's metrics are the closest to a rigorous "does multi-agent interaction produce epistemic outcomes?" test. The framework is directly adaptable:

| Moltbook Metric | Faultline Analog |
|----------------|-----------------|
| Individual Semantic Drift | Position shift per persona across debate rounds |
| Interaction Influence (Δ_interact) | Does a crux room change subsequent takes? |
| PageRank supernode formation | Do dominant arguments stabilize across crux rooms? |
| Lexical Birth/Death Rate | Do new terms/framings emerge from clash? |
| Centroid Stability | Does debate-wide semantic center stabilize? |

**Recommended adoption:** Implement drift magnitude, interaction influence delta, and argument-level PageRank centrality for multi-session experiments. These can be computed post-debate from stored DialogueMessage embeddings.

---

## 2. DEBATE Benchmark (Chuang et al. — arXiv:2510.25110, NeurIPS SEA workshop 2025)

### What It Is

**DEBATE** (Deliberative Opinion Exchanges for Benchmarking Agent-based Trajectory Evolution) — the first large-scale empirical benchmark comparing LLM agent opinion dynamics to real human conversation groups across 107 controversy topics. Already in `references.bib` as `debate_benchmark`.

### Metrics

**Utterance-level:**
- Stance Alignment: `Δstance(u,û) = |S(u) - S(û)|` on a 6-point Likert scale
- ROUGE-L: lexical overlap
- On-topic rate: utterances addressing the discussion topic

**Group-level:**
- Public convergence: `ΔSD^tweet_g = SD_final(g) - SD_init(g)` (within-group stance variance)
- Private convergence: `ΔSD^private_g` (same, but for self-reported beliefs)

### Key Findings

- Human groups: ΔSD near zero — **humans maintain entrenched positions after discussion**
- Zero-shot LLM agents: significantly negative ΔSD — **dramatic over-convergence**
- SFT/DPO post-training narrows the gap but does not close it
- Mode 2 (full simulation) significantly worse than Mode 1 (next-message prediction), due to error accumulation

### Relevance to Faultline: HIGH

DEBATE establishes the baseline pathology Faultline must overcome. If Faultline's personas show ΔSD near zero (maintaining positions through clash), that is evidence the system works. If ΔSD is strongly negative (agents converging to consensus), the system is failing at its primary function.

**Recommended adoption:** Implement ΔSD (stance variance) as a first-class metric. Compute over the persona × topic stance matrix extracted from crux cards. Compare pre-debate opening positions vs. post-debate closing positions. Target: ΔSD ≥ 0 (no net convergence, or maintained diversity).

---

## 3. RECAP / GenMinds (Li et al. — arXiv:2506.06958, ICML 2025 position paper)

### What It Is

**GenMinds** is a proposed paradigm for building generative agents that simulate structured thought via causal belief graphs rather than surface-level behavior. **RECAP** (REconstructing CAusal Paths) is the benchmark proposed to evaluate reasoning fidelity.

**Critical caveat: This is a position paper with no implementation, no code, no empirical results.** The RECAP benchmark is proposed but not validated.

### Proposed Metrics

Described conceptually only — no mathematical formulas provided:

- **Traceability:** Can the agent construct a transparent chain of intermediate beliefs?
- **Demographic Sensitivity:** Can it represent diverse reasoning paths across identities/contexts?
- **Intervention Coherence:** Does it revise beliefs consistently under hypothetical changes?
- **Motif Alignment:** Structural similarity between human and model belief graphs
- **Belief Coherence:** Internal consistency of the model's reasoning trace
- **Counterfactual Robustness:** Sensible belief updates under hypothetical perturbations

### Causal Belief Graph Schema

```
Nodes: causally relevant concepts (policy tradeoffs, values, outcomes)
Edges: directed influence relationships with confidence and polarity scores
Example: "Surveillance → Crime Rate → Public Safety"
```

Interview protocol: LLM asks semi-structured questions, parses responses into "cognitive motifs" (minimal causal units), assembles into DAGs. The parsing algorithm is not specified.

### Honest Assessment

GenMinds identifies the right problem — agents should reason differently, not just conclude differently — but provides no implementation path. The do-calculus belief propagation machinery requires conditional probability distributions (CPDs) that the paper does not provide, making propagation uncomputable. The RECAP benchmark has no baseline results, no dataset, no tool.

**What IS useful:**
- The belief graph schema (`cause → effect, polarity, confidence`) is a clean schema for Faultline's `data/seed/beliefs/[Name].json` already planned in `docs/architecture_2_26.md`
- The traceability principle (reasoning steps must be grounded in corpus material) maps to Faultline's anti-hallucination mandate
- Motif alignment could be operationalized: compare the belief graph nodes activated during a debate turn to the ground-truth corpus (are agents reasoning from their actual documented positions?)

**Relevance to Faultline: MEDIUM (as design inspiration only)**

Do not implement RECAP as described — it has no working definition. Instead, extract two concrete adaptations:
1. **Traceability proxy:** For each crux card, record which belief graph nodes (corpus chunks) were cited or invoked. Ratio of grounded-to-ungrounded claims = traceability score.
2. **Intervention test:** After debate, apply a hypothetical: "If evidence X changed, would persona Y update?" Run a single Haiku call per persona per crux card. Consistent updates with belief graph predictions = counterfactual robustness.

---

## 4. PRISM (Tu et al. — arXiv:2602.21317, Feb 2026)

### What It Is

**PRISM** (Pluralistic Reasoning via In-context Structure Modeling) attacks the "Artificial Hivemind" problem: LLMs collapse toward shared priors, eliminating distributional diversity. It augments LLMs with dynamic on-the-fly epistemic graphs (Spark nodes + Context nodes) connected via Mapping, Blending, and Inversion operators.

Authors: Guancheng Tu, Shiyang Zhang, Tianyu Zhang, Yi Zhang, Diji Yang.

### Epistemic Graph Architecture

```
Node Types:
  Context Nodes (V_c): extracted from user queries; immutable constraints
  Spark Nodes (V_s):   extracted from retrieved corpus; novel mechanisms

Edge Operators:
  Mapping (→M):   transfers mechanisms across domains (viral spread → marketing)
  Blending (→B):  combines context + spark attributes into novel composites
  Inversion (→I): identifies spark nodes functionally opposing context nodes

Topological constraint: no V_c—V_c edges (prevents semantic collapse)
```

### Benchmarks Used to Evaluate PRISM

**NoveltyBench** (arXiv:2504.05228):
- `distinct_k = |{c_i | i ∈ [k]}|` — unique equivalence classes among k samples
- `utility_k = (1-p)/(1-p^k) Σ p^(i-1) · 𝟙[c_i ≠ c_j, ∀j<i] · u_i` — novelty weighted by quality
- 1,100 prompts; 8 human annotators as baseline; frontier models produced fewer than 4 distinct responses per 10 queries

**IdeaBench** (arXiv:2411.02429):
- `I(LLM,q) = (1/m) Σ (r_i|q - 1)/n` — normalized rank-based insight score
- Tests research hypothesis generation quality vs. human-generated ideas

**Artificial Hivemind Benchmark:**
- Intra-model cosine similarity (within a model's outputs)
- Inter-model cosine similarity (cross-model homogenization)
- PCA on sentence embeddings: tight clustering = low diversity

**PRISM results:** gpt-4o-mini achieved a 28% increase in Distinct score; models produced multi-centered, elongated distributions in PCA space vs. tight concentration for vanilla models.

### Honest Assessment

PRISM is genuinely novel, but its epistemic graph is domain-general (mechanisms, blending, inversion). Faultline's epistemic dimension is different: **persona-specific causal belief graphs derived from real corpus data**, not dynamically synthesized Spark nodes from retrieval. The operator vocabulary (Mapping, Blending, Inversion) is not well-suited to debate — debate requires confrontation operators, not creative blending.

**What IS useful:**
- PCA distributional diversity analysis is directly implementable for Faultline: embed all debate takes per round, compute PCA, measure spread vs. baseline single-agent generation. This tests whether Faultline's personas generate genuinely differentiated outputs.
- The Artificial Hivemind metrics (intra-model cosine similarity across personas in the same debate) directly measure persona homogenization.

**Relevance to Faultline: MEDIUM**

Adopt the distributional diversity measurement approach (PCA + cosine similarity) as an offline diagnostic for persona differentiation. Do not implement the PRISM graph architecture — Faultline's belief graphs serve the same function but are corpus-grounded rather than dynamically retrieved.

---

## 5. LaMP (Salemi et al. — arXiv:2304.11406, ACL 2024)

### What It Is

**LaMP** (When Large Language Models Meet Personalization) is a benchmark for evaluating whether LLMs can produce outputs personalized to individual user profiles retrieved from interaction history. Seven tasks: 3 classification (citation identification, movie tagging, product rating) + 4 text generation (news headline, email subject line, tweet paraphrase, scholarly abstract).

RAG-based personalization improved performance by +14.92% on average; PEFT-based by +1.07%.

### Honest Assessment

LaMP benchmarks **stylistic personalization** (does the model write like this user?) not **epistemic personalization** (does the model reason like this thinker?). For Faultline, the relevant question is not "will the model write in the tone of Michael Saylor?" but "will it produce Saylor's causal chain about Bitcoin security vs. monetary policy?"

LaMP's tasks are:
- Document classification (irrelevant to debate)
- Style matching (partially relevant — voice fidelity)
- No reasoning fidelity tasks
- No belief revision tasks
- No crux detection tasks

**LaMP is the wrong benchmark for Faultline's core claims**, though it's useful for the narrower question of voice fidelity ("does persona X sound like themselves?").

**Relevance to Faultline: LOW for core claims, MEDIUM for voice quality**

If you want to evaluate whether personas stylistically match their real-world counterparts, LaMP's retrieval-augmented evaluation paradigm (profile retrieval → output quality) is the model. For epistemic fidelity — the harder and more important question — LaMP doesn't help.

---

## 6. Theory of Mind (ToM) Benchmarks

### What They Are

ToM benchmarks test whether LLMs can model other agents' mental states — beliefs, desires, goals — especially in false-belief scenarios where what a character knows differs from what the observer knows.

Key benchmarks:
- **TMBench** (arXiv:2402.15052): bilingual, 8 ToM tasks, 31 social cognition abilities; even GPT-4 lags human by 10%+
- **ToMValley** (OpenReview 9YhocG0o2l): 1,100 contexts, 78,100 questions about mental state changes across social scenarios
- **OpenReview critique** (BCP8UU2BcU): most ToM benchmarks are broken — they test pattern matching, not functional theory of mind (adapting behavior in response to another agent's actual actions)

### Critical Finding

LLMs' apparent ToM abilities **degrade sharply under perturbation** — adding irrelevant context, injecting observer knowledge inconsistencies, or modestly altering prompt construction collapses performance to chance. "Functional ToM" (actually adapting to partners in-context) remains largely undemonstrated.

### Relevance to Faultline: LOW for benchmarking, HIGH for architecture

ToM benchmarks expose a key failure mode: **Faultline personas don't currently model what the other persona knows or believes — they only respond to what the other persona said**. This is a shallow version of ToM that will produce surface-level rebuttal rather than genuine epistemic updating.

**Practical implication:** Before running ToM benchmarks, ensure personas have structured belief state representations (the belief graph) that can be updated as the debate proceeds. Without this, ToM evaluation will just measure how well the model pattern-matches debate structure, not whether it's actually tracking epistemic states.

ToM benchmarks are not currently worth running for Faultline — the architecture doesn't support what they'd test. Revisit when belief graphs are implemented.

---

## 7. Additional Relevant Benchmarks (Not Named by User)

### FREE-MAD (Cui et al. — arXiv:2509.11035, 2025) — `freemad` in references.bib

Anti-conformity as a design primitive. Establishes that agents drift toward consensus by default without explicit anti-conformity constraints. Directly relevant to disagreement entropy.

### "Can LLM Agents Really Debate?" (Wu et al. — arXiv:2511.07784) — `llm_agents_really_debate`

Shows that most claimed debate benefits come from self-consistency (resampling the same model) not genuine inter-agent argumentation. Critical baseline: if Faultline's crux rooms don't outperform self-consistency, the whole system is arguably just expensive self-consistency.

### Diversity of Thought in Multi-Agent Debate (arXiv:2410.12853, 2024)

Diverse model pools (Gemini-Pro + Mixtral 7BX8 + PaLM 2-M) outperform GPT-4 on GSM-8K after 4 debate rounds (91% accuracy). "Productive initial chaos" (mild initial disagreement) increases post-debate improvement likelihood. Agents are forced to inspect peer reasoning rather than replicate it.

### Silicon Crowd (Schoenegger et al. — Science Advances 2024) — `silicon_crowd_2024`

Tests whether LLM crowds can approximate human crowd forecasting accuracy. Key finding: LLM crowds' accuracy matches individual human experts but falls below true human crowds. Relevant for any "collective intelligence" claims about Faultline debates.

---

## Proposed Benchmark Suite for Faultline

### Tier 1: Implement Now (Low Cost, High Signal)

These can be computed from existing SSE event data + post-debate embedding calls.

**1. Stance Variance (ΔSD)** — from DEBATE benchmark
Compute per-persona stance on each crux (YES/NO/NUANCED = +1/0/-1). Measure SD across personas before and after debate. Target: ΔSD ≥ 0 (diversity maintained or increased).

```
Input: CruxCard.positions[] per persona
Formula: ΔSD = SD_post_debate - SD_pre_debate over all crux stances
```

**2. Persona Homogenization Score** — from Artificial Hivemind / PRISM
Embed all takes per round (1 embedding per message). Compute pairwise cosine similarity across personas within the same round. Low avg similarity = genuinely diverse outputs. Track round-by-round trend.

```
Input: DialogueMessage.content[] per round
Formula: avg pairwise cosine(embed(msg_i), embed(msg_j)) for i ≠ j in same round
```

**3. Crux Compression Rate (CCR)** — already implemented
`resolved_cruxes / total_cruxes`. Already in `ThreeColumnLayout.tsx`. Persist to DB.

**4. Disagreement Entropy (H)** — already implemented
Shannon entropy over disagreement type distribution. Already computed. Persist to DB.

### Tier 2: Implement with Multi-Session Storage

These require cross-session aggregation.

**5. Crux Recurrence Rate (CRR)**
Do independent debates on similar topics produce similar crux sets? Requires: persist crux card embeddings, cluster across sessions, measure cluster tightening.

**6. Argument Survival Centrality**
Which claims survive across multiple debates? PageRank over an argument graph where edges = "this argument appeared in a crux room that referenced argument X." Requires: cross-session argument graph.

**7. Position Drift Magnitude (D_a from Moltbook)**
For each persona, measure `1 - cos(centroid_early, centroid_late)` using their opening vs. closing takes. This measures whether the debate caused actual epistemic movement.

```
Input: opening statement embedding, closing statement embedding per persona
Formula: D_a = 1 - cos(embed(opening_a), embed(closing_a))
```

### Tier 3: Aspirational (Require New Architecture)

**8. Interaction Influence Delta** — from Moltbook
Does participation in a crux room change subsequent dialogue takes? Requires: compare takes before crux room to takes after crux room for the same persona. Needs: stored embeddings + crux room timestamps.

**9. Traceability Score** — adapted from RECAP
For each crux card argument, what fraction of claims can be traced to a specific corpus chunk? Requires: belief graph implementation + citation tracking in generation.

**10. Counterfactual Robustness** — adapted from RECAP
Given "what if evidence X changed," does the persona update in the direction predicted by their belief graph? Requires: belief graph implementation.

---

## Critical Assessment: What Sounds Cool vs. What's Real

| Benchmark | Status | Verdict |
|-----------|--------|---------|
| Moltbook (2602.14299) | Published, full dataset described, metrics formalized | **Adopt.** Metrics are rigorous. Framework maps directly to Faultline. |
| DEBATE benchmark (2510.25110) | Published, human comparison available | **Adopt.** ΔSD is the most important single metric. |
| FREE-MAD (2509.11035) | Published | **Adopt.** Anti-conformity baseline is essential. |
| PRISM (2602.21317) | Published | **Adapt** (PCA diversity analysis only; skip the graph architecture). |
| NoveltyBench (2504.05228) | Published, code available | **Adapt** (distinct_k for persona output diversity; not core). |
| IdeaBench (2411.02429) | Published | **Low priority** — research idea ranking, not debate-specific. |
| RECAP/GenMinds (2506.06958) | Position paper only, no code, no results | **Do not implement.** Useful as design vocabulary only. |
| LaMP (2304.11406) | Published, well-established | **Low priority** — tests style, not epistemic reasoning. |
| ToM benchmarks (various) | Published | **Deferred.** Architecture must support belief state tracking first. |

---

## Recommendations

**For the "scaling law" framing:**
The law Faultline should be testing is: **as structured disagreement tracking (crux rooms + cards) increases, does ΔSD improve (diversity maintained) while CCR also improves (disagreement resolved)?** This is a tension — crux rooms aim to both maintain and resolve disagreement. The "law" is the relationship between crux room depth and the trade-off between diversity maintenance and resolution rate.

The two leading signals are:
1. `ΔSD` (stance variance before vs. after) — measures diversity preservation
2. `CCR` (crux compression rate) — measures resolution quality

Together they form a diversity-resolution frontier. Faultline's hypothesis is that crux rooms achieve high CCR without sacrificing ΔSD — i.e., they resolve the right disagreements while preserving genuine epistemic diversity on unresolved ones.

**Immediate next steps:**
1. Persist crux card data and stance matrices to the database (currently only in frontend state)
2. Add embedding computation for each message (1 embedding call per message, stored)
3. Implement ΔSD and homogenization score in the backend alongside CCR
4. Add a debate runner script that logs all metrics to a benchmark table

---

## Sources

- [Does Socialization Emerge in AI Agent Society? A Case Study of Moltbook (arXiv:2602.14299)](https://arxiv.org/abs/2602.14299)
- [DEBATE: A Large-Scale Benchmark for Evaluating Opinion Dynamics (arXiv:2510.25110)](https://arxiv.org/html/2510.25110)
- [Simulating Society Requires Simulating Thought / GenMinds (arXiv:2506.06958)](https://arxiv.org/html/2506.06958v3)
- [PRISM: Shared Nature, Unique Nurture (arXiv:2602.21317)](https://arxiv.org/abs/2602.21317)
- [LaMP: When Large Language Models Meet Personalization (arXiv:2304.11406)](https://arxiv.org/abs/2304.11406)
- [NoveltyBench: Evaluating Creativity and Diversity in Language Models (arXiv:2504.05228)](https://arxiv.org/html/2504.05228v1)
- [IdeaBench: Benchmarking LLMs for Research Idea Generation (arXiv:2411.02429)](https://arxiv.org/html/2411.02429v1)
- [TMBench: Theory of Mind in Large Language Models (arXiv:2402.15052)](https://arxiv.org/html/2402.15052v1)
- [Position: Theory of Mind Benchmarks are Broken (OpenReview)](https://openreview.net/forum?id=BCP8UU2BcU)
- [Diversity of Thought Elicits Stronger Reasoning in Multi-Agent Debate (arXiv:2410.12853)](https://arxiv.org/abs/2410.12853)
- [Can LLM Agents Really Debate? (arXiv:2511.07784)](https://arxiv.org/pdf/2511.07784)
- [FREE-MAD: Anti-conformity design (arXiv:2509.11035)](https://arxiv.org/abs/2509.11035)
