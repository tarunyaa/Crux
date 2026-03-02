# Persona Modeling: Epistemic Personality for Crux

## The Problem, Stated Precisely

Faultline's personas currently have two layers:
1. **What they believe** — PersonaContract (bias, stakes, epistemology, flipConditions). Prose injected as system prompt.
2. **How they sound** — VoiceProfiles in speech-roles.ts (speech patterns, vocabulary, forbidden phrases).

What's missing:
3. **How they reason** — The cognitive process by which they arrive at conclusions.

All personas use the same Claude model. The model reads different system prompts and generates different opinions, but the internal reasoning process is structurally identical. Saylor and Vitalik both forward-chain from their system prompt to a conclusion. The CONTRACT tells them what to conclude; the MODEL decides how to get there — and the model always gets there the same way.

This is what GenMinds (MIT Media Lab, ICML 2025) calls the "demographics in, behavior out" paradigm: you inject demographic/personality data and get behavioral output, but there's no causal reasoning structure in between. The result is post-hoc rationalization — the model knows the answer it's supposed to give and backfills a reasoning chain.

### What "reasoning differently" actually means

Not: different conclusions from the same reasoning process (current system).
Not: different reasoning TEMPLATES as prompt injection (this is still just prompting — the model reads "reason by historical analogy" and generates text that LOOKS like analogical reasoning but is still the same forward-chaining underneath).

Actually: different traversal through different belief structures, grounded in real corpus data, producing reasoning chains that are structurally distinguishable.

---

## What the Key Papers Actually Say

### GenMinds: A Position Paper, Not a System

**Paper:** "Simulating Society Requires Simulating Thought" — Li et al., MIT Media Lab, ICML 2025 (arXiv:2506.06958)

GenMinds is a **position paper**. It argues for causal belief graphs but does not provide a complete implementation. Here's what's specified vs. what's vapor:

**Specified well enough to implement:**
- Belief graphs should be built from **real corpus data**, not LLM hallucination at session start
- The graph schema: causal triples `(cause, effect, polarity +/-, confidence)`
- Directed acyclic graph of concept nodes with confidence-weighted polarity edges
- The insight that belief graphs should be constructed by "interviewing" the persona — extracting what they've actually said, not what an LLM imagines they'd say

**Explicitly deferred to future work (i.e., not specified):**
- The interview protocol (how many questions, branching, termination)
- The motif parsing algorithm (how natural language → structured triples)
- The Conditional Probability Distributions — without these, you cannot run belief propagation. The paper cites do-calculus but never specifies the probability model. The example numbers (P=0.7→0.3) are illustrative, not computed.
- How the graph is serialized into LLM context at generation time
- RECAP benchmark is a specification, not an existing dataset

**The one actionable primitive from GenMinds:** Extract causal triples from your existing per-persona corpus. For each tweet, essay, or quote, extract `(cause, effect, direction)` relationships. Aggregate into a structured belief graph. This is "corpus interview without the interview" — the corpus already contains what the persona has said; you're extracting the causal structure that's implicit in their statements.

### PRISM: Real System, Wrong Target

**Paper:** "Pluralistic Reasoning via In-context Structure Modeling" — Feb 2026 (arXiv:2602.21317)

PRISM is real, implemented, and model-agnostic. It works with Claude via black-box API. But it's designed to make **any two calls to the same model** reason differently — not to make **Saylor** reason like Saylor specifically. The divergence comes from randomized seeds, not persona anchoring.

**How PRISM's epistemic graph actually works:**

1. **Context Nodes** — Key entities extracted from the topic (deterministic, temp=0.0)
2. **Spark Nodes** — "Operational mechanisms, salient properties, emergent byproducts" extracted from retrieved documents. Max 7, temp=0.3. These are the divergence source.
3. **Edges via three operators** at temp=1.2:
   - **Mapping**: "What mechanism from [retrieved concept] applies to [topic]?"
   - **Blending**: "What composite emerges from [retrieved concept] + [topic]?"
   - **Inversion**: "How does [retrieved concept] create productive tension with [topic]?"
4. **Key constraint**: Context↔Context edges are prohibited. Forces the reasoning to traverse through external material rather than just connecting topic entities directly.

**Why it produces diverse reasoning:** Different random seeds → different retrieval → different Spark Nodes → different graph topology → different reasoning traversal. Two calls to the same model produce structurally different reasoning because they literally traverse different graphs.

**The adaptation for Faultline:** Replace PRISM's random lexical seeds with **persona-specific epistemic seeds** drawn from the persona's actual data:
- `evidencePolicy.acceptableSources` key terms
- Epistemology section key concepts
- Anchor excerpt noun phrases

