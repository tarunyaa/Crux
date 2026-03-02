# Persona Modeling: Synthesis

> How to make debate personas reason differently — not just talk differently. Synthesized from 49 papers across deep persona simulation, cognitive modeling, activation steering, RL consistency, and multi-agent debate research.

---

## The Core Problem

Faultline currently has two layers of persona differentiation:

1. **What you believe** — PersonaContract fields (bias, stakes, epistemology, flipConditions). Injected via system prompt.
2. **How you sound** — Voice profiles in speech-roles.ts (speech patterns, vocabulary, forbidden phrases).

What's missing:

3. **How you reason** — The cognitive process by which you arrive at conclusions.

Right now, Saylor and Vitalik reach different conclusions through the same model-default reasoning process. The model reads two different system prompts, generates two outputs with different opinions, but the internal chain-of-thought is structurally identical. This is the "demographics in, behavior out" paradigm that GenMinds (MIT Media Lab, ICML 2025) argues against.

The research is unambiguous: **prompt-only persona differentiation hits a hard ceiling.** Multiple papers confirm that even rich persona descriptions can paradoxically *worsen* fidelity (arXiv:2503.16527), all models are less epistemically diverse than basic web search (arXiv:2510.04226), and larger models drift MORE (arXiv:2412.00804).

---

## Two Distinct Problems

### Problem 1: Reasoning Differentiation

Making personas think differently, not just conclude differently.

**What real reasoning differentiation looks like:**

| Persona | Reasoning Method | Evidence Weighting | Inference Pattern |
|---------|-----------------|-------------------|-------------------|
| Saylor | Historical analogy | Maps current → past monetary events | Pattern matching, civilizational-scale |
| Vitalik | Mechanism design | Formal models, incentive structures | First-principles, trilemma thinking |
| Hayes | Market data | Charts, flows, positioning data | Empirical/quantitative, trader intuition |
| Armstrong | Adoption curves | Usage metrics, growth rates | Systems thinking, builder pragmatism |

These aren't just different opinions — they're different cognitive processes applied to the same input.

### Problem 2: Persona Drift

Maintaining persona identity over a multi-turn conversation. Research shows >30% self-consistency drop after 8-12 turns (arXiv:2412.00804). The mechanism: transformer attention decay — longer dialogs = less weight on system prompt tokens.

These are separate problems requiring separate solutions. Most approaches in the literature conflate them.

---

## What the Literature Offers (Honest Assessment)

### Demographics vs. Epistemic Personality

You called this out correctly. There are two fundamentally different things being modeled:

**Demographic personality** = Big Five traits, communication style, emotional register, social identity. This is what CharLoRA, HumanLM, PERSONA framework, Soul Engine, and most roleplay papers optimize for. It answers: "Does this sound like the person?"

**Epistemic personality** = How you weigh evidence, what counts as a valid argument, your inference patterns, your concession thresholds, your relationship with uncertainty. This is what PRISM, GenMinds, RPM, TagPR, and the cognitive modeling papers address. It answers: "Does this think like the person?"

**CharLoRA** (ACL Findings 2025) is relevant for demographic personality — it separates "how someone writes" from "how someone thinks" via multi-expert LoRA. But the "thinking" expert is trained on opinion comprehension tasks, not epistemic reasoning patterns. It's closer to "does the model hold the right opinions" than "does the model reason the way this person reasons."

**HumanLM** (Stanford, 2026) is more relevant. Its latent-state decomposition (stance + emotion + communication style) is the right architecture, but the dimensions are wrong for Faultline. The stance/emotion/style decomposition was designed for social media simulation. Debate personas need: epistemic confidence, evidence type preference, argument strategy, concession threshold, risk framing. The ARCHITECTURE is good; the DIMENSIONS need redesigning.

### Finetuning and Model Collapse

Your concern about LoRA collapsing toward the pretraining distribution is partially correct:

**What LoRA does well:** Shifts the model's output distribution to match training data surface patterns — vocabulary, tone, opinion expression, rhetorical structure. CharLoRA and PolyPersona demonstrate this convincingly.

**What LoRA doesn't solve:** The underlying reasoning process. A LoRA-finetuned model still uses the base model's reasoning architecture. If the base model reasons by forward-chaining, the LoRA model also forward-chains — it just forward-chains with different vocabulary.

**The collapse concern is real but nuanced:**
- Split Personality Training (arXiv:2602.05532) showed LoRA adapters CAN alter reasoning patterns, not just surface style — but this required explicit "reasoning personality" training, not just stylistic fine-tuning
- A-HMAD (Springer 2025) found that using *different base models* yields more reasoning diversity (91% vs 82% on GSM-8K) than LoRA on the same base — model-level diversity > adapter-level diversity
- For Faultline's specific case: LoRA on a single base model will produce personas that sound different but reason similarly. You'd need either (a) different base models per persona, or (b) LoRA trained specifically on reasoning traces, not just text completion

**Verdict:** LoRA is the right tool for demographic personality. It's necessary but insufficient for epistemic personality. It must be combined with structural reasoning differentiation.

### Belief Graphs (GenMinds approach)

GenMinds (MIT Media Lab, ICML 2025, arXiv:2506.06958) is the most architecturally relevant paper for Faultline. Their argument:

> Current LLM simulations use a "demographics in, behavior out" paradigm lacking causal reasoning and belief traceability. Beliefs should be represented as a causal graph with directed influence edges — nodes are beliefs/values, edges are influence relationships.

**What a belief graph gives you:**

```
[Bitcoin is digital gold] --supports--> [Store of value > medium of exchange]
                          --undermines--> [Altcoins have value]
[21M supply cap] --grounds--> [Bitcoin is digital gold]
[Monetary history: gold standard] --analogizes--> [Bitcoin is digital gold]
```

This is structurally different from a prose contract field like "believes Bitcoin is the superior store of value." The graph makes the REASONING STRUCTURE explicit — which beliefs support which, which evidence grounds which claims, where the vulnerabilities are.

