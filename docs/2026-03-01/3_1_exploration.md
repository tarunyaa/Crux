# Exploration: Scaling Laws for Multi-Agent Debate

**Date:** March 1, 2026 | **Type:** Decision document | **Updated:** open-source model assumption
**Full research:** `research_benchmarks.md`, `research_belief_graphs.md`, `research_latent_states.md`

---

## 1. Vision

Faultline's bet: structured disagreement tracking (crux rooms + cards) produces measurably better epistemic outcomes than naive multi-agent debate. The three ideas below are mechanisms to make that bet testable. Belief graphs give agents internal structure to measure. Belief vectors make updates quantifiable. Community graphs make inter-agent dynamics visible. The unified goal is an empirical measurement framework for epistemic dynamics in multi-agent debate -- the first of its kind.

**Model assumption:** Open-source models (Llama, Qwen, Mistral, etc.) with full weight access. This removes the API wall that previously blocked latent-space debate, LoRA persona baking, activation steering, and trainable auxiliary networks. The feasibility landscape changes dramatically.

## 2. The Scaling Law Hypothesis

No clean universal scaling law for multi-agent debate exists. The neural scaling law (loss ~ compute^-a) has no analog here. What the literature supports is a **conditional scaling relationship**:

```
debate_quality ~ f(epistemic_divergence, belief_complexity) * g(rounds)
```

Where `g(rounds)` is logistic with plateau at ~3-5 rounds (MacNet/ICLR 2025), and the interesting variables are:

| Variable | Definition | Measurable? |
|----------|-----------|-------------|
| Epistemic divergence | Sum of \|c_A(P) - c_B(P)\| over shared propositions | Yes, with belief vectors |
| Belief complexity | Active belief graph nodes per persona | Yes, with offline extraction |
| Topic difficulty | Factual vs. evidential vs. values-based | Classifiable (proxy: crux count) |
| Debate quality | CCR * (1 + deltaSD) -- resolution without diversity loss | Yes, from crux cards + stances |

**The defensible claim:** debate quality scales with initial epistemic divergence and belief complexity, up to a threshold where agents lack shared vocabulary for productive exchange. This is an inverted-U hypothesis.

**With open-source models, a stronger claim becomes testable:** debate quality scales with the *structural diversity of reasoning processes* (different LoRA adapters, different belief graph topologies, different activation profiles), not just the diversity of conclusions. This is the "how you think" vs "what you think" distinction from `deep-persona-simulation-papers.md`. Prompt-only persona differentiation hits a hard ceiling (confirmed by multiple papers). Weight-level differentiation may break through it.

**Honest assessment:** Still a measurement framework, not a theoretical law. But with weight access, you can measure hidden-state divergence directly (not just text-level proxies), which makes the empirical case much stronger. Workshop-publishable with 50+ debates. Full venue with baselines + hidden-state analysis.

## 3. Idea #1: Epistemic Belief Graphs + Argumentation Frameworks

**What it is:** Each persona gets an offline-extracted causal belief graph (nodes = claims/values, edges = support/attack with polarity and confidence). During debate, relevant nodes are injected into context. QBAF semantics formalize crux extraction.

**Practical now:**
- Causal triple extraction from corpus: validated by CausalRAG (ACL 2025), KGGen, Causal-LLM. Extract `(cause, effect, polarity, confidence)` from 280-token chunks. Runs once per persona.
- QBAF-based crux extraction: ArgLLMs (AAAI 2025) has public code. Build argument graph from crux room, apply DF-QuAD deterministically, find max-attack-contribution node = crux. ~200 lines TypeScript.
- Read-only graph injection into crux room context: trivial extension.

**Newly unlocked by open-source models:**
- **Graph-conditioned LoRA**: Fine-tune per-persona LoRA adapters where the training signal includes the belief graph structure. The adapter learns to reason *through* the graph, not just reference it from context. CharLoRA (ACL Findings 2025) demonstrates multi-expert LoRA separating style from reasoning -- extend this with belief graph grounding.
- **Graph-to-embedding mapping**: Embed belief graph nodes using the model's own embedding layer. Measure which hidden-state dimensions activate when the model processes belief-relevant content. This gives you a direct mapping between the symbolic graph and the model's internal representations.
- **Full graph-text-graph round-trip**: With weight access, you can train a lightweight adapter that maps model outputs back to belief graph updates. The extraction direction (text→graph) is validated; the update direction (debate output→graph mutation) becomes trainable rather than prompt-engineered.