Saylor's seeds: `["store of value", "monetary history", "thermodynamic scarcity", "Lindy effect"]`
Vitalik's seeds: `["mechanism design", "coordination failure", "quadratic funding", "proof of stake"]`
Hayes's seeds: `["liquidity cycle", "monetary debasement", "carry trade", "vol surface"]`

Different seeds → different corpus chunks retrieved → different Spark Nodes → different graph → different reasoning chain. Same underlying Claude model, structurally different reasoning, grounded in persona-specific material.

### DMAD: Different CoT Methods, Not Different Templates

**Paper:** DMAD, ICLR 2025

The user correctly noted: DMAD doesn't prescribe "give each agent a different reasoning template." It tests different **chain-of-thought strategies** (standard CoT, self-contrast, complex CoT, etc.) and finds that using structurally different CoT methods produces more diverse agent outputs than personality prompting alone.

The takeaway is valid — method diversity > personality diversity — but the implementation is "use different CoT strategies per agent," not "write a prose template saying 'reason by analogy.'" The latter is just prompt injection that the model will superficially comply with while still forward-chaining underneath.

---

## What's Actually Wrong with the Current System

### Problem 1: Post-hoc rationalization

The PersonaContract tells the model what position to take. The model generates reasoning that supports that position. This is backwards — real people arrive at positions through their reasoning process, they don't reason backwards from a conclusion.

The belief graph inverts this. Instead of "you believe X, now justify it," it's "you have these beliefs connected in these ways, now traverse them to arrive at a response."

### Problem 2: No grounding in real corpus

The system prompt is ABOUT the persona but not FROM the persona. The prose in the contract was generated by Claude from the corpus, not extracted from it. By the time it reaches the debate, it's twice-removed from what the person actually said.

The anchor excerpts are the closest thing to grounding, but they're used as flavor text, not as reasoning primitives.

### Problem 3: Identical reasoning architecture

Every persona uses the same prompt structure → forward-chain → response. The STRUCTURE of reasoning is identical; only the CONTENT of the system prompt varies. Two personas debating is really one model debating itself with two hats on.

---

## The Actual Approach: Two Components

### Component 1: Offline Belief Extraction (in `build-personas.ts`)

Extract causal belief triples from the existing corpus. This runs once per persona during the build pipeline — not at session start, not from thin air.

**Process:**

For each persona's corpus (tweets + essays), run Haiku over each document chunk:

```
Given this text by {name}:
"{chunk}"

Extract causal belief relationships expressed or implied.
Each relationship: { cause, effect, polarity (+1 or -1), confidence (0-1) }

Examples:
- "Bitcoin's fixed supply makes it superior to fiat" →
  { cause: "fixed 21M supply", effect: "store of value superiority", polarity: +1, confidence: 0.95 }
- "Proof of stake reduces energy waste" →
  { cause: "proof of stake", effect: "energy consumption", polarity: -1, confidence: 0.8 }

Only extract relationships the author clearly holds. Do not infer beliefs they haven't expressed.
Return JSON array of relationships. If the chunk contains no causal claims, return [].
```

**Aggregation:**

After processing all chunks, deduplicate and merge:
- Same (cause, effect) pair from multiple chunks → average confidence, keep highest
- Contradictory pairs → flag for review (persona holds conflicting beliefs — this is interesting, not an error)
- Build adjacency list: for each node, what does it support/undermine?

**Output:** `data/seed/beliefs/[Name].json`

```json
{
  "personaId": "Michael Saylor",
  "nodes": [
    { "id": "n1", "concept": "Bitcoin fixed supply (21M)", "type": "factual_claim", "grounding": ["tweet_42", "tweet_87"] },
    { "id": "n2", "concept": "store of value superiority", "type": "inference", "grounding": ["essay_3"] },
    { "id": "n3", "concept": "fiat monetary debasement", "type": "core_value", "grounding": ["tweet_12", "tweet_55", "essay_1"] }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "polarity": 1, "confidence": 0.95, "sourceChunks": ["tweet_42"] },
    { "from": "n3", "to": "n2", "polarity": 1, "confidence": 0.9, "sourceChunks": ["essay_1"] }
  ]
}
```

**Cost:** ~200 Haiku calls per persona. Run once during build. Negligible.

**Why this isn't hallucination:** Every node is grounded in specific corpus chunks. Every edge traces back to something the persona actually said. The LLM is doing extraction, not generation. If the persona never expressed a belief, it doesn't appear in the graph.

### Component 2: Online Epistemic Graph (in `agent.ts`, per turn)

Adapt PRISM's mechanism for persona-specific reasoning. Before generating each turn response, construct a per-turn epistemic graph that forces the model to traverse persona-specific material.

**Process (two-stage turn generation):**

**Stage A: Graph Construction** (1 fast LLM call)

