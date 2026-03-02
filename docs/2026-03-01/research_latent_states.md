# Research: Latent Belief States for Multi-Agent Debate

**Date:** March 1, 2026 | **Updated:** open-source model assumption
**Scope:** Feasibility of having LLM agents "argue in belief latent space" and whether a scaling law for multi-agent debate is achievable. This document is the full reference for the Idea #2 section in `docs/3_1_exploration.md`.

---

## Executive Summary

The phrase "arguing in belief latent space" covers at least three distinct technical concepts that are frequently conflated. Separating them is the first analytical task:

1. **True latent-space debate** — agents communicate via neural hidden states or KV caches instead of text. Requires open-source model weights and GPU access. **Now feasible with open-source models.**

2. **Belief-state-conditioned reasoning** — agents maintain structured symbolic or probabilistic representations of their own and others' beliefs; these states condition LLM prompts without touching model internals. Works with any model. **Build first as baseline.**

3. **Bayesian Nash Equilibrium multi-agent coordination** — agents independently optimize toward equilibrium by tracking probabilistic beliefs about co-agents' strategies, using small trainable neural components (BeliefNetwork, BeliefEncoder) alongside LLMs. **Now fully feasible.** Caveat: validated on math, not opinion debate.

**Bottom line:** With open-source models, all three approaches are implementable. The strategic question shifts from "what's feasible?" to "what's worth the infrastructure cost?" True latent-space debate (LatentMAS) is the highest-novelty research direction — nobody has tested it on opinion/values debate. Structured belief vectors remain the right starting point because they require no GPU infra and produce the measurement layer needed for benchmarks. The build path is: belief vectors first (baseline) → latent debate second (the experiment).

---

## Part 1: What "Latent Belief States" Actually Means

### 1.1 True Latent-Space Debate (Now Feasible)

The canonical paper here is **Coconut** (arXiv:2412.06769, Meta/Facebook Research, 2024). Coconut replaces language-mode CoT tokens with "continuous thought" tokens: the model feeds its last hidden-layer embedding directly back as the next input embedding, bypassing tokenization. This enables BFS-style reasoning in continuous space instead of greedy token selection. The model switches between language mode and latent mode using `<bot>`/`<eot>` markers. This is fully differentiable and outperforms CoT on logical planning benchmarks.

**Relevance to Faultline:** With open-source models (Llama, Qwen, Mistral via HuggingFace), Coconut-style continuous thought is implementable. An agent could "think" about counterarguments in latent space before committing to text. This separates the reasoning process (continuous, richer) from the communication (text, lossy). The question is whether this separation produces meaningfully different debate dynamics on opinion topics, where Coconut has not been validated.

**Implementation path:** Coconut requires modifying the forward pass to loop hidden states back as inputs. This means custom inference code (not just vLLM/TGI out of the box). Feasible but requires model-specific engineering. Start with a single model (Llama 3.3 70B is well-supported) and verify Coconut's continuous thought reproduces on your hardware before integrating into debate.

**LatentMAS** (arXiv:2511.20639, Nov 2025) extends this to multi-agent settings. Agents exchange information through layer-wise KV cache transfers rather than text. Performance gains are real: up to 14.6% accuracy improvement, 70-83% token reduction, 4x speed improvement over text-based MAS on 9 benchmarks (math, science, code, commonsense). The architecture requires direct embedding access and a computed alignment matrix mapping output embeddings to valid input embedding space.

**LatentMAS is the headline unlock for Faultline.** The mechanism: after each agent processes its input, it shares selected KV pairs with other agents, who incorporate them as additional context without re-processing the full text. This is *actual* latent-space debate — agents communicate below the token level. Instead of Agent A generating text → Agent B reading text → Agent B responding, you get Agent A generating hidden states → shared KV cache → Agent B's response is conditioned on A's *reasoning process*, not just A's *conclusion*.

**What this could mean for opinion debate:** The disagreement isn't just "I disagree with what you said" but "my internal reasoning process diverges from yours at layer N." This is a qualitatively different kind of disagreement — and potentially more informative for crux extraction. If two agents' KV caches diverge sharply at a specific layer, that layer's attention pattern may point to the structural source of disagreement.

**Implementation requirements:**
- HuggingFace model with accessible KV cache (Llama 3.x, Qwen 2.5, Mistral)
- Custom inference code to extract and inject KV pairs between agents
- Alignment matrix computation (LatentMAS provides reference code)
- GPU memory: 2 agents × model size in VRAM (or offload with KV cache compression)
- vLLM doesn't natively support KV cache injection — need custom serving or direct HF inference