**Not practical (still):**
- GenMinds do-calculus -- no CPDs, uncomputable as specified. Position paper with zero implementation.
- LLM-ASPIC+ for open debate -- rule extraction from free-form text too brittle regardless of model access.

**Critical assessment:** Highest-value idea. With open-source models, belief graphs go from "context injection" to "structural conditioning" -- the model doesn't just *see* the graph, it *reasons through* it via adapted weights. This is the difference between giving someone a map and teaching them the terrain.

## 4. Idea #2: Latent Belief States

**With open-source models, all three approaches become feasible:**

| Approach | Previously | Now | Verdict |
|----------|-----------|-----|---------|
| True latent debate (Coconut, LatentMAS) -- hidden state / KV cache exchange | Dead end (API wall) | **Feasible.** Requires GPU infra + HF models. | High-risk, high-reward. Research novelty is here. |
| BNE coordination (ECON/ICML 2025) -- trainable Q-networks around LLM calls | Too heavy | **Feasible.** BeliefNetwork + BeliefEncoder are small trainable components. | Worth exploring for convergence guarantees. |
| Structured belief vectors -- proposition confidence scores | Already feasible | Still feasible, now with better calibration via hidden states. | **Build first** as baseline. |

**What changes with weight access:**

**LatentMAS (arXiv:2511.20639)** is the headline unlock. Agents exchange information through layer-wise KV cache transfers instead of text. Results: up to 14.6% accuracy improvement, 70-83% token reduction, 4x speed improvement over text-based multi-agent systems. The mechanism: after each agent processes its input, it shares selected KV pairs with other agents, who incorporate them as additional context without re-processing the full text. This is *actual* latent-space debate -- agents communicate below the token level.

**For Faultline specifically:** Instead of Agent A generating text → Agent B reading text → Agent B responding, you get Agent A generating hidden states → shared KV cache → Agent B's response is conditioned on A's *reasoning process*, not just A's *conclusion*. This could produce fundamentally different debate dynamics. The disagreement isn't just "I disagree with what you said" but "my internal reasoning process diverges from yours at layer N."

**Coconut (arXiv:2412.06769)** enables continuous thought -- the model feeds hidden-layer embeddings back as input without tokenization. BFS-style reasoning in continuous space. Applied to debate: agents could "think" about counterarguments in latent space before committing to text. This separates the reasoning process (continuous, richer) from the communication (text, lossy).

**ECON (arXiv:2506.08292)** becomes fully viable. The BeliefNetwork and BeliefEncoder are small (<1M param) trainable components that wrap around the LLM calls. Training loop is lightweight DQN-style Q-learning. With open-source models, the full ECON pipeline (Coordinator → Executors → BeliefNetwork → Mixer) is implementable. Caveat: ECON is validated on math benchmarks. BNE convergence in opinion debate may still mean sycophancy. Test explicitly.

**Belief vectors get better calibration.** Instead of LLM-verbalized confidence scores (unreliable), extract confidence from hidden-state activations. Probing classifiers on the model's internal representations are better calibrated than self-reported scores. This directly addresses the calibration warning from the original document.

**Critical assessment:** The research novelty shifts. With API-only, Faultline's contribution was the measurement framework. With weight access, the contribution becomes: **does latent-space debate produce different epistemic dynamics than text-space debate?** This is a genuinely new question nobody has answered for opinion/values debate. LatentMAS was validated on math/code/science -- testing it on structured disagreement is novel.

**Risk:** Infrastructure complexity jumps significantly. You need GPU hosting, model serving (vLLM/TGI), custom KV cache manipulation code. This is a research engineering project, not a weekend hack.

## 5. Idea #3: Minimal Community Debate Graph

**What it is:** The overlay of individual belief graphs during debate. Shared proposition nodes, per-persona confidence edges, crux cards as resolved intersection points. After debate, the community graph shows: where agents agree (high shared confidence), where they disagree (divergent confidence), what was resolved (crux card links).

