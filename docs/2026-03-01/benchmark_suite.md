# Faultline Benchmark Suite

**Date:** March 1, 2026 (revised March 3, 2026)
**Goal:** Prove that structured multi-agent disagreement identifies decisive variables better than single-model reasoning.

---

## Core Claim

Faultline's value proposition is **better identification of decisive variables** — the specific assumptions that, if wrong, flip the conclusion. The benchmark must measure exactly that with objective ground truth, not LLM-generated proxies.
'
---

## CIG Benchmark v2: Hidden Crux Discovery
'
### Design Principle

Each task contains a **hidden crux** — a single variable that determines the correct answer. The task is structured so that:

1. The question has a clear binary answer (yes/no, buy/sell, approve/reject)
2. The answer depends on a specific hidden variable
3. Models that miss the hidden variable give the wrong answer
4. Models that find it give the right answer

This eliminates LLM-self-referential scoring. Ground truth is objective.

### Task Structure

Each task in `data/benchmarks/crux-tasks.json`:

```json
{
  "id": "task-id",
  "question": "Should Company X enter Market Y?",
  "context": "Background information with enough signal to reason about the question. Contains clues pointing toward the hidden crux but does not state it directly.",
  "hiddenCrux": "Regulatory approval probability is <20% due to pending antitrust action",
  "correctAnswer": "no",
  "wrongAnswer": "yes",
  "wrongReasoning": "Market size and margins look attractive, demand is growing",
  "category": "strategy|investment|policy|technology",
  "difficulty": "easy|medium|hard",
  "roles": [
    { "id": "role-a", "label": "Role A", "brief": "domain focus" },
    { "id": "role-b", "label": "Role B", "brief": "domain focus" }
  ]
}
```

Key constraint: the `context` must be detailed enough that a careful analyst *could* find the crux, but a model doing surface-level reasoning will miss it and give the wrong answer.

### The 4 Conditions

Same structure as CIG v1 — compare approaches on identical tasks:

| Condition | Description |
|-----------|-------------|
| **single** | One Sonnet call: answer the question, list key assumptions |
| **cot** | One Sonnet call with structured chain-of-thought |
| **crux** | Role-based: parallel analyst perspectives → disagreement detection → crux extraction |
| **belief-graph** | QBAF extraction → debate rounds → community graph → structural crux identification |

### Scoring Metrics

#### 1. Crux Discovery Rate (CDR) — Primary

*Did the system identify the hidden variable?*

```
CDR = tasks_where_hidden_crux_was_surfaced / total_tasks
```

Scored by Haiku judge: does any surfaced assumption match the hidden crux (strict semantic match — same causal mechanism)? Binary per task.

This replaces DAR. Ground truth is objective (human-authored, tied to task outcome), not LLM-generated.

#### 2. Decision Accuracy (DA)

*Did the system reach the correct conclusion?*

```
DA = correct_final_answers / total_tasks
```

Extract the system's final answer (yes/no). Compare to `correctAnswer`. Binary per task.

This is the most important downstream metric. If crux discovery doesn't improve decision accuracy, it's not useful.

#### 3. Assumption Efficiency (AE)

*How many assumptions before the decisive one?*

```
AE = rank_of_hidden_crux_in_assumption_list
```

If the hidden crux is the 2nd assumption listed, AE = 2. If it's the 8th, AE = 8. If not found, AE = ∞.

Lower is better. Measures whether the system prioritizes decisive variables over noise. A system that dumps 20 assumptions with the crux buried at #17 is worse than one that surfaces 5 with the crux at #2.

#### 4. Flip Sensitivity (FS)

*Does the conclusion actually change when the crux flips?*

```
FS = true/false
```

Take the system's analysis. Inject: "Assume [hidden crux] is false." Check if the conclusion coherently flips. Validates that the system's reasoning is structurally dependent on the crux, not just mentioning it.

Run on every surfaced assumption (not just the first). The fraction of assumptions that are genuinely load-bearing is a quality signal.