1. Extract **epistemic seeds** from the persona's belief graph — the 3-5 nodes most relevant to what was just said in the conversation
2. Retrieve corpus chunks connected to those nodes (via the `grounding` field in the belief graph)
3. Extract **Spark Nodes** from those chunks — mechanisms, properties, implications that aren't in the topic itself
4. Generate edges using PRISM's three operators (at high temperature for diversity):
   - **Mapping**: How does [belief/mechanism from corpus] apply to [what was just said]?
   - **Blending**: What emerges from combining [persona's framework] with [the current argument]?
   - **Inversion**: Where does [persona's framework] create tension with [what was just said]?
5. Serialize the graph into a brief text representation (~200-300 tokens)

**Stage B: Grounded Generation** (1 standard LLM call)

Prepend the serialized graph to the turn prompt. The model generates its response with the graph as the most proximal context — it cannot ignore it because it's right there.

```
[Epistemic graph for this turn]
Your reasoning path through your belief structure:
- Relevant belief: "Bitcoin fixed supply (21M)" [from your tweet, Mar 2024]
- Mapping: The supply cap argument applies to {opponent's claim} because...
- Tension: Your belief in {X} conflicts with {what was just said} on the axis of...

Now respond in character. Ground your argument in the reasoning path above.
```

**Why this solves the identical reasoning problem:** The model is forced to traverse a path through retrieved material specific to that persona. Saylor's graph pulls monetary history chunks and generates mapping/blending/inversion edges through those. Vitalik's graph pulls mechanism design chunks and generates different edges. The reasoning chains are structurally different because the MATERIAL they traverse is different — not because a prompt told them to "reason differently."

**Cost per turn:** 1 additional Haiku call for graph construction (~50-100 tokens output). Adds ~200ms latency.

---

## How This Integrates with Crux Rooms

The belief graph is most valuable in crux rooms, where deep reasoning matters more than in casual dialogue.

### Pre-room: Graph Diff for Disagreement Detection

When two personas' belief graphs share overlapping nodes but with different polarity or confidence, that's a structural disagreement — not just a surface-level opposition. The disagreement detector can check:

```
Saylor: { "proof of stake" → "security", polarity: -1 }  // PoS undermines security
Vitalik: { "proof of stake" → "security", polarity: +1 }  // PoS improves security
```

This is a real crux — they have the same causal claim with opposite polarity. Much more reliable than detecting disagreement from natural language.

### In-room: Constrained Concession

During a crux room exchange, the belief graph constrains what concessions are structurally possible. If Saylor's graph has "21M supply cap" as a core_value node with 0.95+ confidence grounding multiple downstream beliefs, the model can't casually concede it — the graph shows that conceding this node invalidates 5 other beliefs. This prevents sycophantic agreement.

Conversely, if a node has low confidence and few downstream dependencies, conceding it is easy and natural. The graph provides a mechanical basis for when and how personas update beliefs.

### Post-room: Card Grounding

The crux card can reference specific graph nodes:

```
Crux: Whether proof-of-stake provides equivalent security to proof-of-work
Type: empirical (same causal claim, opposite polarity)
Saylor's grounding: [tweet_23, essay_2] — "Energy expenditure IS security"
Vitalik's grounding: [essay_5, tweet_91] — "Economic stake provides equivalent guarantees"
```

The card traces the disagreement to specific things the personas actually said, not LLM-generated summaries.

---

## What This Does NOT Solve

### Same model reasoning distribution

Even with persona-specific graphs, the underlying model is still Claude. The graph forces different MATERIAL into the reasoning chain but the reasoning OPERATIONS (how the model connects A to B) are still Claude's default. True operational diversity requires either:
- Different base models per persona (A-HMAD finding: model diversity > adapter diversity)
- LoRA-trained reasoning adapters
- Activation steering on open-source models

This is Phase 2. For MVP, material diversity via belief graphs is the achievable first step.

### Persona drift

The belief graph helps with drift (it's re-injected every turn as proximal context), but doesn't eliminate it. Attention decay still occurs on the system prompt. The graph acts as a partial re-anchoring mechanism because it's in the user message, not the system prompt — but long conversations will still see degradation.

### Verification

There's no way to verify that the model actually USED the graph versus just generating a response that superficially references it. LOT classifier (arXiv:2509.24147) could test whether two personas' reasoning traces are distinguishable, but this is an evaluation tool, not a guarantee.

---

## Implementation Plan

### Phase 1: Belief Extraction (extend `build-personas.ts`)

Add a step after contract generation:

1. Load the filtered corpus for each persona
2. Chunk into ~280-token segments
3. Run Haiku extraction on each chunk → causal triples
4. Deduplicate, merge, build adjacency list
5. Write to `data/seed/beliefs/[Name].json`

**New field in PersonaContract or separate file.** Separate file is cleaner — the contract stays prose (for system prompt), the belief graph stays structured (for graph operations).

**Cost:** ~200 Haiku calls per persona × ~$0.001 each = ~$0.20 per persona. Negligible.

### Phase 2: Per-Turn Graph Construction (modify `agent.ts`)

Before `generateMicroTurn`:

1. Load persona's belief graph
2. Find nodes relevant to the last message (keyword overlap or Haiku classification)
3. Retrieve grounding corpus chunks for those nodes
4. Generate Spark Nodes + edges (PRISM-style operators)
5. Serialize graph into ~200-300 token text
6. Prepend to the turn prompt

**Decision:** Do this for ALL dialogue turns or only crux room turns?
- All turns: more consistent reasoning, higher cost (~1 extra Haiku call per turn)
- Crux rooms only: cheaper, still gets the benefit where it matters most
- **Recommendation:** Crux rooms + every 3rd dialogue turn (matches disagreement detection cadence)

### Phase 3: Graph-Aware Crux Rooms (modify `crux/orchestrator.ts`)

1. Pre-room: run graph diff between the two personas' belief graphs to identify structural disagreement nodes
2. In-room: include relevant belief graph nodes in each turn prompt, with concession constraints
3. Post-room: card extraction references specific graph nodes and corpus grounding

### Phase 4: Evaluation

1. Run debates with and without belief graphs
2. Use LOT classifier to test whether personas' reasoning traces are distinguishable
3. Check whether crux cards reference specific corpus material vs. generic LLM summaries
4. Measure sycophancy rate — do personas concede core beliefs less often with graphs?

---

## Open Questions

1. **Graph granularity.** How many nodes per persona? Too few (5-10) and the graph is sparse — most turns won't find relevant nodes. Too many (50+) and the extraction is noisy and expensive. Need to empirically tune. Starting point: aim for 20-30 high-confidence nodes per persona.

2. **Belief graph per topic or universal?** The current corpus is scraped around a deck topic (e.g., "crypto"). So the belief graph is implicitly topic-scoped. But if a persona appears in multiple decks, they'd need multiple graphs — or one universal graph filtered per topic.

3. **Graph staleness.** The belief graph is built from the corpus, which is scraped at a point in time. If a persona's views evolve (Saylor starts hedging on Bitcoin), the graph is stale. This is a corpus freshness problem, not a graph problem — re-running `build-personas` refreshes everything.

4. **Confidence calibration.** Haiku assigns confidence scores to extracted triples, but these are LLM-generated numbers, not calibrated probabilities. Should confidence just be binary (stated vs. implied) rather than a float?

5. **How to handle beliefs the persona HASN'T expressed.** The corpus only captures what they've said publicly. Saylor probably has beliefs about AI regulation that aren't in his Bitcoin-focused tweets. The graph correctly excludes these — but this means the persona can't engage on topics outside their corpus. Is that a feature or a bug?

6. **PRISM's high-temperature edge generation.** Temp=1.2 for the mapping/blending/inversion operators introduces randomness. Two turns by the same persona on the same topic will produce different graphs. This is by design in PRISM (diversity is the goal). For Faultline, is per-turn variance desirable or should the graph be more stable?

---

## What Was Wrong in the Previous Analysis

For the record, corrections from the user:

1. **"Give each persona a structurally different reasoning template" is just prompt injection.** Writing "reason by historical analogy" in the system prompt doesn't change the reasoning architecture. The model reads it and generates text that LOOKS like analogical reasoning while still forward-chaining underneath. This is surface compliance, not structural differentiation.

2. **"Construct a belief graph at session start with 1 LLM call" is hallucination.** GenMinds builds graphs from real corpus data via extraction. Asking an LLM to "construct a belief graph for Saylor on topic X" produces what the LLM IMAGINES Saylor believes, not what Saylor has actually said. The graph must be grounded in the corpus.

3. **DMAD is about CoT method diversity, not reasoning templates.** It tests standard CoT vs self-contrast vs complex CoT etc. The finding is that using different CoT strategies produces more diverse outputs — but the implementation is selecting different CoT algorithms, not writing prose descriptions of reasoning styles.

4. **GenMinds is a position paper.** The belief propagation math (do-calculus, CPDs) is specified in concept but not implemented. The interview protocol is not detailed. RECAP doesn't exist as a dataset. The extractable primitive is: causal triples from corpus data.

5. **PRISM is persona-agnostic.** It achieves diversity through randomized seeds, not persona anchoring. The adaptation for Faultline requires replacing random seeds with persona-specific epistemic seeds — this is a real contribution but it's our design, not something PRISM specifies.
