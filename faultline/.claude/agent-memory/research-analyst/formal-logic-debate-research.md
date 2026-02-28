# Formal Logic for Debate Disagreement Detection — Research Notes

## R-Debater (Dec 2024)
- Paper: arxiv.org/abs/2512.24684
- Authors: Maoyuan Li, Zhongsheng Wang, Haoyuan Li, Jiamou Liu (Wuhan College of Communication + U Auckland)
- NOT IBM — separate from Project Debater
- Uses "pseudo-FOL": LLM-generated predicate strings, not formally verified logic
- Predicate forms: `Cause(A,B)`, `Supports(A,B)`, `Contrast(A,B)`, `Negate(P)`, `Disrupts(X,Y)`, `Decrease(X,Y,amount)`
- Three-step pipeline: f_pred (extract predicates) -> f_infer (build reasoning chain) -> f_logic (identify flaws)
- Outputs natural-language "control signals" like "False dichotomy: (Questioning→Disorder) is invalid"
- Human preference rate: 76.32% vs baselines (Agent4Debate 15.79%, plain LLM 7.89%)
- IMPORTANT: FOL is used for REBUTTAL GENERATION, not disagreement detection per se

## NL2FOL (May 2024)
- Paper: arxiv.org/abs/2405.02318
- True formal FOL + SMT (CVC solver) for logical fallacy detection
- Pipeline: semantic decomposition -> entity/relation extraction via NLI -> predicate construction -> SMT check
- Satisfiable negation = fallacy; unsatisfiable = valid
- Results: 71% F1 (standard), 73% F1 (adversarial) — beats GPT-4 (45%) on adversarial
- Critical limitation: requires explicit ground-truth semantic relationships; fails on implicit context
- Slow: multiple LLM calls + SMT compilation per statement
- Not designed for multi-turn conversation disagreement detection

## MQArgEng (May 2024)
- Paper: arxiv.org/abs/2405.13036
- Uses Dung Argumentation Framework + ASPARTIX (Answer-Set-Programming solver)
- Pipeline: 9 arguments generated (3 responses x 3 args each) -> conflict detection -> AF graph -> ASPARTIX extension -> inject acceptable args into final response
- Results: only +2.18% overall improvement; some categories REGRESSED (writing, roleplay)
- Conclusion: marginal gains don't justify complexity

## LLM Debate Judge Research (2025)
- Paper: arxiv.org/abs/2509.15739
- Uses QuAD (bipolar gradual) semantics, Spearman ρ correlation
- Best model alignment: ρ=0.46 (weak-moderate) on small debates
- Degrades substantially on larger debates; chronological bias observed
- Conclusion: LLMs cannot reliably judge formal argumentation structure

## "Can LLM Agents Really Debate?" (Nov 2024)
- Paper: arxiv.org/abs/2511.07784
- Key finding: without formal verification, agents converge on wrong answers via social dynamics
- LLMs favor "fluent but logically thin" arguments over rigorous ones
- Structural constraints needed, not just more debate turns
