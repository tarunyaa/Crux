# Faultline Benchmark Suite

**Date:** March 1, 2026
**Goal:** Measure whether epistemic MAD produces better debates, and whether quality scales with agent belief complexity/divergence.

---

## The 6 Metrics

### 1. Belief Adherence (BA)

*Does the agent actually reason from its belief graph?*

For each claim an agent makes during debate, embed it and check cosine similarity against their belief graph nodes. If the nearest node is above 0.7 similarity, the claim is "grounded."

```
BA(persona) = grounded_claims / total_claims
```

Good: > 0.6. If BA doesn't increase when you add belief graphs, the graphs aren't doing anything.

### 2. Stance Diversity (ΔSD)

*Do agents collapse into agreement, or maintain their positions?*

Extract each persona's stance on each contested claim (scale: -2 to +2) from their opening and closing statements. Compute standard deviation across personas before and after.

```
ΔSD = SD(closing_stances) - SD(opening_stances)
```

Good: >= 0 (diversity maintained). Bad: < 0 (sycophantic convergence). This is the single most important metric — from the DEBATE benchmark (Chuang et al.).

### 3. Semantic Spread

*Are agents actually saying different things, or parroting each other?*

Embed every message. For each round, compute mean pairwise cosine distance between messages from different personas.

```
spread(round) = mean(1 - cos_sim(msg_i, msg_j)) for all cross-persona pairs
```

Track across rounds. If spread decreases steeply, agents are homogenizing. Plot it — this is the "Artificial Hivemind" detector.

### 4. Crux Grounding (CG)

*Are crux cards based on what was actually said?*

For each crux card, embed the card's question + diagnosis. Embed the source messages it references. Compute cosine similarity.

```
CG = mean(cos_sim(card_embedding, source_messages_embedding)) across all cards
```

Good: > 0.55. Below that, crux cards are hallucinating content not present in the exchange.

### 5. Crux Recurrence (CR)

*Does the system find the same cruxes when you run the same debate multiple times?*

Run the same debate 5 times. Embed all crux card questions. Cluster them (HDBSCAN). Count how many clusters span 3+ runs.

```
CR = stable_clusters / total_clusters
```

Good: > 0.4. If cruxes are completely random across runs, the system isn't detecting real structure.

### 6. Accuracy (ACC)

*For topics with known answers, does debate converge toward truth?*

Build a small dataset of debate topics containing verifiable claims (adapt from TruthfulQA/StrategyQA). Check whether the majority closing stance aligns with ground truth.

```
ACC = correct_majority_stances / total_verifiable_claims
```

Compare against: (a) single-agent answer, (b) self-consistency (5 samples, majority vote). **If ACC doesn't beat self-consistency, multi-agent debate isn't adding epistemic value.** Run this comparison first.

---

## What to Vary

| Variable | Values | Why |
|----------|--------|-----|
| Belief graph nodes per persona | 0 / 20 / 50 | Does belief complexity improve BA, ΔSD, CR? |
| Architecture | Current dialogue / QBAF crux / belief graph injection / latent | Which MAD variant wins? |
| Initial epistemic divergence | Low / Medium / High | Does divergence improve quality or cause breakdown? |

## How to Run

1. Pick 10 topics, 3 persona pairs.
2. Run each config 3 times (= 30 debates per condition).
3. Post-debate: embed all messages (BGE-large locally), extract claims + stances via Haiku.
4. Compute the 6 metrics. Store as JSON per debate.
5. Compare conditions with Mann-Whitney U + bootstrap CIs.

---

## Priority

1. **Self-consistency baseline** — if debate doesn't beat this on ACC, stop and rethink.
2. **ΔSD + Semantic Spread** — the two diversity metrics. If these fail, the system produces false consensus.
3. **BA** — validates that belief graphs actually affect agent reasoning.
4. **CG + CR** — validates crux card quality and reliability.

---

## Sources

- [DEBATE benchmark (Chuang et al.)](https://arxiv.org/abs/2510.25110) — ΔSD
- [PRISM / Artificial Hivemind (Tu et al.)](https://arxiv.org/abs/2602.21317) — Semantic Spread
- [Can LLM Agents Really Debate? (Wu et al.)](https://arxiv.org/abs/2511.07784) — Self-consistency baseline
- [ArgLLMs (Freedman et al., AAAI 2025)](https://arxiv.org/abs/2405.02079) — QBAF architecture
- [Moltbook (Li et al.)](https://arxiv.org/abs/2602.14299) — Drift/spread metrics