**Risk:** LatentMAS is validated on tasks with ground truth (math, code). Opinion debate has no ground truth. "Better" latent-space debate is harder to define. The deltaSD + CCR framework from `3_1_exploration.md` is the proposed measurement approach.

### 1.2 Structured Belief State Representations (Works With Any Model)

This remains the right starting point regardless of model choice. Multiple papers demonstrate that explicit structured belief representations, maintained as data structures rather than neural activations, improve multi-agent coordination when injected into LLM prompts.

**CoBel-World** (arXiv:2509.21981, 2025) is the clearest example. Each agent maintains a "Collaborative Belief World" — a PDDL-inspired symbolic belief structure representing the physical environment and collaborators' mental states. Key mechanism: (1) LLM parses natural language observations into symbolic belief predicates; (2) a Bayesian belief collaboration protocol detects miscoordination by asking the LLM to predict possible beliefs; (3) agents communicate adaptively when miscoordination is detected. Result: 64-79% communication cost reduction, 4-28% task completion improvement on embodied benchmarks (TDW-MAT, C-WAH). Zero fine-tuning required.

**The adaptation gap for Faultline:** CoBel-World's belief states track physical world facts (object locations, task completion status). Faultline needs epistemic belief states (proposition confidence levels, claim support relationships, stance trajectories). The belief representation schema needs redesigning, but the protocol (LLM-mediated symbolic update → prompt injection → miscoordination detection) is directly portable.

**Belief Graphs with Reasoning Zones** (arXiv:2510.10042, Nikooroo & Engel 2025) provides the formal structure: a directed signed weighted graph where nodes are beliefs, edges are support/contradiction with weights, and "reasoning zones" are computed via parity-based coloring. Contradiction-tolerant by design. This is model-agnostic: the graph is a data structure maintained outside the LLM; LLM calls read from it and write update proposals to it.

**The Graph-Theoretic Model of Belief** (arXiv:2508.03465, Nikooroo 2025) separates credibility (how well-supported is this belief by evidence?) from confidence (how strongly does the agent endorse it?). This separation matters for debate: two agents can hold the same belief node with different confidence levels, and the crux is the confidence gap rather than a factual dispute.

**With open-source models, belief vectors gain better calibration.** Instead of relying on LLM-verbalized confidence scores (unreliable — models hallucinate plausible numbers), you can train lightweight probing classifiers on the model's hidden-state activations to extract confidence signals. These are empirically better calibrated than self-reported scores. This directly solves the calibration problem flagged as a critical gap.

### 1.3 Bayesian Nash Equilibrium Coordination (Now Fully Feasible)

**ECON** (arXiv:2506.08292, ICML 2025) is the most technically sophisticated paper in the "belief-driven debate" category. It recasts multi-LLM coordination as an incomplete-information game and proves BNE convergence with a tighter regret bound than non-equilibrium schemes.

**Architecture (from GitHub README and OpenReview):**
- **Coordinator LLM**: Generates strategy and format guidelines (≤50 tokens).
- **Executor LLMs**: Multiple agents generating answers conditioned on coordinator strategy.
- **BeliefNetwork**: A *trainable neural network* that manages individual agent belief states and Q-values. This is NOT prompt engineering — it is a separate learned component.
- **BeliefEncoder**: Attention-based group representation aggregator. Also trained.
- **Mixer**: Global Q-value computation using QMIX methodology with similarity-difference loss.
- **Reward signal**: Cosine similarity between executor outputs and the coordinator's commitment embedding (via BAAI/bge-large-en-v1.5 sentence embeddings).

**With open-source models, ECON is fully implementable.** The original implementation uses Together AI (Llama-3.3-70B-Instruct) as the LLM backend. Swapping to self-hosted open-source models is a config change. The BeliefNetwork and BeliefEncoder are small (<1M param) trainable components — PyTorch, standard DQN training loop, runs on a single GPU alongside the LLM.

**Updated verdict on ECON for Faultline:** Infrastructure is no longer the blocker — it's validation scope. ECON is validated on 6 mathematical reasoning benchmarks. BNE convergence in opinion debate is untested. The core risk: BNE convergence in math means converging to the *correct answer*. BNE convergence in opinion debate may mean converging to *sycophantic consensus*, which is exactly what Faultline's anti-conformity mechanisms exist to prevent. If ECON is tested on Faultline debates, the critical metric is deltaSD — does BNE convergence preserve stance diversity?

