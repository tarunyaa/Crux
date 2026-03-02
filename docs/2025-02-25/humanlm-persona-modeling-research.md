# HumanLM: Applicability to Faultline Persona Modeling

> Analysis of the HumanLM framework (Stanford, Wu et al. 2026) and how its latent-state approach could improve Faultline's persona differentiation.

---

## What Is HumanLM?

**Paper:** "HUMANLM: Simulating Users with State Alignment Beats Response Imitation" (Stanford, 2026)
**Authors:** Shirley Wu, Evelyn Choi, Arpandeep Khatua, et al. (Stanford + NYU + Accenture)
**Website:** [humanlm.stanford.edu](https://humanlm.stanford.edu/)
**Code:** [github.com/zou-group/humanlm](https://github.com/zou-group/humanlm) (Apache 2.0)
**Model:** `snap-stanford/humanlm-opinions` on HuggingFace (finetuned Qwen3-8B)

### Core Insight: State Alignment > Response Imitation

Existing user simulators (including LoRA finetunes and few-shot prompting) imitate surface-level patterns — word choice, tone, length — but fail to capture the *underlying cognitive state* that produces those responses.

HumanLM decomposes simulation into two stages:

1. **Stage 1 (Latent State Generation):** The model generates explicit natural-language descriptions of the user's internal state along three dimensions:
   - **Stance** — what position they hold
   - **Emotion** — their affective state
   - **Communication style** — how they express themselves

2. **Stage 2 (Response Synthesis):** Given the aligned latent state + context, the model generates a reasoning trace and then the final response.

The key: the latent states are trained via GRPO (Group Relative Policy Optimization — same algorithm as DeepSeek-R1) to align with what would produce the ground-truth response.

---

## How Training Works

For a given user prompt (e.g., a Medium article), the model generates G=64 candidate latent states. Each is a natural-language description like:

> "This user holds a strong libertarian stance on crypto regulation. They feel frustrated by government overreach. They communicate in short, punchy declarative sentences with frequent rhetorical questions."

The reward for each candidate = how well the latent state predicts the user's actual response. GRPO advantage:

```
A_i = (r_i - mean(r)) / std(r)
```

The policy is pushed toward latent states that better predict real behavior, with KL penalty to prevent divergence from the reference model.

**Architecture:** GRPO post-training on **Qwen3-8B**. Single model trained across all users — persona identity injected via rich persona descriptions in the prompt (not per-user models).

---

## Training Data: Humanual Benchmark

| Dataset | Source | Users | Records | Date Range |
|---------|--------|-------|---------|------------|
| humanual-politics | Medium political comments | 5,300 | 47,905 | 2022-2025 |
| humanual-email | Enron email corpus | 399 | 7,043 | 1974-2001 |

Each record includes:
- The user's response (`completion`)
- The content they're responding to (`prompt`) — stimulus-response pairs
- Rich persona metadata: demographics, interests, values, communication patterns (2K-11K chars per persona)
- Conversation turn context

Persona descriptions are **LLM-generated profiles** derived from user's historical behavior — not hand-written.

---

## How This Maps to Faultline

### What HumanLM Does Well

1. **Explicit intermediate state** — Before generating, the model articulates *what it thinks the persona's internal state is*. This is inspectable, debuggable, and steerable.

2. **Captures stance, not just style** — The latent-state decomposition separates *what you believe* from *how you say it*. This is exactly Faultline's problem: personas need different beliefs, not just different voices.

3. **Single model, multiple personas** — One trained Qwen3-8B can simulate many users via prompt-injected persona descriptions. Analogous to Faultline's current PersonaContract approach, but with RL-aligned state inference.

### Where It Falls Short for Faultline

| Gap | Detail |
|-----|--------|
| **Latent dimensions are affective, not epistemic** | Stance/emotion/style is designed for social media simulation. Debate personas need: epistemic confidence, evidence weighting, argumentative strategy, concession threshold, risk framing — none of which HumanLM currently models. |
| **Data format mismatch** | HumanLM trains on stimulus-response pairs (article → comment). Faultline's personas have monologues (tweets, essays) without paired stimuli. Would need synthetic pair generation or a different reward function. |
| **Single-model blurring** | Training one model across all personas may blur distinctions between similar figures (e.g., two crypto bulls). Per-persona LoRA avoids this. |
| **Training docs not released** | GitHub marks training documentation as "coming soon." Reproduction requires reverse-engineering from code. |
| **Non-commercial dataset license** | Humanual datasets are CC-BY-NC-4.0. The training method (Apache 2.0) can be used commercially, but you'd need your own data. |

---

## Comparison: HumanLM vs Other Approaches

| Approach | Captures reasoning? | Data needed | Compute | Per-persona? | Persona drift risk |
|----------|:------------------:|:-----------:|:-------:|:------------:|:------------------:|
| **System prompt + few-shot** (current) | Partially | ~50 quotes, 1 contract | Zero | Via prompt | High after 8-12 turns |
| **LoRA finetuning** | Style: yes. Reasoning: partially | 1K-10K examples/persona | ~1-4 GPU-hrs/persona | Separate adapters | Medium |
| **Activation steering** | Behavioral axes only | Contrastive prompts | Minimal | Via vectors | Low |
| **HumanLM (GRPO)** | Stance: yes. Deep reasoning: not yet | 100+ stimulus-response pairs/user | 8-24 GPU-hrs total | Via prompt + RL | Low (states are explicit) |
| **DPO per persona** | Preferences: yes | Preference pairs | 2-8 GPU-hrs/persona | Separate | Medium |

---

## The Real Takeaway: Borrow the Concept, Not the Pipeline

HumanLM's most valuable contribution for Faultline isn't its training pipeline — it's the **latent-state decomposition** idea. You can implement this as a prompting strategy with zero training:

### Immediate Implementation (No Infrastructure Change)

Before each dialogue turn in `lib/dialogue/agent.ts`, add an intermediate "state inference" step:

```
Step 1: Given the conversation so far and your persona contract,
        produce your current internal state:
        - Epistemic position: [your current stance, confidence 0-100]
        - Evidence assessment: [what evidence would change your mind right now]
        - Emotional register: [frustration/confidence/curiosity/etc.]
        - Argumentative intent: [what you're trying to accomplish this turn]

Step 2: Now generate your response consistent with that state.
```

This gives you HumanLM's key benefit — explicit intermediate state that grounds generation — without any model training. It also makes persona behavior inspectable and debuggable.

### Why This Works

The [Geometry of Persona paper (arXiv:2512.07092)](https://arxiv.org/abs/2512.07092) shows that personality is **linearly separable** from reasoning ability in LLM activation space. You can change *who* the model sounds like without changing *how well* it reasons. This means Faultline can pursue persona fidelity and argument quality as independent concerns.

---

## Also Notable: HumanLLM (Separate Paper)

**Not the same paper.** [HumanLLM (arXiv:2601.15793)](https://arxiv.org/abs/2601.15793) — Lei et al., KDD 2026:
- Uses a "Cognitive Genome Dataset" of 5.5M user logs (Reddit/Twitter/Blogger/Amazon)
- Pure supervised finetuning (SFT), no RL
- Predicts user actions and inner thoughts
- Architecturally simpler — no latent-state decomposition
- Less interesting for Faultline because it learns surface patterns, exactly what HumanLM argues against

---

## Phased Adoption Plan

### Phase 1: Latent-State Prompting (Now)
- Add explicit state-inference step before each dialogue turn
- Extend PersonaContract with epistemic dimensions: `epistemicConfidence`, `evidenceWeighting`, `concessionThreshold`
- Zero training, zero infrastructure change
- Directly borrows HumanLM's core insight

### Phase 2: Persona Vectors + State Inference (2-4 weeks)
- Deploy open-source model (Qwen3-8B — same base as HumanLM)
- Extract activation-space directions for key behavioral axes
- Combine with latent-state prompting for structurally grounded persona turns

### Phase 3: Full HumanLM-Style Training (Long-term, if needed)
- Collect stimulus-response pairs per persona (tweets replying to articles, essay responses to events)
- Define Faultline-specific latent dimensions:
  - **Epistemic confidence** (0-100, how sure they are)
  - **Evidence type preference** (empirical / theoretical / analogical / historical)
  - **Argument strategy** (first-principles / data-driven / narrative / adversarial)
  - **Concession threshold** (what would shift their position)
  - **Risk framing** (time horizon, downside weighting)
- Train via GRPO on Qwen3-8B using the HumanLM codebase
- Estimated cost: 2× A100 GPUs, ~24 hours training

---

## Open-Source Artifacts

| Component | Available? | Link |
|-----------|:---------:|------|
| Code (training infra) | Yes | [github.com/zou-group/humanlm](https://github.com/zou-group/humanlm) |
| Base model (Qwen3-8B) | Yes | HuggingFace, Apache 2.0 |
| Trained model | Yes (gated) | `snap-stanford/humanlm-opinions` |
| Datasets (Humanual) | Yes | `snap-stanford/humanual-*` (CC-BY-NC-4.0) |
| Training recipe/hyperparams | **Not yet** | Marked "coming soon" |
| Serving | vLLM | Standard stack |

---

## Sources

- [HumanLM Project Page (Stanford)](https://humanlm.stanford.edu/)
- [HumanLM GitHub (zou-group/humanlm)](https://github.com/zou-group/humanlm)
- [Humanual Politics Dataset](https://huggingface.co/datasets/snap-stanford/humanual-politics)
- [Shirley Wu's announcement on X](https://x.com/ShirleyYXWu/status/2022374624676421676)
- [HumanLLM (arXiv:2601.15793)](https://arxiv.org/abs/2601.15793) — separate paper, KDD 2026
- [Persona Vectors (arXiv:2507.21509)](https://arxiv.org/abs/2507.21509)
- [Geometry of Persona (arXiv:2512.07092)](https://arxiv.org/abs/2512.07092)
- [Consistently Simulating Human Personas with Multi-Turn RL (arXiv:2511.00222)](https://arxiv.org/abs/2511.00222)
- [PersonaLLM NeurIPS 2025 Workshop](https://personallmworkshop.github.io/)