**Related formalisms:** Belief merging (Konieczny & Pino Perez) and judgment aggregation (List & Pettit) both warn: naive aggregation of individually consistent belief sets produces inconsistent merged sets. The community graph should *display* disagreement structure, not attempt to merge beliefs.

**Newly unlocked:** With hidden-state access, the community graph gains a latent dimension. You can project each agent's hidden-state trajectory onto a shared embedding space and visualize debate as movement through that space. Convergence/divergence becomes geometric -- literally visible as trajectories approaching or separating. This is no longer just a display of crux card metadata; it's a visualization of the model's internal belief dynamics.

**Critical assessment:** Upgraded from "visualization insight" to "potential measurement tool." The hidden-state trajectory visualization could be the paper's signature figure -- showing how structured debate (crux rooms) produces different trajectory patterns than unstructured debate. But don't build the visualization before you have the latent-space infrastructure. The community graph is a *downstream display*, not a standalone feature.

## 6. Benchmark Suite

### Tier 1: Implement Now (from debate outputs + embeddings)

| Metric | Source | Formula | Target |
|--------|--------|---------|--------|
| **Stance Variance (deltaSD)** | DEBATE benchmark | SD_post - SD_pre over persona x crux stances | >= 0 |
| **Homogenization Score** | PRISM/Hivemind | avg pairwise cosine(embed(msg_i), embed(msg_j)) per round | not increasing |
| **Position Drift (D_a)** | Moltbook | 1 - cos(embed(opening_a), embed(closing_a)) | > 0 for crux participants |
| **CCR** | Existing | resolved_cruxes / total_cruxes | >= 0.5 |
| **Disagreement Entropy** | Existing | Shannon H over disagreement type distribution | maintained |

**deltaSD is the single most important metric.** deltaSD < 0 = system failing (false consensus). deltaSD >= 0 with CCR > 0 = the system works.

### Tier 2: After Belief Graphs + Weight Access

- Epistemic Divergence: sum |c_A(P) - c_B(P)| -- the scaling law's independent variable
- **Hidden-State Divergence**: cosine distance between agent hidden states at matched layers during debate. The latent-space analog of deltaSD.
- **Reasoning Trace Differentiation**: do LoRA-adapted personas produce measurably different activation patterns? (PCA on hidden states per persona -- if they cluster by persona, differentiation is real)
- Crux Recurrence Rate: embed crux cards cross-session, cluster, measure tightening
- Interaction Influence Delta: does crux room participation change subsequent takes? (Moltbook)

### Tier 3: Aspirational

- Traceability Score: fraction of crux claims grounded in specific corpus chunks
- Counterfactual Robustness: "if evidence X changed, does persona Y update consistently with graph?"
- Anti-Conformity Index: belief shift magnitude vs. argument quality ratio
- **Latent vs. Text Debate Comparison**: same debate, same personas, run in text-space and latent-space. Compare all Tier 1+2 metrics. This IS the paper.

## 7. Proposed Approach

### Build order

**Phase A: Text-space baseline (works with any model)**
1. **Offline belief graph extraction** -- extend `build-personas.ts`. Output: `data/seed/beliefs/[Name].json`. Unlocks everything else.
2. **Belief vectors** -- proposition confidence tracking. Pure data structure + LLM update calls.
3. **Tier 1 benchmarks** -- embed messages, compute deltaSD + homogenization + drift. Persist to DB.
4. **QBAF crux extraction** -- port from ArgLLMs Python reference. Deterministic, auditable crux cards.

**Phase B: Weight-access features (requires open-source model deployment)**
5. **Model serving** -- Deploy chosen model via vLLM or TGI. Expose hidden states.
6. **Per-persona LoRA adapters** -- Fine-tune on persona corpus. CharLoRA-style separation of style vs. reasoning.
7. **LatentMAS integration** -- KV cache sharing between debate agents. Compare text-debate vs latent-debate on Tier 1 metrics.
8. **Hidden-state belief extraction** -- Probing classifiers for belief confidence from activations (replaces LLM-verbalized scores).

**Phase C: The paper experiments**
9. **Self-consistency baseline** -- does crux debate beat single-agent resampling?
10. **Text vs. latent debate comparison** -- same personas, same topics, different communication channels.
11. **LoRA vs. prompt-only persona comparison** -- do weight-adapted personas produce genuinely different reasoning (measured by hidden-state divergence)?
12. **Epistemic divergence scaling curve** -- vary initial belief graph distance, measure CCR + deltaSD.