```
FS_rate = load_bearing_assumptions / total_assumptions
```

#### 5. Blind Judge (auxiliary)

Same as v1. Rate raw output on clarity (1-5), robustness (1-5), novelty (1-5). Haiku as blind evaluator. Auxiliary — does not determine winner.

### Metrics Retired from v1

| Metric | Why retired |
|--------|-------------|
| **DAR** (Decisive Assumption Recall) | Ground truth was LLM-generated. Measured agreement with benchmark author, not correctness. A strong model that disagrees with the ground truth and is more correct would be penalized. |
| **ANS** (Assumption Novelty Score) | Rewarded difference, not usefulness. A model could generate exotic irrelevant assumptions and score well. |

### Task Bank

Target: 50 tasks across 5 categories, 10 per category.

| Category | Example question | Hidden crux type |
|----------|-----------------|-----------------|
| **Strategy** | Should Company X enter Market Y? | Regulatory, competitive, or market structure variable |
| **Investment** | Is Asset X undervalued at current price? | Hidden risk, misunderstood driver, or structural shift |
| **Policy** | Should City X adopt Policy Y? | Implementation constraint, second-order effect, or stakeholder dynamic |
| **Technology** | Will Technology X reach production scale by 20XX? | Supply chain bottleneck, physics constraint, or adoption barrier |
| **Forecasting** | Will Metric X exceed Threshold Y by 20XX? | Regime change, feedback loop, or measurement artifact |

Task difficulty tiers:

| Difficulty | Description | Expected single-model CDR |
|------------|-------------|--------------------------|
| **Easy** | Crux is hinted at in context, just needs to be prioritized | ~60-70% |
| **Medium** | Crux requires connecting two pieces of context | ~30-40% |
| **Hard** | Crux requires domain reasoning not directly in context | ~10-20% |

If single-model CDR is >50% on hard tasks, the tasks aren't hard enough. If crux condition CDR isn't meaningfully higher than single on medium/hard, crux extraction isn't adding value.

### Runner

```bash
cd faultline
npm run crux-bench                                          # all tasks, all conditions
npx tsx scripts/run-crux-benchmark.ts --task task-id         # single task
npx tsx scripts/run-crux-benchmark.ts --difficulty hard       # filter by difficulty
npx tsx scripts/run-crux-benchmark.ts --category investment   # filter by category
```

Results to `data/benchmarks/crux-results/`. Per-task JSON + `_summary.json`.

### Summary Output

```json
{
  "timestamp": "...",
  "taskCount": 50,
  "cdr": { "single": 0.34, "cot": 0.42, "crux": 0.58, "belief-graph": 0.62 },
  "da":  { "single": 0.40, "cot": 0.48, "crux": 0.64, "belief-graph": 0.66 },
  "ae":  { "single": 4.2,  "cot": 3.8,  "crux": 2.1,  "belief-graph": 1.8 },
  "fs_rate": { "single": 0.35, "cot": 0.40, "crux": 0.55, "belief-graph": 0.60 },
  "tokenCost": { ... }
}
```

The YC slide: "Crux agents find the decisive variable 62% of the time vs 34% for a single model. Decision accuracy improves from 40% to 66%."

### What Constitutes a Win

- CDR: crux or belief-graph must beat single by **>15 percentage points** on medium+hard tasks
- DA: crux or belief-graph must beat single by **>10 percentage points**
- AE: crux or belief-graph must have lower mean rank (decisive assumption surfaces earlier)
- If these don't hold, structured disagreement isn't adding epistemic value over prompting tricks

---

## CIG Benchmark v1 (Deprecated)

Kept for reference. Results in `data/benchmarks/cig-results/`.

v1 used LLM-generated ground-truth assumptions (DAR) and novelty-over-baseline (ANS) as primary metrics. These are self-referential — they measure agreement with the benchmark author's LLM, not objective correctness. See "Metrics Retired" above.

