# Research Analyst Memory

## Faultline Architecture (Key Facts)
- Disagreement detection: `faultline/lib/dialogue/disagreement-detector.ts` — two functions:
  - `detectDisagreementFromTakes()` — fires after each aspect round's 3 minirounds; Haiku reads parallel takes, outputs JSON with `has_direct_opposition`, `has_specific_claim`, `topic_relevant`
  - `detectDisagreements()` — legacy sequential window scanner (10-msg window, 2-consecutive threshold); no longer wired into main orchestrator
- Crux room triggered from `faultline/lib/dialogue/orchestrator.ts` via `runCruxRoom()`
- Crux card extraction uses `faultline/lib/crux/prompts.ts`: classifies disagreement as `empirical|values|definition|claim|premise|horizon`
- LLM tiers: `haiku` (claude-haiku-4-5) for detection/extraction, `sonnet` (claude-sonnet-4-5) for generation

## High-Authority Sources by Domain
- Argument mining surveys: arxiv.org/abs/2506.16383 (2025 LLM survey), aclanthology.org
- Formal logic + NLP: NL2FOL paper (arxiv 2405.02318), MQArgEng (arxiv 2405.13036)
- Debate generation: R-Debater (arxiv 2512.24684), Agent4Debate baseline
- Argumentation semantics: QuAD/ASPARTIX papers (Dung framework)
- IBM Project Debater: research.ibm.com (Nature paper 2021)

## Established Research Facts (No Re-Research Needed)
- R-Debater is NOT an IBM project — built by Wuhan College of Communication + U of Auckland (Dec 2024)
- R-Debater's FOL is "pseudo-FOL" — LLM-generated predicate strings, not formal theorem-proven logic
- NL2FOL (formal FOL + SMT solver): 71% F1 on standard dataset, 73% F1 on adversarial climate set
  - Outperforms Claude-3-Opus (54%) and GPT-4 (45%) on adversarial set
  - Requires explicit ground-truth semantic relationships to work — fails on implicit context
- MQArgEng (Dung AF + ASPARTIX): only +2.18% improvement over baseline LLM
- LLM debate judges: best Spearman ρ=0.46, degrades on large debates, chronological bias
- "Can LLM Agents Really Debate?" (arxiv 2511.07784): LLMs converge on wrong answers via social dynamics, not logic

## Faultline-Relevant Research Conclusions
- FOL predicate extraction for Faultline's use case is infeasible without significant engineering overhead
- The current Haiku detector is already performing well for binary disagreement classification
- The most viable enhancement is R-Debater-style "pseudo-predicate" extraction to improve crux card quality
- See: formal-logic-debate-research.md for full analysis

## Generative Agents Paper (Park et al. 2023) — Established Facts
- Full paper: arxiv.org/abs/2304.03442, ACM UIST '23
- Follow-up "1000 people" paper: arxiv.org/abs/2411.10109
- Memory stream: each object has {natural_language_description, creation_timestamp, last_access_timestamp}
- Retrieval formula: score = αr·recency + αi·importance + αr·relevance; all α=1.0
  - Recency: exponential decay with factor 0.995 per sandbox game hour since last access
  - Importance (poignancy): LLM scores 1-10; prompt asks to rate between "brushing teeth" (1) and "breakup" (10)
  - Relevance: cosine similarity between memory embedding and query embedding; normalized via min-max
- Reflection trigger: importance scores of recent events sum > 150; fires ~2-3x/day
  - Step 1: LLM given 100 most recent memories, asked for 3 salient high-level questions
  - Step 2: questions used as retrieval queries; LLM generates 5 insights with cited memory indices
- Planning: 3-level hierarchy — daily sketch (5-8 chunks) → hourly → 5-15 minute actions; stored in memory stream
- Persona seed: one human-written paragraph of semicolon-delimited traits/relationships parsed into seed memories
- Agent summary description: generated on-demand from retrieved memories about name/traits/occupation/recent experiences
- Ablation: full architecture significantly outperforms all ablations (reflection, planning, observation each matter)
- Emergent: information spread from 1→32% agents in 2 days (mayoral candidacy); party coordination from single seed

## Sycophancy in Multi-Agent Debate — Established Facts
- "Peacemaker or Troublemaker" (arxiv 2509.23055): Disagreement Collapse Rate = 27-86% across configs
- Sycophancy intensifies across rounds — lowest in round 1, highest in later rounds (r=0.902 correlation)
- Troublemaker prompt (level 1 of 8): "Prioritize accuracy and honesty...Do not adjust your views simply to please others."
- Mitigation: cap debates at 2-3 rounds; mix troublemaker/peacemaker personas; detect diminishing returns
- See: generative-agents-debate-research.md for full analysis