**Implementation effort:** Medium. ECON's repo is public. The main work is adapting the reward signal (cosine similarity to coordinator commitment) for opinion debate where there's no "correct" answer. One option: replace the single-answer reward with a diversity-preserving reward (penalize over-convergence).

---

## Part 2: What a "Scaling Law for Multi-Agent Debate" Could Mean

### 2.1 The Current State: No Clean Law Exists

The neural scaling law for single-model training is clean: loss decreases as a power function of compute, data, and parameter count. Multi-agent debate has no equivalent.

What exists instead:

**MacNet / Collaborative Scaling** (arXiv:2406.07155, ICLR 2025): Scales to 1,000+ agents using directed acyclic graph topologies. Overall performance follows a **logistic growth pattern** — gains are real but plateau. Irregular topologies outperform regular ones. Key finding: topology matters as much as count.

**Law of Multi-Model Collaboration** (arXiv:2512.23340, 2025): Ensembles follow a power law over total parameter count. Heterogeneous model families (diverse architectures) outperform homogeneous same-family ensembles under equivalent parameter budgets. **Model diversity is a fundamental scaling dimension** complementary to parameters/data/compute. This is the clearest formalized scaling relationship for multi-model systems.

**MAD as Test-Time Scaling** (arXiv:2505.22960, 2025): Key finding — "increasing test-time computation does not always improve accuracy." MAD only shows scalability on specific tasks (GSM8k, MMLU for some configurations, HumanEval). The determinants of effectiveness:
  1. **Task difficulty**: Harder problems benefit more from MAD vs. single-agent scaling.
  2. **Model capability**: Weaker models benefit more from debate; larger models show diminishing returns.
  3. **Agent diversity**: Minimal benefit for math; meaningful benefit for reducing safety vulnerabilities.

**DEBATE benchmark** (arXiv:2510.25110, Chuang et al. 2025): LLM agents over-converge vs humans across 107 topics. This anti-scaling finding matters: more debate rounds can drive worse epistemic outcomes (toward false consensus) unless anti-conformity mechanisms are explicitly built in.

### 2.2 The Most Useful Framing: Conditional Scaling

If forced to write a "scaling law for multi-agent debate," the most defensible formulation is:

```
Performance(D, A, R, T) ≈ f(diversity(A), difficulty(T)) × g(rounds(R))

where:
- D = debate configuration
- A = agent set
- R = round count
- T = topic/task
- diversity(A) = heterogeneity across agent personas/models
- difficulty(T) = empirical difficulty score for the topic
- g(rounds) = logistic with plateau at ~3-5 rounds for most tasks
```

The key insight: **performance scales primarily with agent diversity and topic difficulty, not with raw count or computation**. This is a conditional scaling law — it says debate is most valuable when (a) task difficulty is high enough that single-agent self-consistency fails, and (b) agent diversity is sufficient to generate genuine opposing perspectives.

**With open-source models, diversity(A) gains a new dimension.** Previously, diversity was limited to prompt-level persona differentiation (same model, different system prompts). Now it includes:
- **Weight-level diversity**: different LoRA adapters per persona (same base model, different fine-tuning)
- **Model-level diversity**: different base models per persona (Llama vs Qwen vs Mistral)
- **Reasoning-level diversity**: different Coconut-style latent reasoning depth per persona
- **Hidden-state diversity**: measurable via cosine distance between agent activations at matched layers

The Multi-Model Collaboration paper (arXiv:2512.23340) already shows model diversity is a fundamental scaling dimension. Faultline could extend this finding from task-solving to epistemic debate.

### 2.3 Why "Belief Complexity" Is a More Interesting Axis Than Agent Count