The 4 conditions, task bank structure, and belief-graph pipeline from v1 carry forward into v2 unchanged. Only the scoring and task design changed.

### v1 Results (1 of 5 tasks)

| Condition | DAR | Judge (C/R/N) | Tokens (in/out) |
|-----------|-----|---------------|-----------------|
| single | 0.625 | — | 5.4K / 2.8K |
| cot | 0.750 | — | 11.6K / 4.9K |
| belief-graph | 0.750 | 2 / 4 / 4 | 14.4K / 9.2K |

---

## Dialogue Benchmark (Development Only)

The 6 metrics below are for **internal development** — measuring debate quality, not proving product value. They validate that the dialogue system works correctly but are not suitable for external proof because they rely on embedding similarity and LLM extraction.

### 1. Belief Adherence (BA)

*Does the agent reason from its belief graph?*

```
BA(persona) = grounded_claims / total_claims
```

Cosine similarity against belief graph nodes. Threshold: 0.7. Good: > 0.6.

### 2. Stance Diversity (ΔSD)

*Do agents maintain their positions or collapse into agreement?*

```
ΔSD = SD(closing_stances) - SD(opening_stances)
```

Good: >= 0 (diversity maintained). Bad: < 0 (sycophantic convergence). From DEBATE benchmark (Chuang et al.).

### 3. Semantic Spread

*Are agents saying different things or parroting each other?*

```
spread(round) = mean(1 - cos_sim(msg_i, msg_j)) for cross-persona pairs
```

Track across rounds. Decreasing spread = homogenization.

### 4. Crux Grounding (CG)

*Are crux cards based on what was actually said?*

```
CG = mean(cos_sim(card_embedding, source_messages_embedding))
```

Good: > 0.55.

### 5. Crux Recurrence (CR)

*Same cruxes across repeated runs?*

```
CR = stable_clusters / total_clusters (5 runs, HDBSCAN clustering)
```

Good: > 0.4.

### 6. Accuracy (ACC)

*For topics with known answers, does debate converge toward truth?*

```
ACC = correct_majority_stances / total_verifiable_claims
```

Compare against self-consistency (5 samples, majority vote). If ACC doesn't beat self-consistency, multi-agent debate isn't adding epistemic value.

---

## How to Run

### Hidden Crux Benchmark (Primary — External Proof)

1. Write tasks in `data/benchmarks/crux-tasks.json` (question, context, hidden crux, correct answer).
2. Run `npm run crux-bench`.
3. Per-task results to `data/benchmarks/crux-results/{task-id}.json`.
4. Summary to `data/benchmarks/crux-results/_summary.json` (CDR, DA, AE, FS by condition).

### Dialogue Benchmark (Development Only)

1. Pick 10 topics, 3 persona pairs.
2. Run each config 3 times.
3. Post-debate: embed messages, extract stances via Haiku.
4. Compute 6 metrics. Store as JSON per debate.

---

## Priority

1. **Hidden Crux Benchmark** — write 10 tasks, implement runner, validate that crux/belief-graph beats single on CDR + DA.
2. **Scale to 50 tasks** — cover all 5 categories, 3 difficulty tiers.
3. **ΔSD + Semantic Spread** — development metrics for dialogue quality.
4. **BA, CG, CR** — development metrics for belief graph and crux card quality.

---

## Sources

- [DEBATE benchmark (Chuang et al.)](https://arxiv.org/abs/2510.25110) — ΔSD
- [PRISM / Artificial Hivemind (Tu et al.)](https://arxiv.org/abs/2602.21317) — Semantic Spread
- [Can LLM Agents Really Debate? (Wu et al.)](https://arxiv.org/abs/2511.07784) — Self-consistency baseline
- [ArgLLMs (Freedman et al., AAAI 2025)](https://arxiv.org/abs/2405.02079) — QBAF architecture
- [Moltbook (Li et al.)](https://arxiv.org/abs/2602.14299) — Drift/spread metrics