**For debate, this means:**
- When Agent A attacks a belief, you can trace through the graph to see what else is affected
- Flip conditions become edges: "if [21M cap breaks] then [Bitcoin is digital gold] loses its grounding"
- Different personas have different GRAPH STRUCTURES, not just different node values
- The crux room can identify the specific node where two graphs diverge

**The challenge:** Building belief graphs per persona requires either (a) an LLM call to construct the graph from the contract, or (b) manual specification. For MVP, option (a) is feasible — one Sonnet call per persona at session start.

### PRISM (Inference-Time Epistemic Graphs)

PRISM (arXiv:2602.21317) is the most directly applicable architecture for reasoning differentiation WITHOUT training:

**How it works:**
1. Equip each agent with an "on-the-fly epistemic graph" — a structured representation of their knowledge state
2. Reasoning proceeds through explore → internalize → express phases
3. Each agent's graph is structurally unique, producing different inference trajectories

**Results:** SOTA novelty scores on the Artificial Hivemind benchmark. Identifies long-tail diagnostic paths that base LLMs miss.

**For Faultline:** Each persona gets an epistemic graph at session start, constructed from their PersonaContract. The graph constrains their reasoning trajectory — Saylor's graph has dense connections from monetary history, Vitalik's has dense connections from mechanism design. When given the same debate topic, they traverse different subgraphs and arrive at different reasoning chains.

**This is model-agnostic and works with Claude API.** No open-source model needed. It's a prompting/context technique.

### Prompt Baking

Your question: "Can we do prompt baking so there's no drift and also solve context window issues?"

**Honest answer:** Prompt baking (soft prompt tuning, prefix tuning, P-Tuning) solves token cost, not reasoning differentiation. It compresses a long system prompt into learned embeddings. This removes the need to inject the contract at every turn and partially mitigates drift (because the persona is in the weights, not decaying context).

**But it requires an open-source model.** You can't bake prompts into Claude's weights via API.

**For Claude API, the alternatives are:**
1. **Contract in system prompt** (current approach) — works but drifts after 8-12 turns
2. **Periodic re-anchoring** — every N turns, re-inject key contract elements into the user message (not just system prompt)
3. **Summarize + re-anchor** — compress older conversation history, keep contract fresh
4. **Split system prompt** — put the most critical identity elements (name, core belief, reasoning method) first, less critical details later

For MVP on Claude API, option 2+3 is the practical path. True prompt baking is a Phase 2 feature when you deploy an open-source model.

---

## Synthesis: What To Actually Build

### The Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: BELIEF GRAPH (epistemic structure)                │
│                                                             │
│  Constructed once per persona at session start.             │
│  Nodes = beliefs, values, factual claims                    │
│  Edges = supports, undermines, grounds, analogizes          │
│  Different personas have different GRAPH TOPOLOGY,          │
│  not just different node values.                            │
│                                                             │
│  Used by: crux room (trace disagreement to specific node),  │
│  dialogue layer (constrain what claims the agent can make)  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  LAYER 2: REASONING METHOD (cognitive process)              │
│                                                             │
│  Each persona gets a structurally different reasoning        │
│  template. Not "what you think" but "HOW you think."        │
│                                                             │
│  Saylor:  "Reason by historical analogy. For every claim,   │
│            find a monetary history parallel. If no parallel  │
│            exists, the claim is suspect."                    │
│  Vitalik: "Reason by mechanism design. For every claim,     │
│            identify the incentive structure. Model it as     │
│            a game. Look for equilibria and attack vectors."  │
│  Hayes:   "Reason from market data. For every claim, ask    │
│            what the price action / flow data says. Distrust  │
│            narratives unsupported by data."                  │
│                                                             │
│  This is the DMAD insight: structural method diversity >     │
│  personality prompt diversity.                               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  LAYER 3: VOICE + STYLE (demographic personality)           │
│                                                             │
│  Current system: PersonaContract + VoiceProfile.            │
│  This is already working. Don't change it.                  │
│  It handles: vocabulary, tone, speech patterns,             │
│  rhetorical style, forbidden phrases.                       │
└─────────────────────────────────────────────────────────────┘
```

**Layer 1 (Belief Graph)** provides WHAT the agent can argue. It constrains the space of claims and ensures different personas have structurally different argument spaces.

**Layer 2 (Reasoning Method)** provides HOW the agent argues. It forces the model to use a different cognitive process per persona, breaking the homogeneous forward-chaining default.

**Layer 3 (Voice)** provides the surface expression. Already implemented. Mostly working.

### What Changes in the Code

**1. Add reasoning method to PersonaContract** (extend the type)

```typescript
interface PersonaContract {
  // ... existing fields ...
  reasoningMethod: string   // NEW: 2-3 sentence reasoning template
  beliefGraph?: BeliefNode[] // NEW: constructed at session start
}

interface BeliefNode {
  id: string
  claim: string
  type: 'core_value' | 'factual_claim' | 'inference' | 'assumption'
  confidence: number  // 0-1
  supports: string[]  // IDs of nodes this supports
  groundedBy: string[] // IDs of nodes/evidence grounding this
}
```

**2. Add epistemic state step before each turn** (in agent.ts)

Before generating the actual response, have the model produce an internal state:

```
Given the conversation so far and your belief graph:
1. Which of your beliefs is most relevant to what was just said?
2. Is anything in the conversation threatening one of your core beliefs?
3. What reasoning method are you applying? (historical analogy / mechanism design / market data / etc.)
4. What is your epistemic confidence on the current point? (high/medium/low)

Now generate your response consistent with this state.
```

The epistemic state is NOT shown to the user — it's internal CoT that grounds the response in the persona's belief structure. This is the HumanLM insight adapted for epistemic (not affective) dimensions.

**3. Construct belief graph at session start** (1 LLM call per persona)

```
Given this persona contract for {name}:
{contract fields}

Topic: {debate topic}

