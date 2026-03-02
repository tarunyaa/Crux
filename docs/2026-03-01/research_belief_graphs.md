# Research: Individual Epistemic Belief Graphs + Argumentation Frameworks

**Research date:** March 1, 2026
**Task:** Idea #1 — Individual epistemic belief graphs and argumentation frameworks for Faultline
**Output scope:** What's buildable, what's theoretical, how each piece connects to the crux system

---

## Research Summary

Epistemic belief graphs are a well-motivated but underspecified idea. The flagship paper (GenMinds/2506.06958) is a position paper with no code, no dataset, and no validated extraction method — it is a manifesto, not an implementation blueprint. PRISM (2602.21317) is the closest working system, but it generates graphs per-inference for *novelty* and *diversity* goals rather than for *persona fidelity* — its seeds are stochastic, not persona-specific. The most actionable path for Faultline is the one already sketched in `architecture_2_26.md`: extract causal triples from the existing corpus using Haiku during `build-personas.ts`, store as `data/seed/beliefs/[Name].json`, and inject relevant nodes into the crux room context.

On the argumentation framework side, the picture is clearer. ArgLLMs (AAAI 2025) has a working implementation and demonstrates that LLMs + QBAF semantics can produce faithful, contestable reasoning. LLM-ASPIC+ achieves 87.1% on BoardGameQA-2, validating that neuro-symbolic argumentation works at scale. Both are more relevant to Faultline's *crux card extraction* and *disagreement compression* than to real-time debate generation. The graph→text→graph round-trip is achievable but requires careful schema design — CausalRAG shows the extraction direction works; the reverse (mapping debate text back onto a belief graph) is the harder, less-validated half.