### Experiments (updated)

| Experiment | IV | DV | Hypothesis |
|-----------|----|----|------------|
| Self-consistency baseline | Crux debate vs. single-agent resampling | deltaSD, CCR | Crux rooms must outperform. **Run first.** |
| Text vs. latent debate | Communication channel (text / KV cache) | deltaSD, CCR, hidden-state divergence | Latent debate preserves more reasoning structure |
| LoRA vs. prompt personas | Persona method (LoRA / prompt-only) | Hidden-state clustering, deltaSD | LoRA produces genuinely differentiated reasoning |
| Divergence vs. resolution | Initial belief vector distance | CCR + crux quality | Inverted U |
| Belief complexity scaling | Graph nodes per persona (5/20/50) | deltaSD + CCR | More nodes -> higher CCR without sacrificing deltaSD |
| Model diversity | Same model vs. mixed models | deltaSD, homogenization | Mixed models resist over-convergence |

### Paper contribution

"We introduce the first empirical comparison of text-space and latent-space multi-agent debate on opinion/values topics. Using per-persona LoRA adapters grounded in epistemic belief graphs, we show that weight-level persona differentiation produces measurably different reasoning traces (hidden-state divergence) compared to prompt-only differentiation. We characterize the divergence-resolution tradeoff using structured crux rooms and identify epistemic divergence as a scaling dimension for debate quality."

This is a full venue paper if the latent vs. text comparison shows meaningful differences. If it doesn't, you still have the measurement framework contribution (workshop-level).

## 8. New Directions

**Self-consistency baseline is still existential.** Wu et al. (arXiv:2511.07784) showed most claimed multi-agent debate benefits are just self-consistency. Run this first regardless of model choice.

**LoRA persona baking is now the highest-leverage unlock.** Prompt baking (arXiv:2409.13697) minimizes KL divergence between prompted and unprompted model -- the persona becomes part of the weights. CharLoRA separates style from reasoning. With weight access, persona consistency across long debates becomes a solvable problem rather than a prompting challenge.

**Activation steering for epistemic style.** Representation engineering (Zou et al.) can find "epistemic caution" vs "epistemic confidence" directions in activation space. Steer different personas along different directions. This is a direct mechanism for "how you think" differentiation.

**Mixed-model debates become trivially testable.** Run some personas on Llama, others on Qwen. Diverse model pools outperform single-model setups (arXiv:2410.12853). With open-source, this is a config change, not an architecture change.

**PCA distributional diversity as a cheap diagnostic.** Embed all takes per round, PCA, measure spread. Tight clustering = personas not genuinely differentiated. With hidden states available, run PCA on activations directly -- much more informative than text embeddings.

## 9. Critical Gaps

**Self-consistency baseline could invalidate everything.** Same as before. Run first.

**Infrastructure complexity jumps.** Open-source model serving, GPU hosting, custom KV cache code, LoRA training pipelines. This is a 10x increase in engineering surface area vs. API calls. Budget GPU costs realistically.

**No validated latent-space debate on opinion topics.** LatentMAS is validated on math/code/science with ground truth. Opinion debate has no ground truth. "Better" is harder to define. The deltaSD + CCR framework is the proposed answer, but it's your framework -- it hasn't been externally validated.

**LoRA quality depends on corpus quality.** Per-persona LoRA adapters are only as good as the training corpus (~100 tweets + essays per persona). May need to augment with synthetic data. Risk of overfitting to small corpus.

**The graph-text-graph round-trip is still unvalidated.** Weight access makes it *trainable* but doesn't make it *validated*. Plan to evaluate extraction fidelity explicitly.

**Model capability ceiling.** Open-source 7B-70B models are weaker than Claude Sonnet/Opus at nuanced opinion debate. You gain weight access but may lose generation quality. Test whether the structural advantages (LoRA, latent debate) overcome the raw capability gap. If 70B + LoRA + belief graphs < Claude + prompt-only, that's a finding too.

**Sample size.** 50+ debates across 10+ topics. With self-hosted inference, compute cost replaces API cost. Batch efficiently.