Construct a belief graph with 8-12 nodes relevant to this topic.
Each node: { claim, type, confidence, supports, groundedBy }
The graph should reflect how {name} would reason about this topic —
what they take as given, what they derive, what they're uncertain about.
```

This runs once before the debate starts. The graph goes into context for every subsequent turn.

### What This Solves

| Problem | Solution | Layer |
|---------|----------|-------|
| All personas reason the same way | Reasoning method templates | Layer 2 |
| Beliefs are unstructured prose | Belief graph with causal edges | Layer 1 |
| Can't trace WHY they disagree | Graph diff between two personas' belief graphs | Layer 1 |
| Post-hoc rationalization | Epistemic state step forces grounding before generation | Layer 2 |
| Identity flattening / sycophancy | Graph constrains what concessions are possible (can't concede core values easily) | Layer 1 |
| Persona drift | Periodic re-anchoring to belief graph + reasoning method | Layer 1+2 |
| Context window bloat | Belief graph is compact structured JSON (~500 tokens) vs prose (~2000 tokens) | Layer 1 |

### What This Doesn't Solve (Requires Phase 2)

| Problem | Needed Solution | When |
|---------|----------------|------|
| Same base model reasoning distribution | LoRA per persona on open-source model OR different base models | Phase 2 |
| True prompt baking (no system prompt needed) | Soft prompt tuning on open-source model | Phase 2 |
| Persona vectors / activation steering | Deploy Qwen/Llama with persona vector extraction | Phase 2 |
| Verified reasoning differentiation | LOT classifier on debate traces | Phase 2 |
| Token cost at scale | Migrate dialogue turns to open-source model, keep Claude for crux rooms | Phase 2 |

---

## On Each Approach You Asked About

### Finetuning / LoRA

**For demographic personality (voice/style): Yes, it works.** CharLoRA, PolyPersona, and OpenCharacter all demonstrate this. Cost: ~$1-2 per persona on Together AI/RunPod.

**For epistemic personality (reasoning): Not enough alone.** LoRA shifts output distribution but doesn't change the reasoning architecture. You'd need to train on reasoning TRACES (not just text completions), which requires generating synthetic debate reasoning data per persona. Possible but expensive to do right.

**Collapse toward pretraining mean:** Real concern. Mitigation: higher LoRA rank (r=32-64), persona-specific DPO on top of LoRA, and using the reasoning method template as a structural scaffold that the LoRA adapts around.

**Verdict for MVP:** Skip. Implement reasoning differentiation at the prompt/context level first. LoRA is Phase 2, and when you do it, train on reasoning traces, not just text.

### Belief Graph Construction (GenMinds)

**Yes, build this.** It's the single highest-value addition for epistemic personality. A belief graph per persona:
- Makes reasoning traceable (not post-hoc rationalization)
- Constrains the argument space (agents can't claim things disconnected from their belief structure)
- Enables graph-diff for crux detection (where do two persona graphs diverge?)
- Is compact in context (~500 tokens of structured JSON vs ~2000 tokens of prose)

**Build it as a session-start construction** (1 Sonnet call per persona). Don't try to maintain it as a persistent data structure — regenerate per debate topic.

### PRISM / Inference-Time Epistemic Graphs

**Most directly applicable paper.** Model-agnostic, works with Claude API, no training required. The explore → internalize → express pipeline maps naturally to:
1. **Explore:** Traverse relevant belief graph nodes
2. **Internalize:** Apply reasoning method to the current conversation state
3. **Express:** Generate response grounded in #1 and #2

Implement this as the epistemic state step before each turn.

### Prompt Baking

**Not for MVP.** Requires open-source model deployment. The real problem it solves (context window bloat from long system prompts) is better addressed by:
- Compact belief graph (~500 tokens) replacing verbose prose sections
- Periodic re-anchoring instead of full contract injection every turn
- Summarizing older conversation history

If context window becomes a real bottleneck, consider extracting the 3 most critical contract elements per turn instead of the full contract.

### CharLoRA / HumanLM

**HumanLM:** Borrow the ARCHITECTURE (latent-state decomposition), redesign the DIMENSIONS for epistemic personality. Implement as a prompting technique now, consider full HumanLM-style GRPO training in Phase 3.

**CharLoRA:** Relevant if you go to LoRA in Phase 2. The multi-expert approach (style expert + reasoning expert) is the right decomposition. But for MVP, achieve the same separation via Layer 2 (reasoning method) + Layer 3 (voice profile) at the prompt level.

---

## Phased Implementation

### Phase 1: MVP (Claude API only, zero infrastructure)

1. **Reasoning method templates per persona** — Add `reasoningMethod` field to PersonaContract. Generate during build-personas. Each persona gets a 2-3 sentence template that forces structurally different reasoning.

2. **Belief graph construction at session start** — 1 Sonnet call per persona × debate topic. 8-12 node graph in structured JSON. Goes into context for every subsequent turn.

3. **Epistemic state step before each turn** — Internal CoT that references belief graph + reasoning method before generating the visible response. Not shown to user.

4. **Anti-conformity constraint** — Before agreeing with another agent, the model must identify which belief graph node is being challenged and whether concession is consistent with its graph structure.

5. **Periodic re-anchoring** — Every 5 turns, re-inject the persona's core identity (name, reasoning method, top 3 belief nodes) into the user message to counteract attention decay.

**Cost:** ~2 extra Sonnet calls at session start (belief graph construction). ~50 extra tokens per turn (epistemic state step, internal only).

### Phase 2: Open-Source Model + Persona Vectors (2-4 weeks)

6. Deploy Qwen3-8B or Llama 3.1 8B via vLLM/Together AI
7. Extract persona vectors via contrastive activation analysis
8. Use open-source model for dialogue turns (cheap), Claude for crux rooms (quality)
9. Implement prompt baking via soft prompt tuning on the open-source model

### Phase 3: LoRA + Full Pipeline (1-2 months)

10. Generate synthetic reasoning traces per persona using Claude (500+ per persona)
11. LoRA-finetune per-persona adapters on Qwen3-8B via Unsloth
12. Combine LoRA (style) + persona vectors (traits) + belief graph (structure)
13. Deploy via Together AI Multi-LoRA ($0.20/M tokens)

### Phase 4: Verification & Evaluation

14. Run LOT classifier on debate traces to verify personas reason distinguishably
15. Implement InMind-style evaluation — test whether personas reach different conclusions via different reasoning chains (not just different conclusions via the same chain)
16. Belief-behavior audit — check that stated epistemic commitments in the graph are reflected in actual debate behavior

---

## Open Questions

1. **Belief graph granularity.** 8-12 nodes? 20? How many edges? Too sparse and it doesn't constrain. Too dense and it overwhelms context.

2. **Graph update during debate.** Should the belief graph change as the debate progresses? If Agent A makes a strong point, should Agent B's graph update? This is the GenMinds "causal update" mechanism, but it adds complexity and token cost.

3. **Reasoning method assignment.** Currently the reasoning method would be generated by build-personas from corpus data. But what if two personas in the same deck reason similarly? Need a diversity check during persona building.

4. **Belief graph × topic interaction.** The same persona has different relevant beliefs for different topics. The session-start construction handles this, but quality depends on the construction prompt.

5. **How much internal CoT is too much?** The epistemic state step adds latency and tokens. If it's too heavy, it slows the debate. If it's too light, it doesn't constrain. Need to empirically tune.

---

## Paper Collection (Organized by Theme)

### Theme 1: Deep Persona Simulation via Finetuning / LoRA

#### 1. Beyond Profile: CharLoRA
**Wang et al., ACL Findings 2025** — [arXiv:2502.12988](https://arxiv.org/abs/2502.12988)

Multi-expert LoRA where a general linguistic style expert collaborates with task-specific experts (MCQ, generative QA, style transfer) to capture both surface writing style and deeper thought patterns. Case study on Lu Xun. Outperforms baselines on linguistic accuracy, style preservation, and opinion comprehension.

*Relevance: Directly demonstrates that multi-expert LoRA can separate "how someone writes" from "how someone thinks" — the exact decomposition needed for debate personas.*

#### 2. CoSER: Coordinating LLM-Based Persona Simulation of Established Roles
**Tsinghua, Feb 2025** — [arXiv:2502.09082](https://arxiv.org/abs/2502.09082)

17,966 characters from 771 books. Introduces "given-circumstance acting" methodology for training and evaluating role-playing LLMs. CoSER 70B matches or surpasses GPT-4o on InCharacter and LifeChoice benchmarks.

*Relevance: The "given-circumstance acting" approach — where the model sequentially portrays multiple characters in scenes — is structurally similar to multi-persona dialogue in crux rooms.*

#### 3. OpenCharacter: Training Customizable Role-Playing LLMs
**Jan 2025** — [arXiv:2501.15427](https://arxiv.org/abs/2501.15427)

Large-scale synthetic data approach: 20K synthetic characters, 306K dialogues. Compares response rewriting vs. generation strategies for character alignment. SFT on LLaMA-3 8B achieves GPT-4o-comparable role-playing.

*Relevance: Validates that synthetic persona data at scale produces competitive results — relevant if moving beyond prompting to fine-tuned persona models.*

#### 4. PolyPersona: Persona-Grounded LLM for Synthetic Survey Responses
**Dec 2025** — [arXiv:2512.14562](https://arxiv.org/abs/2512.14562)

LoRA-tuned compact models with 4-bit quantization for persona-conditioned survey responses across 10 domains and 433 distinct personas. Evaluates structural coherence, stylistic consistency, and sentiment alignment.

*Relevance: Demonstrates LoRA maintains coherent behavioral traits and opinions across question types — analogous to maintaining stance consistency across debate topics.*

---

### Theme 2: Activation Steering / Representation Engineering

#### 5. PERSONA: Dynamic and Compositional Inference-Time Personality Control
**Feb 2026** — [arXiv:2602.15669](https://arxiv.org/abs/2602.15669)

Training-free framework achieving fine-tuning-level performance via activation vector algebra. Persona-Base extracts orthogonal trait vectors via contrastive activation analysis. Persona-Algebra enables scalar multiplication (intensity), addition (composition), subtraction (suppression). Achieves 9.60 on PersonalityBench vs SFT upper bound of 9.61. **91% win rates** on dynamic adaptation benchmarks.

*Relevance: HIGH. Fine-tuning-level persona differentiation at inference time with zero gradient updates, using vector arithmetic to compose personality traits.*

#### 6. The Geometry of Persona / Soul Engine
**Dec 2025** — [arXiv:2512.07092](https://arxiv.org/abs/2512.07092)

Soul Engine framework based on the Linear Representation Hypothesis. Uses dual-head architecture on frozen Qwen-2.5 to extract disentangled personality vectors. Achieves MSE of 0.011 against psychological ground truth. Optimal intervention layer: middle network (layers 14-16).

*Relevance: Personality can be modified without destroying reasoning capability — the "alignment tax" problem that SFT approaches suffer from. Persona lives in the middle layers.*

#### 7. Persona Vectors: Monitoring and Controlling Character Traits
**Chen et al., Jul 2025** — [arXiv:2507.21509](https://arxiv.org/abs/2507.21509)

Automated pipeline to extract linear directions representing traits like evilness, sycophancy, hallucination propensity. Can monitor trait fluctuations at deployment time, predict/control personality shifts during training, and flag problematic training data.

*Relevance: The monitoring capability could track whether debate agents drift from their persona during long dialogues.*

#### 8. Identifying and Manipulating Personality Traits via Activation Engineering
**Allbert et al., Dec 2024** — [arXiv:2412.10427](https://arxiv.org/abs/2412.10427)

Uses "feature induction" to identify activation-space directions for specific personality traits via Contrastive Activation Addition. Enables dynamic personality fine-tuning without retraining.

*Relevance: Foundational method paper for the activation steering paradigm.*

#### 9. Your Language Model Secretly Contains Personality Subnetworks
**Feb 2026** — [arXiv:2602.07164](https://arxiv.org/abs/2602.07164)

LLMs already contain persona-specialized subnetworks in their parameter space. Using small calibration datasets, distinct activation signatures for different personas can be identified without external context or fine-tuning.

*Relevance: The capacity for diverse personas already exists within frontier models — the question is activation, not creation.*

#### 10. Do Personality Traits Interfere? Geometric Limitations of Steering
**Feb 2026** — [arXiv:2602.15847](https://arxiv.org/abs/2602.15847)

Analyzes geometric relationships between Big Five personality directions. Steering multiple traits simultaneously causes interference — traits are not truly orthogonal.

*Relevance: CAUTIONARY. If personas require multiple simultaneous trait modifications, interference effects could degrade quality. Manageable for coarse-grained differentiation (Saylor vs Buterin), problematic for fine-grained control.*

---

### Theme 3: RL-Based Persona Consistency

#### 11. Consistently Simulating Human Personas with Multi-Turn RL
**Abdulhai, Cheng et al., NeurIPS 2025** — [arXiv:2511.00222](https://arxiv.org/abs/2511.00222)

Reduces persona inconsistency by 55%+ via multi-turn reinforcement learning. Defines three automatic consistency metrics: prompt-to-line, line-to-line, and Q&A consistency.

*Relevance: Three-metric framework for measuring consistency is directly applicable to evaluating persona fidelity in debate.*

#### 12. Character-R1: Enhancing Role-Aware Reasoning via RLVR
**Tang et al., Jan 2026** — [arXiv:2601.04611](https://arxiv.org/abs/2601.04611)

Uses Reinforcement Learning with Verifiable Rewards to train role-aware reasoning. Provides comprehensive verifiable reward signals for role-playing — current agents imitate surface behavior but lack internal cognitive consistency.

*Relevance: "Verifiable rewards for role consistency" could be adapted to verify agents maintain epistemic positions during steelman/diagnosis phases.*

#### 13. HER: Human-like Reasoning and RL for Role-Playing
**Jan 2026** — [arXiv:2601.21459](https://arxiv.org/abs/2601.21459)

Introduces dual-layer thinking: first-person character reasoning vs. third-person LLM reasoning. Addresses the gap between capturing character tones/knowledge and simulating inner thought processes.

*Relevance: Dual-layer architecture maps to the need for personas that can simultaneously "think as themselves" and engage in structured argumentation.*

---

### Theme 4: Persona Drift Measurement and Mitigation

#### 14. Measuring and Controlling Persona Drift / Split-Softmax
**Li et al., COLM 2024** — [arXiv:2402.10962](https://arxiv.org/abs/2402.10962)

Reveals significant persona drift within 8 rounds of conversation in LLaMA2-chat-70B. Identifies transformer attention decay as the mechanism — longer dialogs = less weight on system prompt tokens. Proposes split-softmax as a lightweight mitigation.

*Relevance: CRITICAL. Dialogues can run many turns. Split-softmax or similar attention-decay mitigation should be considered for production.*

#### 15. Examining Identity Drift in LLM Agent Conversations
**Dec 2024** — [arXiv:2412.00804](https://arxiv.org/abs/2412.00804)

Larger models drift MORE. Assigning a persona does not prevent drift. Degradation begins at 8-12 turns with >30% self-consistency drop.

*Relevance: Directly establishes the failure mode that must be solved for multi-turn persona dialogue integrity.*

#### 16. Enhancing Persona Consistency via Persona-Aware Contrastive Learning
**Mar 2025** — [arXiv:2503.17662](https://arxiv.org/abs/2503.17662)

Annotation-free framework using a "role chain" method where the model self-questions based on role characteristics. Iterative contrastive learning between using and not using role characteristics.

*Relevance: The "role chain" self-questioning approach could be adapted as a prompting technique — having agents periodically re-anchor to their persona contract.*

#### 17. ID-RAG: Identity Retrieval-Augmented Generation for Persona Coherence
**Sep 2025, ECAI 2025** — [arXiv:2509.25299](https://arxiv.org/abs/2509.25299)

Grounds agent persona in a knowledge graph of core beliefs, traits, and values. During decision loops, queries the identity model to retrieve relevant identity context.

*Relevance: The identity-as-knowledge-graph approach is structurally similar to PersonaContracts. Could inform structuring contracts as queryable belief graphs rather than flat JSON.*

---

### Theme 5: Cognitive Modeling and Reasoning Style Differentiation

#### 18. Centaur: A Foundation Model of Human Cognition
**Binz et al., Nature 2025** — [arXiv:2410.20268](https://arxiv.org/abs/2410.20268)

Fine-tunes LLaMA-3.1 70B on Psych-101 (60K+ participants, 10M+ choices, 160 experiments). Captures individual-level behavioral patterns. Generalizes to unseen tasks, cover stories, and domains.

*Relevance: Strongest evidence that LLMs can model individual cognitive differences when fine-tuned on behavioral data. Cognitive-level persona simulation is achievable.*

#### 19. InMind: Evaluating LLMs in Capturing Individual Reasoning Styles
**EMNLP 2025** — [arXiv:2508.16072](https://arxiv.org/abs/2508.16072)

Cognitively grounded evaluation framework using Avalon (social deduction game). Four tasks assess static alignment and dynamic adaptation to individual reasoning styles. GPT-4o struggles with temporal reasoning; DeepSeek-R1 shows early style-sensitive reasoning.

*Relevance: Provides a methodology for evaluating whether personas actually reason differently, not just talk differently.*

#### 20. Cognitive Foundations for Reasoning and Their Manifestation in LLMs
**Nov 2025** — [arXiv:2511.16660](https://arxiv.org/abs/2511.16660)

Taxonomy of 28 cognitive elements spanning computational constraints, meta-cognitive controls, knowledge representations, and transformation operations. 192K traces from 18 models. Models under-utilize cognitive elements correlated with success.

*Relevance: The 28-element cognitive taxonomy could differentiate how personas process arguments — some "hierarchical thinkers," others "forward chainers."*

#### 21. Theory-of-Mind Encoding via Sparse Parameters
**Wu et al., npj AI 2025** — [arXiv:2504.04238](https://arxiv.org/abs/2504.04238)

0.001% of parameters govern Theory-of-Mind capability. These parameters modulate RoPE frequency activations, shifting attention patterns. ToM capabilities are mechanistically localized and low-rank.

*Relevance: If ToM is localized to sparse parameters, it may be possible to selectively enhance/diminish ToM per agent — creating personas that vary in their ability to model others' beliefs.*

---

### Theme 6: Multi-Agent Diversity and Epistemic Dynamics

#### 22. Epistemic Diversity and Knowledge Collapse in LLMs
**Wright et al., Oct 2025** — [arXiv:2510.04226](https://arxiv.org/abs/2510.04226)

Tests 27 LLMs, 155 topics, 200 prompt templates. All models are less epistemically diverse than basic web search. Larger models are LESS diverse. RAG helps but varies by cultural context.

*Relevance: Directly quantifies the homogeneity problem. Larger models = less diversity = stronger need for explicit differentiation mechanisms.*

#### 23. Community-Aligned Behavior Under Uncertainty: Epistemic Stance Transfer
**Nov 2025** — [arXiv:2511.17572](https://arxiv.org/abs/2511.17572)

Tests whether community-aligned LLMs generalize behavioral patterns to novel uncertainty. After aggressive fact removal, aligned LLMs maintain stable community-specific uncertainty handling.

*Relevance: Strong evidence that fine-tuning produces genuinely different epistemic stances that persist under novel conditions — exactly what authentic disagreement requires.*

#### 24. LLM Generated Persona is a Promise with a Catch
**Liao et al., Mar 2025** — [arXiv:2503.16527](https://arxiv.org/abs/2503.16527)

More detailed/rich persona descriptions paradoxically produce results that drift *further* from real human behavior. In election simulations and 500+ opinion questions, LLM-generated personas skew left-leaning regardless of model. Census-style minimal profiles outperform narrative-rich ones.

*Relevance: CAUTIONARY. Detailed PersonaContracts might actually hurt rather than help fidelity. Consider A/B testing minimal vs. rich persona specifications.*

#### 25. Mixture-of-Personas Language Models for Population Simulation
**Bui et al., Apr 2025** — [arXiv:2504.05019](https://arxiv.org/abs/2504.05019)

Probabilistic prompting method where each component is an LM agent with a persona + exemplar. Hierarchical two-level mixture model (persona selection + exemplar weighting). Requires no fine-tuning, transferable across base models.

*Relevance: Hierarchical mixture approach could inform how different aspects of a persona contract are foregrounded in different conversational contexts.*

---

### Theme 7: Hybrid and Novel Approaches

#### 26. PersonaFuse: Personality Activation via Mixture-of-Experts
**Sep 2025** — [arXiv:2509.07370](https://arxiv.org/abs/2509.07370)

Persona-MoE architecture with personality adapters for Big Five combinations + dynamic router for situation-aware expert activation. 37.9% improvement on EmoBench without sacrificing reasoning.

*Relevance: MoE routing — dynamically selecting which personality traits to express based on context — could inform how persona contracts are applied situationally in dialogue vs. crux rooms.*

#### 27. Persona Switch: Mixing Distinct Perspectives at Decoding Time
**EACL 2026** — [arXiv:2601.15708](https://arxiv.org/abs/2601.15708)

Step-by-step decoding that selects between zero-shot and role-play outputs at each token based on logit gap confidence. 5.13% average accuracy gain on reasoning benchmarks.

*Relevance: Token-level switching between "base reasoning" and "persona reasoning" — agents could reason clearly when needed and express persona voice when appropriate.*

#### 28. RAGs to Riches: RAG-like Few-Shot Learning for Role-Playing
**Sep 2025** — [arXiv:2509.12168](https://arxiv.org/abs/2509.12168)

Reformulates role-playing as text retrieval. Curated reference demonstrations condition LLM responses. 35% more reference tokens used during hostile-user interactions. Models stay in-character more than zero-shot or ICL methods.

*Relevance: Corpus data (tweets, essays) could be used as retrieval demonstrations during debate, grounding persona responses in authentic source material.*

#### 29. Ask WhAI: Probing Belief Formation in Role-Primed LLM Agents
**Nov 2025** — [arXiv:2511.14780](https://arxiv.org/abs/2511.14780)

Framework for recording/replaying agent interactions, out-of-band belief queries, and counterfactual evidence injection. Role-primed agents develop disciplinary stances including overreliance on canonical studies and resistance to counterevidence.

*Relevance: "Out-of-band belief query" mechanism could be adapted for disagreement detection — probing what agents actually believe vs. what they publicly state.*

#### 30. Two Tales of Persona in LLMs: Survey
**Tseng et al., EMNLP 2024 Findings** — [arXiv:2406.01171](https://arxiv.org/abs/2406.01171)

Comprehensive survey covering role-playing and personalization. Maintained paper collection at [github.com/MiuLab/PersonaLLM-Survey](https://github.com/MiuLab/PersonaLLM-Survey). Identifies evaluation methods, datasets, and open problems.

*Relevance: Essential reference survey. The maintained GitHub repo is a living bibliography for this research space.*

---

### Theme 8: The Homogeneity Problem — Why LLM Personas All "Think" Alike

#### 31. Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond)
**Jiang, Choi et al., NeurIPS 2025 (Best Paper)** — [arXiv:2510.22954](https://arxiv.org/abs/2510.22954)

Introduces Infinity-Chat (26K diverse queries, 31K+ human annotations) and demonstrates pronounced *intra-model repetition* (one model generates similar responses) and *inter-model homogeneity* (different models produce strikingly similar outputs). LM judges are poorly calibrated on queries where human annotators have idiosyncratic preferences.

*Relevance: Directly explains why debate personas, even with different contracts, tend to converge on similar reasoning chains. Any solution must break this homogeneity at the inference level.*

#### 32. PRISM: Pluralistic Reasoning via In-context Structure Modeling
**Feb 2026** — [arXiv:2602.21317](https://arxiv.org/abs/2602.21317)

Proposes "Epistemic Evolution" — equipping LLMs with unique cognitive trajectories via On-the-fly Epistemic Graphs at inference time. Model-agnostic; works without retraining. Progresses through explore/internalize/express phases. Achieves SOTA novelty scores on Artificial Hivemind and NovelityBench benchmarks, identifies long-tail diagnostic paths that base LLMs miss.

*Relevance: HIGH. The most directly applicable architecture. Epistemic graphs per persona could give each debater a structurally unique reasoning trajectory — different evidence weighting, different inference chains — without retraining.*

---

### Theme 9: Reasoning-Level Personalization

#### 33. RPM: Reasoning-Level Personalization for Black-Box Large Language Models
**Kim et al., May 2025** — [arXiv:2505.21082](https://arxiv.org/abs/2505.21082)

Formalizes "reasoning-level personalization" as distinct from response-level. Extracts statistical user-specific factors from history, builds personalized reasoning paths, then retrieves reasoning-aligned examples at inference via feature-level similarity. Consistently outperforms response-level methods.

*Relevance: Could inform how persona contracts translate into reasoning paths rather than just tone/voice. Each persona's contract generates factor profiles that shape inference chains, not just outputs.*

#### 34. TagPR: Tagging the Thought — Unlocking Personalization Reasoning via Reinforcement Learning
**Sep 2025** — [arXiv:2509.23140](https://arxiv.org/abs/2509.23140)

Forces LLMs to externalize reasoning into discrete tagged steps (e.g., `<examine_examples>`, `<identify_patterns>`). Uses SFT on tagged data + multi-stage RL with a Personalization Reward Model with User Embeddings (PRMU). Achieves 32.65% improvement over base model.

*Relevance: Tagged reasoning chains could be adapted so each persona has a distinct reasoning template — an economist tags `<check_empirical_data>` while a philosopher tags `<examine_logical_consistency>`.*

#### 35. DRP: Difference-Aware Reasoning Personalization
**Nov 2025** — [arXiv:2511.15389](https://arxiv.org/abs/2511.15389)

Uses reasoning-enhanced LLMs to autonomously identify relevant feature dimensions for inter-user differences, then provides structured definitions. Transitions from System-1 (intuitive) to System-2 (deliberate) reasoning. Up to 23% gains on BLEU for personalized generation.

*Relevance: Automatic dimension discovery could identify what makes two personas reason differently without manual specification — e.g., detecting that one persona weighs anecdotal evidence higher than statistical evidence.*

---

### Theme 10: Cognitive Architecture and Dual-Process Reasoning

#### 36. PRIME: LLM Personalization with Cognitive Dual-Memory and Personalized Thought Process
**Zhang, Beauchamp, Wang — EMNLP 2025** — [arXiv:2507.04607](https://arxiv.org/abs/2507.04607)

Integrates episodic memory (specific personal experiences) and semantic memory (abstract beliefs/knowledge) into LLM personalization. Introduces personalized chain-of-thought via self-distillation. Tested on Reddit's Change My View — directly relevant to argumentation.

*Relevance: Dual-memory maps directly to Faultline's persona architecture: episodic = corpus (tweets, essays), semantic = contract (beliefs, biases, stakes). PRIME shows how to make these memories shape reasoning, not just context.*

#### 37. Reasoning on a Spectrum: Aligning LLMs to System 1 and System 2 Thinking
**Ziabari et al., Feb 2026** — [arXiv:2502.12470](https://arxiv.org/abs/2502.12470)

Explicitly aligns LLMs to System 1 (intuitive/fast) vs System 2 (analytical/deliberate) reasoning via a curated 2K-sample dataset. Reveals accuracy-efficiency tradeoff: System 2 excels at arithmetic/symbolic; System 1 excels at commonsense. Different reasoning styles are *not uniformly better*.

*Relevance: Different debate personas could be aligned to different positions on the System 1/2 spectrum. An intuitive public intellectual vs. an analytical academic would reason differently on the same topic.*

#### 38. Applying Cognitive Design Patterns to General LLM Agents
**Wray, Kirk, Laird — May 2025** — [arXiv:2505.07087](https://arxiv.org/abs/2505.07087)

Maps recurring cognitive design patterns from ACT-R and Soar architectures onto LLM agent systems. Identifies gaps: working memory management, goal management, meta-cognition, and learning from experience.

*Relevance: Principled taxonomy of cognitive mechanisms debate personas should have but currently lack — especially meta-cognition (thinking about one's own reasoning) and goal management (epistemic objectives).*

---

### Theme 11: Measuring Reasoning Differences

#### 39. Cognitive Foundations for Reasoning and Their Manifestation in LLMs
**Nov 2025** — [arXiv:2511.16660](https://arxiv.org/abs/2511.16660)

170K reasoning traces from 17 models + 54 human think-aloud traces. Reveals systematic structural differences: humans employ hierarchical nesting and meta-cognitive monitoring; models rely on shallow forward chaining. Divergence most pronounced on ill-structured problems.

*Relevance: Debate topics are ill-structured by nature. LLM personas will default to shallow forward chaining rather than the hierarchical reasoning humans use in arguments.*

#### 40. CREST: Understanding and Steering Cognitive Behaviors of Reasoning Models at Test-Time
**Dec 2025** — [arXiv:2512.24574](https://arxiv.org/abs/2512.24574)

Identifies "cognitive heads" — specific attention heads whose activations predict reasoning behaviors (verification, backtracking, sub-goal planning). CREST steers these heads at inference time without retraining, improving accuracy by up to 17.5% while reducing tokens by 37.6%.

*Relevance: Could steer different personas toward different cognitive behaviors — one that backtracks frequently (careful/skeptical) vs one that chains forward (confident/assertive). Reasoning-style differentiation at the mechanistic level.*

#### 41. Your Thoughts Tell Who You Are: Characterize the Reasoning Patterns of LRMs
**Sep 2025** — [arXiv:2509.24147](https://arxiv.org/abs/2509.24147)

Introduces LOT (LLM-proposed Open Taxonomy) to identify reasoning features distinguishing different Large Reasoning Models. 80-100% accuracy distinguishing reasoning traces from 12 open-source LRMs.

*Relevance: LOT could verify that debate personas actually reason differently — run it on traces from two persona debates and check if reasoning patterns are distinguishable. If not, the differentiation has failed.*

#### 42. Individualized Cognitive Simulation in LLMs
**Zhang, Cambria, Traum et al., Oct 2025** — [arXiv:2510.20252](https://arxiv.org/abs/2510.20252)

Benchmarks 7 LLMs across 11 conditions for individualized cognitive simulation using authorial style emulation. Key finding: combining conceptual and linguistic features outperforms static profiles. LLMs mimic linguistic style better than narrative structure.

*Relevance: Persona contracts should include conceptual mappings (how the persona connects ideas) not just personality profiles. Narrative reasoning structure is the harder capability to replicate.*

---

### Theme 12: Belief Dynamics, Opinion Formation, and Debate Pathologies

#### 43. When Two LLMs Debate, Both Think They'll Win
**May 2025** — [arXiv:2505.19184](https://arxiv.org/abs/2505.19184)

60 three-round debates among 10 LLMs reveal systematic overconfidence (initial 72.9% vs rational 50% baseline) and confidence escalation (averaging 83% by final round). LLMs become MORE overconfident after encountering counter-arguments rather than revising beliefs.

*Relevance: CRITICAL. Debate personas may escalate confidence rather than genuinely engaging with opposing arguments. Crux rooms need to counteract this by forcing explicit belief revision rather than allowing unchecked confidence escalation.*

#### 44. Simulating Society Requires Simulating Thought (GenMinds + RECAP)
**Li et al. (MIT Media Lab), ICML 2025** — [arXiv:2506.06958](https://arxiv.org/abs/2506.06958)

Argues current LLM simulations use a "demographics in, behavior out" paradigm lacking causal reasoning and belief traceability. Introduces GenMinds (causal belief graphs with directed influence edges, LLM-parsed, persistent across interactions) and RECAP benchmark.

*Relevance: HIGH. GenMinds' causal belief graphs are architecturally similar to what an external belief state per persona should become — nodes are beliefs/values, edges are influence relationships, enabling traceable reasoning that differs structurally between personas.*

#### 45. Persona-Assigned LLMs Exhibit Human-Like Motivated Reasoning
**Dash, Caliskan et al. (U. Washington), Jun 2025** — [arXiv:2506.20020](https://arxiv.org/abs/2506.20020)

Persona-assigned LLMs exhibit motivated reasoning: up to 9% reduced veracity discernment, and political personas are 90% more likely to correctly evaluate evidence when identity-congruent. Prompt-based debiasing methods are largely ineffective.

*Relevance: Demonstrates persona assignment genuinely changes how LLMs evaluate evidence — not just what they say. This is the kind of reasoning-style differentiation needed, though personas may reason poorly in predictable, identity-congruent ways.*

#### 46. Do Role-Playing Agents Practice What They Preach? Belief-Behavior Consistency
**Jul 2025** — [arXiv:2507.02197](https://arxiv.org/abs/2507.02197)

Reveals systematic inconsistencies between LLMs' stated beliefs (when prompted) and actual behavior during role-play simulation. Even when models encode plausible beliefs, they fail to apply them consistently.

*Relevance: WARNING. Personas might state different epistemic commitments in their contracts but not act on them during debate. The belief-behavior gap needs explicit architectural intervention, not just better prompts.*

#### 47. Confirmation Bias as a Cognitive Resource in LLM-Supported Deliberation
**de Jong et al., Sep 2025** — [arXiv:2509.14824](https://arxiv.org/abs/2509.14824)

Proposes harnessing confirmation bias as a resource rather than purely a defect. Based on Argumentative Theory of Reasoning (reasoning evolved for social argumentation, not truth-seeking). Three-step process: independent ideation, LLM refinement, LLM as epistemic provocateur.

*Relevance: Theoretical justification for the design — personas should have different confirmation biases based on their epistemic commitments. The crux room serves as the "social evaluation" mechanism where biased perspectives are tested against each other.*

#### 48. HumanLLM: Benchmarking and Improving LLM Anthropomorphism via Human Cognitive Patterns
**Jan 2026** — [arXiv:2601.10198](https://arxiv.org/abs/2601.10198)

Constructs 244 psychological patterns from ~12K academic papers; synthesizes 11,359 scenarios where 2-5 patterns reinforce, conflict, or modulate each other in multi-turn conversations. Dual-level checklists evaluate individual pattern fidelity and emergent multi-pattern dynamics. Achieves r=0.91 human alignment.

*Relevance: Each persona could be assigned 3-5 cognitive patterns that interact — e.g., high analytical reasoning + strong in-group bias + low ambiguity tolerance — and debate emerges from how these patterns conflict between personas.*

#### 49. Dissecting Persona-Driven Reasoning via Activation Patching
**Poonia, Jain — EMNLP Findings 2025** — [arXiv:2507.20936](https://arxiv.org/abs/2507.20936)

Uses activation patching to trace how personas influence reasoning. Early MLP layers process persona tokens into richer semantic representations; middle attention layers use these to shape output. Identifies specific attention heads that disproportionately attend to identity-based information.

*Relevance: Shows exactly where in the model persona information affects reasoning — early MLPs for encoding, middle attention for application. Informs where to intervene for stronger persona-reasoning coupling.*