**Bottom line:** Build offline belief graph extraction (it's ~$0.20/persona, runs once, and has a clear spec). Use argumentation framework semantics for crux card extraction, not real-time debate. Treat PRISM as a later-phase idea for on-the-fly epistemic diversity.

---

## Key Findings

1. **GenMinds is aspirational, not implementable as specified.** The belief graph extraction method relies on LLM-guided interviews, not corpus parsing. There is no code, no RECAP benchmark data, and no probability parameterization for the do-calculus machinery. The schema is illustrative (concept nodes + directed causal edges with polarity), not formal.

2. **A practical corpus-extraction pipeline is well-supported by adjacent work.** Causal triple extraction from text (CausalRAG, Causal-LLM, KGGen) is an active, validated area. Haiku can extract `(cause, effect, polarity, confidence)` triples from 280-token corpus chunks with reasonable reliability. This is the approach already specified in `architecture_2_26.md` and should be built.

3. **PRISM's on-the-fly epistemic graphs serve a different purpose than persona belief graphs.** PRISM diversifies LLM outputs across inference calls using stochastic seeds and cognitive operators. It is not designed to simulate a specific person's reasoning — it is designed to break the "Artificial Hivemind" across different queries. The key adaptation for Faultline: replace PRISM's random lexical seeds with persona-specific seeds drawn from the belief graph. This unlocks diverse yet persona-grounded inference. This is a Phase 2 idea.

4. **ArgLLMs (AAAI 2025) provides a working QBAF-based claim verification pipeline with public code.** The pipeline: LLM generates pro/con arguments → assigns confidence scores → QBAF built → DF-QuAD semantics applied deterministically → verdict derived. Performance is comparable to CoT baselines, but the output is faithfully explainable. This maps directly onto Faultline's crux card extraction step.

5. **LLM-ASPIC+ achieves state-of-the-art defeasible reasoning (87.1% BoardGameQA-2) but requires strict/defeasible rule extraction.** The neuro-symbolic pipeline needs explicit rule sets. For debates with open-ended claims this is a non-trivial extraction problem. Better suited to structured domains (legal, medical) than to the open-ended debates Faultline runs.

6. **The graph→text→graph round-trip has a well-validated extraction direction (text→graph) and a hard reverse direction (graph→text→graph).** CausalRAG demonstrates that text can be converted to causal graphs that improve retrieval. The reverse — taking a belief graph, generating personalized argument text grounded in it, then mapping the response back onto an updated graph — is the core of what Faultline needs and is not validated by any paper surveyed. It requires Faultline to build its own update logic.

7. **Dung's argumentation semantics (already implemented once in Faultline) is too coarse for crux extraction.** Grounded and preferred extensions tell you which arguments "win" in a complete framework, but crux extraction needs to identify *why* two arguments are incompatible — which premise underlies the attack. QBAF (used by ArgLLMs and ArgRAG) is more appropriate: it quantifies argument strength and propagates through support/attack networks, making it easier to find which nodes account for the disagreement.

8. **Disagreement compression via formal argumentation is achievable but requires a schema commitment.** If crux cards output structured argument nodes (claim + evidence + grounding chunks) with typed relations (supports/attacks/undercuts), then Dung/QBAF semantics can compute which arguments survive. The prerequisite is consistent claim extraction, not the formal semantics themselves.

---

## Detailed Analysis

### 1. GenMinds: What It Actually Proposes

**Paper:** "Simulating Society Requires Simulating Thought" (arXiv:2506.06958, MIT Media Lab, NeurIPS 2025 position paper)
**Authors:** Chance Jiajie Li et al. (13 authors), MIT Media Lab
**Status:** Position paper. No implementation. No released benchmark data.

GenMinds proposes Generative Minds — agents that carry *cognitive belief networks* (CBNs) derived from structured belief graphs. The graph schema is:
- **Nodes:** Causally relevant concepts (e.g., "Transparency," "Crime rate," "Public safety")
- **Edges:** Directional causal relations with polarity (positive/negative influence) and stated confidence scores
- **Cognitive motifs:** Recurring structural patterns in the belief graph (e.g., "values → instrumental belief → policy preference")

The extraction method described is *semi-structured interviews conducted by LLMs* — not corpus parsing. The paper does not describe how to extract graphs from social media text. The RECAP benchmark tests three dimensions: causal traceability, demographic sensitivity, and intervention coherence — but provides no data, no code, and no experiments.

**Do-calculus machinery:** Referenced but not parameterized. "Using belief propagation over the CBN, the downstream posteriors update" — no equations, no inference algorithm specified, no handling of cycles or missing CPDs.

**Verdict for Faultline:** GenMinds provides the vocabulary and motivation but not the implementation. The schema (cause, effect, polarity, confidence) is usable. The interview-based extraction is not applicable to Faultline's corpus. The do-calculus is unimplementable without CPDs.

**What to take:** The CBN schema. The cognitive motif framing (nodes group into patterns). The RECAP evaluation dimensions as evaluation criteria for Faultline's own belief graphs.

---

### 2. Practical Corpus-Based Belief Graph Extraction

Several papers validate that causal triple extraction from text is a solved problem:

**CausalRAG** (arXiv:2503.19878, ACL Findings 2025): Builds causal graphs from documents during indexing, then retrieves via causal path traversal rather than semantic similarity. Improves retrieval precision and contextual continuity. Key validation: LLM-extracted causal graphs from text preserve meaning better than chunk-based retrieval. The paper demonstrates the extraction → storage → retrieval pipeline works for QA tasks.

**KGGen** (arXiv:2502.09956): Text-to-KG generator that clusters entities to reduce sparsity. Validated that LLM-based triple extraction produces high-quality knowledge graphs from plaintext.

**Causal-LLM** (EMNLP Findings 2025): Unified one-shot framework for prompt-based causal discovery. Validates that LLMs can extract causal structure from natural language in zero-shot settings.

**Practical extraction pipeline for Faultline:**
```
For each persona corpus chunk (~280 tokens):
  Haiku prompt: "Extract causal claims the author makes in this text.
  Output JSON: { cause: string, effect: string, polarity: 1|-1, confidence: 0.0-1.0 }
  Only extract what the author explicitly states. Return [] if none."

After all chunks:
  Deduplicate by (cause_normalized, effect_normalized) pair
  Merge: keep max confidence, union sourceChunks
  Filter: remove triples with confidence < 0.4 or fewer than 1 source chunk
  Build adjacency list
  Write to data/seed/beliefs/[Name].json
```

**Expected yield:** 20-60 high-confidence triples per persona with 100+ corpus items. This is the right density — enough to ground debate responses without overwhelming the context window.

**Cost:** ~200 Haiku calls × ~$0.001 = ~$0.20 per persona. Runs once as part of `build-personas.ts`. Not latency-sensitive.

---

### 3. PRISM: On-the-Fly Epistemic Graphs

**Paper:** "Shared Nature, Unique Nurture: PRISM for Pluralistic Reasoning via In-context Structure Modeling" (arXiv:2602.21317, Feb 2026)
**Status:** Very recent preprint. No public code confirmed, though Appendix C.1 contains implementation details.

PRISM's goal is to break the "Artificial Hivemind" — the tendency for identically-seeded LLMs to produce semantically clustered outputs. It does this by giving each inference call a unique *epistemic trajectory* built from stochastic retrieval.

**Technical pipeline per inference:**
1. Sample 3 random lexical nouns as stochastic seeds
2. Perform "wild retrieval" returning heterogeneous documents
3. Segment into ~400-token chunks, sample 8
4. Extract Context Nodes (Vc, from query) and Spark Nodes (Vs, from retrieved docs)
5. Generate edges via cognitive operators: Mapping (→M, cross-domain transfer), Blending (→B, composite attributes), Inversion (→I, functional opposites)
6. Limit Vs to 7 via random sampling; serialize graph to text; inject into prompt
7. During generation, model traverses the explicit graph topology

**Results:** +28% NoveltyBench, +44.4% IdeaBench, +37.5% RareBench recall@1 over baseline.

**Critical distinction for Faultline:** PRISM's graphs are ephemeral and stochastic. They are designed to *diversify* outputs, not to maintain *persona consistency*. Using PRISM as-is would make each Faultline agent respond differently on each call even for the same persona — which is the opposite of what Faultline needs.

**The right adaptation:** Replace PRISM's random lexical seeds with persona-specific seeds drawn from the belief graph. Instead of 3 random nouns, use the 3-5 most relevant belief graph nodes for the current debate topic. The cognitive operators (Mapping, Blending, Inversion) can then generate persona-specific inferences grounded in their actual belief structure.

This is architecturally sound but is a Phase 2 feature — it requires the offline belief graph to exist first, then adds per-turn dynamic graph traversal on top.

---

### 4. The Graph→Text→Graph Round-Trip

This is the core loop Faultline needs for belief revision:
```
[Belief graph] → [reasoning trace] → [dialogue response] → [graph update]
```

**Text→Graph extraction** is well-validated (CausalRAG, KGGen, Causal-LLM). The extraction step is a solved problem.

**Graph→Text reasoning** is partially validated. MindMap (ACL 2024, arXiv:2308.09729) shows that injecting KG structure into LLM context elicits graph-of-thoughts reasoning. RoG (ICLR 2024, arXiv:2310.01061) demonstrates planning-retrieval-reasoning via KG relation paths. Both confirm that structured graph context improves LLM reasoning quality and traceability.

**Text→Graph update** (mapping agent responses back to belief graph changes) is *not validated by any surveyed paper*. This is the gap. No paper surveyed implements a real-time loop where agent dialogue responses update a per-agent belief graph in a way that then affects subsequent responses.

**What's practical for Faultline:**

*Option A (read-only graphs):* Build belief graphs offline, inject relevant nodes into crux room context. Never update the graph during a debate. Simple, validated, gives grounding without the update complexity. This is the MVP path.

*Option B (crux-triggered updates):* After a crux room resolves, run a Haiku pass to update the losing agent's `claims_accepted/claims_rejected` proposition list (as specified in `architecture_2_26.md`). This is lightweight belief revision without full graph updates. Validated by the `architecture_2_26.md` design — simple proposition list, not probabilistic propagation.

*Option C (full graph updates):* On each crux card resolution, propagate confidence changes through the belief graph DAG using the edge polarity. If a root node's confidence drops below 0.3, downstream dependent nodes reduce confidence proportionally. This is the GenMinds vision — but implementing it requires: (1) a complete DAG with confident edges, (2) a propagation algorithm, (3) deciding how far propagation goes. This is doable but significantly more complex. Defer to Phase 2.

---

### 5. ArgLLMs: QBAF for Crux Card Extraction

**Paper:** "Argumentative Large Language Models for Explainable and Contestable Claim Verification" (arXiv:2405.02079, AAAI 2025)
**Authors:** Freedman, Dejl, Gorur, Yin, Rago, Toni (King's College London)
**Code:** github.com/CLArg-group/argumentative-llms (confirmed public)
**Venue:** AAAI 2025, oral presentation

**Pipeline:**
1. LLM generates support arguments and attack arguments for a claim (recursively to depth 2, yielding 7 total arguments)
2. LLM assigns base confidence scores τ(α) ∈ [0,1] to each argument
3. Build QBAF (Quantitative Bipolar Argumentation Framework): arguments + attack relations + support relations
4. Apply DF-QuAD (Discontinuity-free Quantitative Argumentation Debate) semantics deterministically
5. Final strength > 0.5 → claim verified; otherwise rejected
6. Output: the computed QBAF as a reasoning trail

**Performance:** Comparable to CoT baselines (0.50-0.81 accuracy across three datasets), with the added benefit of faithful explainability and contestability.

**Adaptation for Faultline crux extraction:**

Instead of verifying a single claim, apply the QBAF structure to *represent the disagreement between two personas*:
- Persona A's position = root argument A with supporting sub-arguments (grounded in their corpus)
- Persona B's position = root argument B, attacking A (and vice versa)
- Each argument gets a confidence score based on the agent's epistemic state
- DF-QuAD computes the strength of each side
- The node(s) with the maximum attack contribution become the crux candidates

This is a principled way to identify *which specific sub-argument is doing the most work* in driving the disagreement — which is exactly what a crux card should capture.

**Key advantage over current approach:** The current crux card extraction is a single Sonnet call that summarizes the crux room. The ArgLLM approach gives a structured argument graph where every node traces to a specific dialogue statement, making the crux card faithfully grounded (no hallucination of the crux).

**Implementation complexity:** Medium. Requires: (1) QBAF data structure (straightforward TypeScript), (2) DF-QuAD implementation (deterministic algorithm, ~100 lines), (3) argument extraction prompt for crux room content. The CLArg code repo provides a Python reference implementation.

---

### 6. LLM-ASPIC+: Defeasible Reasoning at Scale

**Paper:** "LLM-ASPIC+: A Neuro-Symbolic Framework for Defeasible Reasoning" (ECAI 2025)
**Authors:** Fang, Li, Chen, Liao
**Performance:** 87.1% on BoardGameQA-2, 82.6% on BoardGameQA-3
**Dataset:** MineQA (newly synthesized), BoardGameQA

ASPIC+ extends Dung's AF with typed rules: strict rules (deductive, premises guarantee conclusion) and defeasible rules (presumptive, premises create a presumption). Arguments are structured trees built from these rules. The framework allows explicit preference ordering over defeasible rules.

LLM-ASPIC+ uses LLMs to: (1) extract strict and defeasible rules from text, (2) build ASPIC+ argument trees, (3) apply formal Dung semantics over the resulting AF.

**Why it outperforms Dung's abstract AF for defeasible tasks:** ASPIC+ captures *why* an argument can be defeated (it uses a defeasible rule that can be overridden by a preference), not just *that* it is defeated. This is crucial for debate: personas hold positions based on defeasible reasoning (heuristics, evidence, values), not deductive certainty.

**Practical assessment for Faultline:**

The rule extraction step is the bottleneck. BoardGameQA is a structured domain with explicit rules. Faultline debates are open-ended political/economic/tech discussions where rule extraction from LLM-generated debate text is unreliable.

**Verdict:** LLM-ASPIC+ is the right formal tool for future phases where Faultline operates on structured domains (legal, policy, medical debates). For current open-ended debate generation, it adds extraction complexity that is unlikely to be reliable enough to justify the overhead.

---

### 7. How Argumentation Frameworks Map to Faultline's Crux System

| AF Type | What It Does | Faultline Relevance | Build Priority |
|---------|-------------|--------------------|----|
| Dung AF (abstract) | Labels arguments IN/OUT/UNDEC | Already implemented (removed); useful for visualizing debate structure | Low — too coarse for crux extraction |
| QBAF (quantitative bipolar) | Computes argument strength; propagates through support/attack | **Best fit for crux card extraction.** Identifies which arguments drive disagreement. ArgLLMs code available. | Medium — Phase 1.5 |
| ASPIC+ (structured) | Captures why arguments are defeasible; preference-based defeat | Excellent for structured domains; too hard to extract from open-ended text | Phase 2+ |
| GenMinds CBN | Causal belief propagation via do-calculus | Right abstraction for persona belief modeling; unimplementable as specified | Adapt the schema; skip the probabilistic machinery |

**The crux room and QBAF fit naturally:**

A crux room already produces:
- Two opposing positions (each = root argument in QBAF)
- Exchange messages (each = sub-argument, supporting or attacking)
- A resolution phase (convergence check = DF-QuAD semantics)

Adding QBAF semantics to crux card extraction would mean: after the crux room exchange, build a QBAF from the structured turn data, run DF-QuAD, and identify the argument nodes with the highest attack contribution. Those nodes become the crux card's "root assumption" — the specific premise that, if true, determines which side wins.

This is a meaningful upgrade over the current LLM-summary approach: it is deterministic, auditable, and grounded in the actual exchange.

---

### 8. Disagreement Compression: The Core Question

The task asks: "Can we build a working disagreement compression engine from text?"

**Yes, with these components:**

1. **Claim extraction** (text→graph): Use Haiku to extract structured claims from each dialogue message: `{claim: string, polarity: 'for'|'against', confidence: float, messageId: string}`. This is validated — KGGen, CausalRAG both demonstrate reliable extraction.

2. **Disagreement detection** (graph comparison): Two agents hold disagreeing claims if their claims are semantically close but polarity-opposite. This is already partially done in Faultline's disagreement-detector.ts using sliding-window LLM analysis. Adding explicit claim extraction makes this more reliable and grounds the detection in extractable structure rather than LLM intuition.

3. **Crux isolation** (QBAF): Build a QBAF from the disagreeing claims + their sub-arguments. Apply DF-QuAD to find the claim with the maximum "attack contribution" — the one whose removal would most change the outcome. That is the crux.

4. **Crux card output**: The crux card records: crux claim, which persona holds it, what evidence supports/attacks it, and what would falsify it. This structure already exists in Faultline's CruxCard type — adding claim IDs and attack contribution scores would make it formally grounded.

**What remains hard:** The graph→text round-trip update — specifically, ensuring that when a persona "revises" a belief in a crux room, subsequent dialogue responses actually reflect that revision. With Claude API only (no fine-tuning), this requires explicit belief state injection into context, not weight-level changes.

---

## Gaps and Limitations

- **GenMinds' interview-based extraction** is incompatible with Faultline's corpus-based approach. No alternative validated method for extracting the "cognitive motif" layer (recurring structural patterns) from social media text exists. The simpler flat triple extraction is adequate for MVP.

- **Belief revision propagation** (when a crux resolves, which downstream beliefs change?) requires CPDs that nobody has specified for LLM agents. The practical fallback — a proposition list (`claims_accepted`, `claims_rejected`) updated post-crux — is the correct MVP approach.

- **PRISM's stochastic seeds** make it non-deterministic per inference. Using PRISM for persona consistency would require deterministic seed selection (from the belief graph), which is not how PRISM is designed. Requires adaptation rather than direct use.

- **DF-QuAD convergence properties**: The algorithm converges monotonically but can produce counter-intuitive results when attack/support cycles exist. For Faultline's debates, cycles are possible (A attacks B which attacks A). Need to handle gracefully — likely by breaking symmetry with a first-mover advantage (the initial position has a base score advantage).

- **ArgLLMs performance** (0.50-0.81 accuracy) is comparable to CoT baselines, not superior. The benefit is explainability, not accuracy gain. If the primary goal is accurate crux detection rather than explainable crux detection, QBAF adds overhead for the same result. The decision depends on how much Faultline values the auditable reasoning trail.

---

## Recommendations

### Build Now (MVP, aligned with `architecture_2_26.md` P5)

**Offline belief graph extraction** in `build-personas.ts`:
- Schema: `BeliefGraph { personaId, nodes: BeliefNode[], edges: BeliefEdge[] }` (as specified in `architecture_2_26.md`)
- Extraction: Haiku over 280-token corpus chunks → `(cause, effect, polarity, confidence)` triples
- Dedup: same (cause, effect) pair from multiple chunks → merge, keep max confidence
- Output: `data/seed/beliefs/[Name].json`
- Cost: ~$0.20/persona. Run once.

**Belief node injection in crux rooms** (extends `crux/orchestrator.ts`):
- At crux room start, retrieve 3-5 belief nodes most relevant to the crux question (cosine similarity or keyword match against node concepts)
- Include as structured JSON in the crux room user message: `"Your relevant beliefs: [...belief nodes...]"`
- Grounds crux room responses in persona-specific epistemic material without a full PRISM pipeline

**Proposition list update post-crux** (extends `crux/orchestrator.ts`):
- After crux card generated, run Haiku to extract `{accepted: string[], rejected: string[]}` claims from the resolution
- Append to per-persona state, pass forward to subsequent rounds
- Simple, debuggable, avoids probabilistic graph propagation

### Build Later (Phase 2)

**QBAF-based crux card extraction** (replaces or augments current Sonnet summary):
- After crux room exchange completes, extract argument nodes from turn data
- Build QBAF + run DF-QuAD to find attack contribution maxima
- Use as the crux card's "root assumption" field
- Implementation: ~200 lines TypeScript + the CLArg reference (Python → port to TS)

**PRISM-adapted epistemic seeds** (replaces random seeds with persona-specific ones):
- After belief graph exists, use top belief nodes as seeds for each agent's inference-time graph construction
- Ensures diversity across personas while maintaining persona grounding
- This is the right Phase 2 persona reasoning upgrade

**Full belief graph update on crux resolution** (propagates confidence through DAG):
- Requires complete DAG with confident edges
- Propagation: defeated root node → reduce confidence of downstream nodes proportionally
- Needs handling for DAG cycles and missing CPDs

### Do Not Build (Confirmed Dead Ends)

- **GenMinds' interview-based extraction** — incompatible with Faultline's corpus-based approach
- **GenMinds' do-calculus propagation** — unimplementable without CPDs
- **LLM-ASPIC+ for open-ended debate** — rule extraction from free-form debate text is too unreliable
- **Dung AF as primary crux structure** — too coarse; labels arguments IN/OUT without explaining why
- **PRISM as-is (stochastic seeds)** — would break persona consistency

---

## Sources

| Paper | Venue | arXiv | Assessment |
|-------|-------|-------|------------|
| "Simulating Society Requires Simulating Thought" (GenMinds) | NeurIPS 2025 (position) | [2506.06958](https://arxiv.org/abs/2506.06958) | No code, no data. Schema is usable; probabilistic machinery is not. |
| "Shared Nature, Unique Nurture: PRISM" | Feb 2026 preprint | [2602.21317](https://arxiv.org/abs/2602.21317) | Working system. Wrong goal (diversity, not persona fidelity). Adaptable with persona-specific seeds. |
| "Argumentative LLMs for Explainable and Contestable Claim Verification" | AAAI 2025 | [2405.02079](https://arxiv.org/abs/2405.02079) | **Best actionable paper.** Public code. QBAF pipeline maps directly to crux extraction. |
| "LLM-ASPIC+: A Neuro-Symbolic Framework for Defeasible Reasoning" | ECAI 2025 | IOS Press | Strong results (87.1% BoardGameQA-2). Rule extraction too brittle for open-ended debate. |
| "CausalRAG: Integrating Causal Graphs into Retrieval-Augmented Generation" | ACL Findings 2025 | [2503.19878](https://arxiv.org/abs/2503.19878) | Validates text→causal graph extraction pipeline. Useful reference for build-personas.ts extension. |
| "ArgRAG: Explainable RAG using Quantitative Bipolar Argumentation" | — | [2508.20131](https://arxiv.org/abs/2508.20131) | QBAF replaces black-box neural inference in RAG. Strong on PubHealth/RAGuard. |
| "The Argument is the Explanation: Structured Argumentation for Trust in Agents" | IAAI-26 | [2510.03442](https://arxiv.org/abs/2510.03442) | Bipolar ABA; 94.44 macro F1; hallucination detection via fact-claim contradiction. |
| "Belief Graphs with Reasoning Zones" | — | [2510.10042](https://arxiv.org/abs/2510.10042) | Contradiction-tolerant reasoning via parity-based coloring. Addresses the cycle problem. |
| "Enhancing Conflict Resolution in LMs via Abstract Argumentation" | — | [2412.16725](https://arxiv.org/abs/2412.16725) | Fine-tune on Dung AF explanations; self-explanation > CoT > QA training. |
| "KGGen: Extracting Knowledge Graphs from Plain Text" | — | [2502.09956](https://arxiv.org/abs/2502.09956) | Validates KG extraction from plaintext; entity clustering reduces sparsity. |

### Key Prior Work from Memory (Previously Researched)

- **ArgRAG** (`argrag_2025`): QBAF replaces black-box neural inference; strong on PubHealth, RAGuard
- **Belief Graphs with Reasoning Zones** (`belief_graph_reasoning_zones`): contradiction-tolerant via parity coloring — directly addresses QBAF cycle problem
- **Graph-Theoretic Model of Belief** (`graph_belief_model`): separates credibility from confidence; nodes=beliefs, edges=support/contradiction
- **CoBel-World** (`cobel_world`): symbolic belief world + Bayesian-style updates; 64-79% comms cost reduction — validates structured belief state as debater memory
- **Dung 1995** (`dung_1995`): foundational AF; grounded/preferred/stable semantics
- **ASPIC+** (`aspic_plus`): strict/defeasible rules over Dung AFs; the formal foundation LLM-ASPIC+ builds on