## Debate Output Quality Benchmarking — Established Facts
- Self-consistency baseline: N independent LLM samples → majority vote on final answer (NO inter-agent communication)
- "Debate or Vote" (NeurIPS 2025 Spotlight, arxiv 2508.17536): Majority Voting alone accounts for most MAD gains; debate itself doesn't improve expected correctness (martingale theorem proved)
- "Stop Overvaluing Multi-Agent Debate" (arxiv 2502.08788): MAD fails to outperform CoT+Self-Consistency across 9 benchmarks with 4 models; model heterogeneity is the "universal antidote"
- M3MAD-Bench (arxiv 2601.02854): "Collective Delusion" = 65% of failures (agents reinforce each other's wrong answers); collaborative > adversarial paradigms
- Wu et al. 2511.07784 process metrics: State transitions (MaW→C overturn rate, MaC→W suppression rate); Rationality score 1-4 from external judge; correction rate by agent type
- No paper has defined a "crux novelty" or "insight novelty" metric for open-ended debate — gap in literature
- NoveltyBench (arxiv 2504.05228): Distinct-k metric = count of functional equivalence classes in k outputs; DeBERTa classifier for functional equivalence; frontier models score <4 distinct in 10 queries
- PRISM / Artificial Hivemind (arxiv 2602.21317): Intra-Model Similarity = pairwise cosine similarity across same-model outputs; Distinct-k on NoveltyBench; Novelty Insight Score (NIS) for scientific hypotheses via GPT-4o ranking
- D3 framework (arxiv 2410.04663): Cost metric = avg tokens per evaluation; stopping = convergence check OR budget; debate value measured via accuracy + Cohen's Kappa vs human
- Key compute comparison finding: self-consistency is "extremely competitive" vs MAD in budget-aware evaluation; MAD only wins on hard math with heterogeneous agents
- No published papers compare MAD directly to o1/o3 reasoning models (gap as of early 2026)
- See: debate-output-quality-research.md for full analysis

## QBAF Multi-Agent Merging — Established Facts
- Best paper: "Retrieval- and Argumentation-Enhanced Multi-Agent LLMs for Judgmental Forecasting" (arxiv 2510.24303)
- Multi-Agent QBAF Combinator algorithm (Algorithm 1): layer-by-layer bottom-up clustering, NOT union-find
  - Similarity metric: Jina-V3 embeddings + cosine similarity, threshold δ=0.5
  - Hard constraint: only merge arguments with the same parent AND same relation type (support OR attack)
  - Never merges arguments with different parents or opposite relations to same parent
  - Avoids transitive merging by design — pairwise constraint before any union step
- Faultline's `buildCommunityGraph` uses union-find with MAX_GROUP_SIZE=5 cap — this is directionally correct but the paper suggests the parent-relation constraint is more principled

## QBAF Pivotal Argument Identification — Established Facts
- Three main families: (A) removal-based AAEs, (B) Shapley-based AAEs, (C) gradient-based (partial derivative of σ w.r.t. τ)
- Removal-based: φ(β→α) = σ(α) - σ_{A\{β}}(α) — simple, fast, local
- Shapley-based: game-theoretic average across coalitions; approximated via 1000-sample Monte Carlo (Yin et al. 2023)
- Gradient-based: ∂σ(root)/∂τ(node) under DF-QuAD; captures sensitivity vs. removal-based absolute impact
- Contribution functions survey: arxiv 2401.08879 (Kampik, Potyka et al. 2024) — no single function satisfies all principles
- CE-QArg (arxiv 2407.08497, KR 2024): counterfactual explanation algorithm; polarity via path DFS (even/odd attack count); priority = 1/shortest_path_length; batch updates proportional to priority
- Counterfactual/sufficient/necessary explanations (arxiv 2509.18215): pivotal = argument appearing in all minimal counterfactual explanations
- Faultline's `counterfactualImpact` in df-quad.ts implements removal-based approach correctly (recomputes without node+edges)

## Claim Normalization — Established Facts
- No published QBAF-specific claim normalization standard exists
- ArgRAG (arxiv 2508.20131): nodes are raw natural language text, no preprocessing; LLM handles stylistic variation
- Relation-based AM papers: entity masking suggested as future work but not implemented — LLM comparison handles variation
- Cross-agent comparison: use LLM batch comparison (as Faultline does) rather than string matching; this is the consensus approach
- Edge-type separation from content is handled architecturally (separate Att/Sup sets), not via text preprocessing
- See: qbaf-research.md for full analysis