Current scaling research focuses on agent count, model size, or total parameters. A structurally different axis is **belief graph complexity** per agent:
- Low complexity: 5-10 belief nodes per persona
- Medium complexity: 20-60 nodes per persona (Faultline's target)
- High complexity: 100+ nodes, with cross-belief dependencies

The hypothesis (currently unvalidated by any paper): debate quality in structured epistemic settings scales with belief graph complexity up to the point where the shared vocabulary of concepts between agents becomes too thin to enable productive exchange. This would be a genuine Faultline-specific scaling contribution.

**With open-source models, a stronger version is testable:** belief graph complexity interacts with LoRA conditioning. An agent with a 50-node belief graph and a LoRA adapter trained on the corresponding corpus should produce more structurally differentiated reasoning than the same agent with just prompt injection of the same 50 nodes. If this holds, the "scaling variable" is not just graph size but *integration depth* — how deeply the belief structure is embedded in the model's weights.

---

## Part 3: What "Arguing in Belief Latent Space" Means for Faultline

With open-source models, "belief latent space" has two concrete implementations, ordered by complexity:

### 3.1 Structured Belief Vectors (Build First — Any Model)

**Agents maintain continuous-valued belief vectors** — for each contested proposition P, each agent has a confidence score c(P) ∈ [0,1]. The "belief space" is R^n where n = number of contested propositions. Each agent is a point in this space. Debate is a trajectory through this space.

The machinery:
1. Before debate, extract proposition set P from topic decomposition.
2. Per persona, estimate initial c(P_i) from their contract (stakes, bias, epistemology fields) — either via LLM extraction or simple heuristics.
3. After each crux room, update c(P_i) for the participating personas based on crux card outcome.
4. Track trajectories: did personas converge (Δc → same), diverge (Δc → opposite), or stalemate?
5. The "crux" is the proposition P* = argmax |c_A(P) - c_B(P)| — the maximum divergence point.

**With open-source models, confidence extraction improves.** Instead of asking the LLM to self-report confidence (unreliable), train a lightweight probe on hidden-state activations to extract confidence signals. Linear probes on transformer hidden states are well-validated for extracting model beliefs (Li et al., "Inference-Time Intervention", 2023; Burns et al., "Discovering Latent Knowledge", 2022).

**What this adds to Faultline's existing system:**
- Currently: crux cards record qualitative crux points (human-readable text)
- With belief vectors: crux cards record *which proposition in the belief space* drove the crux + quantitative confidence shift after exchange
- Debate summaries can show: persona started at [0.2] on "decentralized systems are more secure", ended at [0.35] after engaging with counter-evidence
- The "disagreement map" becomes a literal map in proposition space

### 3.2 True Latent-Space Debate via LatentMAS (Build Second — Requires GPU Infra)

The second implementation layer uses LatentMAS-style KV cache sharing for inter-agent communication. This is the research novelty.

**Architecture:**
```
Agent A processes: [system prompt + belief graph + debate context]
  → Generates KV cache at all layers
  → Selects salient KV pairs (attention-score weighted)
  → Shares selected KV pairs with Agent B

Agent B processes: [own system prompt + belief graph + debate context + Agent A's KV pairs]
  → B's response is conditioned on A's reasoning process, not just A's text output
  → B generates response text + own KV cache
  → Shares back to A for next round
```

**The experimental question:** Does this latent-space communication channel produce different debate dynamics than text-only communication? Specifically:
- Does deltaSD differ? (Are personas more or less likely to over-converge?)
- Does CCR differ? (Are cruxes resolved more or less effectively?)
- Do hidden-state divergence patterns differ? (Is the "reasoning process" genuinely different?)

**This is a novel experiment.** LatentMAS has been tested on tasks with correct answers. Testing it on opinion debate where "correct" is undefined is new territory.

### 3.3 The Anti-Conformity Check (Critical for Both Implementations)

The biggest failure mode in multi-agent debate is sycophantic convergence — agents drifting toward agreement without genuine belief change. The DEBATE benchmark (Chuang et al.) empirically demonstrates LLMs over-converge vs humans.

The belief vector layer provides the detection mechanism: if confidence values converge rapidly (within 2 rounds) and the arguments don't justify the shift, flag this as sycophantic convergence. This requires comparing the *magnitude of argumentative content* against the *magnitude of belief shift*.

**With hidden-state access, a stronger check:** compare the magnitude of hidden-state change vs. the magnitude of belief vector change. If the model's internal state barely shifted but its stated belief changed dramatically, that's sycophancy — the model is producing output that doesn't reflect its internal processing.

---

## Part 4: Implementation Design

### Layer 1: Proposition Belief Vectors (Any Model)

```typescript
type BeliefVector = {
  personaId: string;
  propositions: Map<string, {
    confidence: number;    // 0-1
    certainty: number;     // how confident the agent is in their confidence estimate
    source: 'contract' | 'corpus' | 'debate_update' | 'hidden_state_probe';
  }>;
  lastUpdated: number;  // debate round
};
```

Propositions are extracted from the topic decomposer output (existing lib/dialogue/topic-decomposer.ts). Initial values estimated from persona contracts. With open-source models, initial values can also be extracted via hidden-state probes for better calibration.

### Layer 2: Belief Update Protocol

After each crux room resolves:
1. Extract the crux proposition from the crux card (already happening).
2. For both participants, extract updated confidence:
   - **Text-based (baseline):** Ask: "Given this exchange, what is your updated confidence in [proposition]?" — one LLM call per persona, structured output.
   - **Hidden-state-based (with open-source model):** Run the crux room exchange through the model, extract hidden states at final token position, apply trained probe to extract confidence. Better calibrated, no self-report bias.
3. Persist update to BeliefVector.
4. Flag: if |c_A(P) - c_B(P)| < threshold → near-convergence → spawn closing synthesis.

### Layer 3: Disagreement Map Output

Post-debate, the dialogue summary gains a structured section:
```
Belief trajectory for "Proof-of-work is environmentally justified":
  Persona A: 0.8 → 0.7 (conceded one evidentiary point)
  Persona B: 0.2 → 0.2 (unmoved)
  Net movement: small; crux unresolved
```

With hidden-state access, augment with:
```
Hidden-state divergence at layer 24: 0.73 → 0.68 (slight convergence in reasoning, not just conclusion)
Attention divergence on "energy consumption" tokens: high (agents attend to different aspects)
```

### Layer 4: LatentMAS Integration (Phase B)

```python
# Pseudocode for latent debate round
agent_a_output = model.forward(agent_a_input, return_kv=True)
agent_a_kv = select_salient_kv(agent_a_output.kv_cache, top_k=128)

agent_b_input_augmented = inject_kv(agent_b_input, agent_a_kv)
agent_b_output = model.forward(agent_b_input_augmented, return_kv=True)
agent_b_kv = select_salient_kv(agent_b_output.kv_cache, top_k=128)

# Compare: did latent communication change the debate dynamics?
text_only_b_output = model.forward(agent_b_input_with_text_only)
latent_divergence = cosine_distance(agent_b_output.hidden, text_only_b_output.hidden)
```

---

## Part 5: The "New Scaling Law" Claim — Updated Assessment

**What exists:** No clean universal scaling law exists for multi-agent debate. The closest is the power-law relationship between total model parameter count and ensemble performance (arXiv:2512.23340), but this applies to ensemble inference, not debate dynamics.

**What could be validated with Faultline (updated for open-source models):**

The first empirical measurement of how **epistemic divergence at debate start** predicts **crux resolution quality** at debate end, across BOTH text-space and latent-space communication channels. This would take the form:

```
crux_resolution_quality ~ α × initial_divergence(A, B) + β × belief_complexity(A, B) + γ × topic_difficulty + δ × communication_channel
```

where:
- initial_divergence = |c_A(P) - c_B(P)| summed over the proposition set
- belief_complexity = number of active belief graph nodes per persona
- topic_difficulty = empirical classification (factual/evidential/values-based)
- communication_channel = {text_only, latent_kv_sharing, mixed}
- crux_resolution_quality = was the crux falsifiable? did either persona update? was the update grounded in the exchange?

**Is this publishable as a "scaling law"?** With open-source models, the paper becomes stronger. You're not just measuring text-level dynamics (which could be dismissed as "just prompt engineering") — you're measuring hidden-state dynamics, comparing communication channels, and testing whether structural diversity (LoRA + belief graphs) breaks through the prompt-only ceiling. This is a *descriptive* law (empirical curve fitting), but with hidden-state evidence it's more compelling than text-only measurements.

**Updated framing:** "Epistemic divergence as a scaling dimension for multi-agent debate, with evidence from both text-space and latent-space communication." This positions Faultline's contribution as extending the Multi-Model Collaboration scaling law (arXiv:2512.23340) from task-solving to epistemic debate, with the additional dimension of communication channel.

---

## Verdict: Feasibility Matrix (Updated)

| Approach | Feasible? | Implementation Effort | Value to Faultline | Build Priority |
|----------|-----------|----------------------|-------------------|----------------|
| Structured belief vectors (proposition confidence scores) | Yes — any model | Low-Medium | High — measurement layer for scaling law | **Phase A: build first** |
| Hidden-state belief probes (calibrated confidence from activations) | Yes — open-source | Medium | High — solves calibration problem | Phase B |
| Per-persona LoRA adapters (CharLoRA-style) | Yes — open-source | Medium-High | High — genuine reasoning differentiation | Phase B |
| LatentMAS (KV cache sharing between agents) | Yes — open-source | High | Very High — research novelty, the paper's headline | Phase B |
| Coconut (continuous thought per agent) | Yes — open-source | High | Medium — per-agent improvement, not inter-agent | Phase C |
| ECON (BNE + BeliefNetwork) | Yes — open-source | Medium-High | Medium — BNE may converge to sycophancy in opinion debate | Phase C, test carefully |
| CoBel-World style symbolic belief state | Yes — any model | Medium | Medium-High — schema needs adaptation | Optional |
| Belief Graphs with Reasoning Zones | Yes — any model | Medium | High — formal grounding for crux identification | Phase A, alongside belief vectors |

**Recommended path:**
1. **Phase A (any model):** Belief vectors + belief graph injection + Tier 1 benchmarks. Establishes baseline measurements. No GPU infra required.
2. **Phase B (open-source model):** Deploy model via vLLM. Add LoRA adapters per persona. Implement LatentMAS KV cache sharing. Add hidden-state probes for calibrated confidence. Run text vs. latent comparison experiments.
3. **Phase C (if Phase B shows promise):** Coconut continuous thought. ECON BNE coordination (with diversity-preserving reward modification). Full scaling curve across belief complexity × communication channel × model diversity.

---

## Key Papers

| Paper | Key Claim | Feasible? | Link |
|-------|-----------|-----------|------|
| Coconut (arXiv:2412.06769) | Continuous latent thought tokens outperform CoT on planning | Yes — open-source models | [arxiv](https://arxiv.org/abs/2412.06769) |
| LatentMAS (arXiv:2511.20639) | Multi-agent latent space collaboration via KV cache; 14.6% accuracy gain | Yes — open-source models | [arxiv](https://arxiv.org/abs/2511.20639) |
| ECON (arXiv:2506.08292, ICML 2025) | BNE-convergent multi-agent coordination; 11.2% improvement, 21.4% fewer tokens | Yes — fully implementable | [arxiv](https://arxiv.org/abs/2506.08292) |
| CoBel-World (arXiv:2509.21981) | Symbolic belief world + Bayesian collaboration; 64-79% comms cost reduction | Yes — any model | [arxiv](https://arxiv.org/abs/2509.21981) |
| Belief Graphs w/ Reasoning Zones (arXiv:2510.10042) | Directed signed weighted belief graph with contradiction-tolerant zones | Yes — any model | [arxiv](https://arxiv.org/abs/2510.10042) |
| Graph-Theoretic Model of Belief (arXiv:2508.03465) | Separates credibility from confidence in belief nodes | Yes — any model | [arxiv](https://arxiv.org/abs/2508.03465) |
| MacNet (arXiv:2406.07155, ICLR 2025) | Logistic scaling law with 1000+ agents; irregular topologies win | Yes — any model | [arxiv](https://arxiv.org/abs/2406.07155) |
| Law of Multi-Model Collaboration (arXiv:2512.23340) | Power-law scaling; diversity is primary driver | Yes — any model | [arxiv](https://arxiv.org/abs/2512.23340) |
| MAD as Test-Time Scaling (arXiv:2505.22960) | Debate scales conditionally — harder tasks + weaker models benefit most | Yes — any model | [arxiv](https://arxiv.org/abs/2505.22960) |
| DEBATE benchmark (arXiv:2510.25110) | LLMs over-converge vs humans; anti-conformity is essential | Yes — any model | [arxiv](https://arxiv.org/abs/2510.25110) |
| Cooperative MARL Belief States (arXiv:2504.08417) | Learned belief states via conditional VAE for partial observability | Yes — open-source models | [arxiv](https://arxiv.org/abs/2504.08417) |
| Prompt Baking (arXiv:2409.13697) | LoRA-based gradient optimization bakes persona into weights | Yes — open-source models | [arxiv](https://arxiv.org/abs/2409.13697) |
| CharLoRA (arXiv:2502.12988, ACL Findings 2025) | Multi-expert LoRA separating style from reasoning | Yes — open-source models | [arxiv](https://arxiv.org/abs/2502.12988) |
| Inference-Time Intervention (Li et al., 2023) | Linear probes on hidden states extract model beliefs | Yes — open-source models | Reference |
| Discovering Latent Knowledge (Burns et al., 2022) | Unsupervised extraction of model beliefs from activations | Yes — open-source models | Reference |
