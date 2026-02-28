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
