# Persona Weight Differentiation: Beyond Prompt-Only Personas

> Research into encoding persona priors, beliefs, and personality into model weights — moving beyond system-prompt-only differentiation for multi-agent debate.

---

## The Core Problem: Model Homogeneity

When a single model is scaled for multi-agent debate, positions argued are structurally the same reasoning rephrased. The model's underlying priors dominate regardless of system prompt.

**This is well-documented in research:**

- **ICLR 2025 MAD analysis** found that current Multi-Agent Debate frameworks fail to consistently outperform simpler single-agent strategies like CoT + Self-Consistency. Root cause: identical foundation models produce correlated reasoning even when prompted differently. ([source](https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/))

- **DMAD (ICLR 2025)** identifies the "fixed mental set" problem: models rely on homogeneous thought processes regardless of persona prompts. Their solution: force agents to use structurally different reasoning methods. ([paper](https://openreview.net/forum?id=t6QHYUOQL7))

- **A-HMAD (Springer, 2025)** shows deploying agents based on different foundation models yields substantially higher accuracy (91% vs 82% on GSM-8K) — model-level diversity matters more than prompt-level diversity. ([paper](https://link.springer.com/article/10.1007/s44443-025-00353-3))

- **DynaDebate (arXiv 2601.05746)** explicitly targets the homogeneity problem with dynamic path generation. ([paper](https://arxiv.org/html/2601.05746v1))

**Bottom line:** Prompt-only persona differentiation hits a hard ceiling. Structural differentiation — at the weight, activation, or architecture level — is necessary for genuinely different reasoning.

---

## Approach 1: LoRA Finetuning

**Verdict: Most mature and practical approach for production.**

### How It Works

LoRA (Low-Rank Adaptation) freezes pretrained weights and injects trainable rank-decomposition matrices into each transformer layer. Instead of updating the full weight matrix W (d×d), it learns two small matrices A (d×r) and B (r×d) where r << d (typically 4-64). Adds only ~0.2-0.9% trainable parameters.

### Data Requirements

- **Minimum viable:** 100 high-quality examples produce measurable behavioral shifts
- **Recommended:** 500-1000 examples for robust persona differentiation
- **Faultline's current corpus:** ~100 tweets + essays per persona — at the floor but workable
- **Synthetic augmentation:** Use Claude to generate 500+ persona-consistent debate turns from existing corpus to reach recommended threshold
- **Key tip (Sebastian Raschka):** With small datasets, use low learning rates (5e-6 to 5e-5), small batch sizes, aggressive early stopping, and weight decay

### Training Cost & Infrastructure

| Aspect | Detail |
|--------|--------|
| VRAM (7B model, QLoRA) | 5-8 GB (4-bit quantization) |
| GPU requirement | Consumer RTX 3090/4090 (24GB) is sufficient |
| Training time (Unsloth) | 5-15 minutes with 100 examples, <1 hour with 1000 |
| Cloud cost | ~$0.50-$2.00 per persona adapter (RunPod A100 at ~$1.50/hr) |
| Tools | [Unsloth](https://unsloth.ai/) (fastest), [Axolotl](https://docs.axolotl.ai/) (most flexible), HuggingFace PEFT + TRL |

### Relevant Research

- **CharacterBot / CharLoRA (ACL Findings 2025, arXiv:2502.12988)** — Multi-expert LoRA where a linguistic style expert collaborates with task-specific experts. Trained on a single author's essay collections, significantly outperforms baselines on linguistic accuracy and opinion comprehension. **Closest existing work to what Faultline needs.** ([paper](https://arxiv.org/abs/2502.12988))

- **Split Personality Training (arXiv:2602.05532)** — LoRA adapter encodes an entirely separate "honest persona" that accesses the same latent states but operates under different objectives. Proof that LoRA adapters genuinely alter reasoning patterns, not just surface style. ([paper](https://arxiv.org/abs/2602.05532))

### Multi-LoRA Serving (Critical)

Can you serve N different persona adapters simultaneously in real-time?

| Platform | Capacity | Pricing | Notes |
|----------|----------|---------|-------|
| [S-LoRA](https://arxiv.org/abs/2311.03285) | Thousands concurrent | GPU cost | Unified Paging, 30x throughput vs HF PEFT |
| [vLLM](https://docs.vllm.ai/en/stable/features/lora/) | LRU-cached adapters | GPU cost (~$1.50/hr A100) | Native support, ~50% throughput overhead |
| [Together AI](https://www.together.ai/blog/serverless-multi-lora-fine-tune-and-deploy-hundreds-of-adapters-for-model-customization-at-scale) | Hundreds, serverless | ~$0.20/M tokens | Upload LoRA, pay per token. No MLOps needed. |
| [Fireworks AI](https://fireworks.ai/blog/multi-lora) | Up to 100 per deployment | $0.20/M tokens (Llama 8B) | Dynamic loading, seconds to activate new adapters |

---

## Approach 2: Prompt Baking / Prompt Distillation

**Verdict: Not the right tool. Solves token cost, not reasoning differentiation.**

### Methods

- **Soft Prompt Tuning:** Learns ~100 continuous embedding tokens prepended to input. <0.01% parameters.
- **Prefix Tuning:** Learns continuous embeddings for key/value vectors in every attention layer.
- **P-Tuning v2:** Bidirectional LSTM generates prompt embeddings.
- **P-Distill:** Knowledge distillation specifically for prompt compression.

### Why Not for Faultline

Prompt tuning methods are designed to compress a long system prompt into weights to save input tokens. They **do not produce genuinely different reasoning** — they memorize the prompt's behavioral effects. Since Faultline's goal is structural reasoning differentiation (not just prompt compression), prompt baking doesn't solve the core problem.

If you need prompt compression later (to reduce the ~2000-token PersonaContract system prompts), this becomes relevant as an optimization on top of LoRA.

---

## Approach 3: Test-Time Training (TTT)

**Verdict: Theoretically elegant, impractical for production today. Revisit in 12-18 months.**

### How It Works

[TTT layers (arXiv:2407.04620)](https://arxiv.org/abs/2407.04620) replace attention's hidden state with a learnable model updated via gradient descent on the test sequence itself:

- **TTT-Linear:** Hidden state is a linear model trained via self-supervised loss on input tokens
- **TTT-MLP:** Hidden state is a 2-layer MLP, more expressive but slower
- **TTT-E2E:** End-to-end training compresses long context into model weights, achieving 2.7x speedup over full attention at 128K context

### Theoretical Appeal for Faultline

Feed a persona's corpus as "context" to a TTT layer → the model adapts its internal parameters to that persona at inference time. No offline training needed. The model literally **learns to be that persona** during inference.

### Why It's Impractical

1. No production-ready TTT models exist
2. No serving infrastructure (vLLM, TGI) supports TTT layers
3. Training at inference time adds latency — incompatible with real-time SSE streaming
4. No open-source TTT-based LLMs available for deployment
5. Data requirement is similar to LoRA but without offline pre-computation benefit

---

## Approach 4: Activation Steering / Persona Vectors (THE DARK HORSE)

**Verdict: Most promising near-term approach. Zero training required. Matches fine-tuning performance.**

### Anthropic's Persona Vectors (September 2025)

[arXiv:2507.21509](https://arxiv.org/abs/2507.21509) demonstrates personality traits exist as **linear directions in activation space**:

1. **Extract** a persona vector from contrastive prompt pairs (automated from natural-language descriptions)
2. **Monitor** persona fluctuations at deployment time
3. **Steer** by adding/subtracting the vector during inference
4. **Vaccinate** by pre-training with preventative steering

### PERSONA Framework (February 2026)

[arXiv:2602.15669](https://arxiv.org/abs/2602.15669) — training-free framework achieving **fine-tuning-level performance**:

- **Persona-Base:** Extracts orthogonal trait vectors via contrastive activation analysis
- **Persona-Algebra:** Vector arithmetic — scalar multiplication for intensity, addition for composition, subtraction for suppression
- **Persona-Flow:** Dynamic composition during inference
- **Results:** 9.60 on PersonalityBench vs 9.61 for supervised fine-tuning upper bound. **91% win rates** on dynamic adaptation benchmarks.

### Limitations

[arXiv:2602.15847](https://arxiv.org/abs/2602.15847) shows personality steering directions are **not truly orthogonal**. Steering one trait induces changes in others. For Faultline's coarse-grained differentiation (Saylor vs Buterin), this is manageable; for fine-grained trait control, it's a real limitation.

### The Catch

Requires access to model activations (hidden states). Works with **open-source models** where you control inference. Does **not** work with Claude API (black box). This pushes toward a hybrid architecture.

---

## Approach 5: Other Methods Worth Noting

### DPO with Persona-Specific Preferences

Create preference pairs per persona: "What would Saylor prefer as a response vs reject?" Simpler than RLHF, produces genuine behavioral alignment. Claude can generate these from PersonaContract + corpus. Best used as a refinement on top of LoRA.

### Constitutional AI Variants (Easiest, Implement Now)

Each persona gets a different "constitution" for self-critique:
- Saylor: "Always evaluate claims through the lens of store-of-value economics"
- Vitalik: "Prioritize decentralization and mechanism design"

Zero infrastructure change. Can be implemented today.

### Enhanced Reasoning-Method Prompts (DMAD Insight)

Force each persona to use a structurally different reasoning approach — not just different personality, but different **reasoning methods**:
- Analogical reasoning from monetary history (Saylor)
- Game-theoretic first principles (Vitalik)
- Empirical market data analysis (Hayes)
- Systems thinking / adoption curves (Armstrong)

This is what DMAD (ICLR 2025) found works: structural method diversity > personality prompt diversity.

---

## Recommended Phased Architecture

### Phase 1: Immediate (zero infrastructure change)

1. **Enhanced reasoning-method prompts** — Force each persona to use a structurally different reasoning approach, inspired by DMAD research
2. **Per-persona constitutions** — Different self-critique principles per persona

### Phase 2: Near-term (2-4 weeks)

3. **Deploy open-source model alongside Claude** — Llama 3.1 8B or Qwen 2.5 7B via vLLM or Together AI
4. **Activation steering with persona vectors** — Extract persona vectors, steer at inference time. Training-free, matches fine-tuning performance.
5. **Keep Claude for complex reasoning** — crux room diagnosis, steelman generation, card extraction

### Phase 3: Medium-term (1-2 months)

6. **LoRA-finetune per-persona adapters** on Llama 3.1 8B using Unsloth
   - Training data: existing corpus (~100 items) + synthetic augmentation via Claude (generate 500+ persona-consistent debate turns)
   - Deploy via Together AI Multi-LoRA ($0.20/M tokens) or self-hosted vLLM
7. **Combine LoRA (persona voice/style) with activation steering (personality traits)**

### Phase 4: Advanced (optional)

8. **DPO alignment per persona** using synthetic preference data
9. **CharLoRA-style multi-expert adapters** (style expert + reasoning expert per persona)
10. **Monitor TTT research** — revisit when production infrastructure exists

---

## Open-Source Model Recommendations

| Model | Size | Why | LoRA Support |
|-------|------|-----|-------------|
| Llama 3.1 8B | 8B | Best ecosystem, widest LoRA tooling | Excellent |
| Qwen 2.5 7B | 7B | Strong multilingual, good reasoning | Excellent |
| Mistral 7B v0.3 | 7B | Fast, good for chat | Good |
| DeepSeek V3 (distilled) | 7B | Strong reasoning | Growing |

---

## Cost Comparison

| Approach | Per-debate cost | Per-persona setup cost | Infrastructure |
|----------|----------------|----------------------|----------------|
| Current (Claude Sonnet API) | ~$0.10-0.30 | $0 | None |
| LoRA on Together AI | ~$0.005-0.01 | ~$1-2 (one-time training) | Upload adapter |
| LoRA on self-hosted vLLM | ~$0.002-0.005 | ~$1-2 + GPU rental | Manage server |
| Activation steering | ~$0.005-0.01 | $0 (extract vectors) | Open-source model serving |
| Hybrid (LoRA + Claude for crux) | ~$0.02-0.05 | ~$1-2 per persona | Both |

LoRA on Together AI/Fireworks is **30-60x cheaper** per inference call than Claude Sonnet, while providing structurally different persona reasoning.

---

## Gaps & Open Questions

1. **No direct benchmark exists** for "persona fidelity in multi-agent debate." Evaluating whether LoRA-tuned personas produce different *reasoning* (vs just *style*) remains an open problem.

2. **100 training examples is at the floor** for LoRA. Synthetic augmentation quality will be the bottleneck.

3. **Activation steering on Claude is not possible** through the API. Any persona vector approach requires open-source models, which may have lower baseline reasoning quality.

4. **Geometric interference** means persona trait steering is never fully independent — steering one trait bleeds into others.

5. **Latency tradeoff:** Self-hosted vLLM with LoRA adds ~50% throughput overhead. Together AI/Fireworks abstract this but add network latency. Needs benchmarking against current Claude SSE performance.

---

## Sources

### Multi-Agent Debate & Homogeneity
- [ICLR 2025 MAD Analysis](https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/)
- [DMAD — Breaking Mental Set (ICLR 2025)](https://openreview.net/forum?id=t6QHYUOQL7)
- [A-HMAD — Adaptive Heterogeneous MAD (Springer 2025)](https://link.springer.com/article/10.1007/s44443-025-00353-3)
- [DynaDebate (arXiv 2601.05746)](https://arxiv.org/html/2601.05746v1)

### LoRA & Persona Finetuning
- [CharacterBot / CharLoRA (arXiv:2502.12988)](https://arxiv.org/abs/2502.12988)
- [Split Personality Training (arXiv:2602.05532)](https://arxiv.org/abs/2602.05532)
- [S-LoRA — Thousands of Adapters (arXiv:2311.03285)](https://arxiv.org/abs/2311.03285)
- [Unsloth](https://unsloth.ai/) | [Axolotl](https://docs.axolotl.ai/)
- [LoRA Data Requirements Guide](https://dialzara.com/blog/fine-tuning-llms-with-small-data-guide)
- [Sebastian Raschka's LoRA Tips](https://magazine.sebastianraschka.com/p/practical-tips-for-finetuning-llms/comments)

### Activation Steering & Persona Vectors
- [Anthropic Persona Vectors (arXiv:2507.21509)](https://arxiv.org/abs/2507.21509)
- [PERSONA Framework (arXiv:2602.15669)](https://arxiv.org/abs/2602.15669)
- [Personality Trait Interference (arXiv:2602.15847)](https://arxiv.org/abs/2602.15847)
- [Linear Personality Probing (arXiv:2512.17639)](https://arxiv.org/html/2512.17639)

### Test-Time Training
- [TTT Layers (arXiv:2407.04620)](https://arxiv.org/abs/2407.04620)
- [TTT-E2E](https://test-time-training.github.io/e2e.pdf)
- [NVIDIA TTT Analysis](https://developer.nvidia.com/blog/reimagining-llm-memory-using-context-as-training-data-unlocks-models-that-learn-at-test-time)

### Serving & Infrastructure
- [vLLM LoRA Docs](https://docs.vllm.ai/en/stable/features/lora/)
- [Together AI Serverless Multi-LoRA](https://www.together.ai/blog/serverless-multi-lora-fine-tune-and-deploy-hundreds-of-adapters-for-model-customization-at-scale)
- [Fireworks AI Multi-LoRA](https://fireworks.ai/blog/multi-lora)
- [RunPod Budget Fine-tuning](https://www.runpod.io/articles/guides/how-to-fine-tune-large-language-models-on-a-budget)

### Other
- [PEFT Method Comparison](https://apxml.com/courses/fine-tuning-adapting-large-language-models/chapter-4-parameter-efficient-fine-tuning/comparison-peft-techniques)
- [DPO with Synthetic Data (2025)](https://www.philschmid.de/rl-with-llms-in-2025-dpo)
- [Mergekit — Model Merging](https://github.com/arcee-ai/mergekit)
- [HuggingFace PEFT Merging Guide](https://huggingface.co/docs/peft/developer_guides/model_merging)
