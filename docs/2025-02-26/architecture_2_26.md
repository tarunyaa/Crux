# Architecture: February 26, 2026

Two parts: (1) the general architecture of the product and (2) what's implementable for the MVP.

---

# Part 1: General Architecture

## Persona Modeling

### Epistemic Personality

The goal: personas should REASON differently, not just CONCLUDE differently. Currently all personas forward-chain from a system prompt to a conclusion using identical model-default reasoning. The system prompt determines WHAT they say; the model determines HOW they get there — and the HOW is always the same.

#### Belief Graphs

**Construction: Offline, from real corpus data.**

GenMinds (MIT Media Lab, ICML 2025) argues for causal belief graphs but is a position paper — no code, no datasets, no RECAP benchmark released. The paper specifies a schema of `(cause, effect, polarity +/-, confidence)` triples assembled into a directed acyclic graph. The interview protocol and parsing algorithm are not specified. GenMinds' do-calculus machinery is aspirational — nobody has implemented it for LLM agents.

**What's actually implementable:** Extract causal triples from the existing persona corpus during `build-personas.ts`. For each tweet/essay chunk, Haiku extracts `(cause, effect, direction)` relationships the persona actually expressed. Every node traces to a specific corpus chunk. This is "corpus interview without the interview" — the corpus already contains what they've said.

**Graph size concern:** With ~100 tweets + essays per persona, extraction yields roughly 20-50 high-confidence causal triples. This is manageable. The graph doesn't need to be comprehensive — it needs to capture the persona's key reasoning patterns on their deck topic. If extraction yields 100+ triples, deduplicate and keep only those with multiple grounding sources.

**Output:** `data/seed/beliefs/[Name].json` — stored alongside contracts, not generated at session start.

#### Personalized Reasoning / CoT

**Do we need CoT?** Yes, but not user-visible CoT. The belief graph is used to generate an internal reasoning trace before the visible response. This is a two-stage turn:

1. **Stage A (internal):** Given the conversation + belief graph, identify which beliefs are relevant, which are threatened, what the persona's epistemic state is. This is the HumanLM latent-state idea adapted for epistemic dimensions — but implemented as a prompting technique, not trained.

2. **Stage B (visible):** Generate the response grounded in the Stage A trace.

**Do we need to tag the reasoning traces?** TagPR (arXiv:2509.23140) forces externalized reasoning into discrete tagged steps (`<examine_examples>`, `<identify_patterns>`). This is promising for evaluation (you can verify personas reason differently by checking their tags) but adds token cost and implementation complexity. For MVP: skip tagging. For evaluation later: add it to verify differentiation.

**On "reasoning method templates":** You correctly identified that giving each persona a prompt like "reason by historical analogy" is just prompt injection. The model superficially complies while still forward-chaining underneath. The belief graph + PRISM-style epistemic graph is the structural alternative — it forces the model to traverse persona-specific material, producing genuinely different reasoning chains because the MATERIAL is different, not because a prompt told it to "think differently."

#### Belief Revision

**AGM is impractical for LLMs.** AGM revision operators require a belief set closed under logical consequence — you'd need a theorem prover. No one has implemented this for LLM agents.

**Bayesian belief propagation:** The closest implementation is DeGroot scalar update (Chuang et al., NAACL 2024): after each turn, `belief_new = (1-α) × belief_old + α × evidence_signal`, where α is a persona-specific "persuadability" parameter. This assumes beliefs are scalars, which limits it to pro/con topics.

**What's practical:** A proposition list per persona (`claims_accepted`, `claims_rejected`) updated after each crux room resolution. When a crux card resolves a factual crux, the persona's downstream beliefs shift accordingly. Simple, debuggable, matches what crux rooms already produce.

**GenMinds' belief revision approach:** Aspirational. The paper describes propagation via do-calculus but provides no CPDs (conditional probability distributions), without which propagation is uncomputable. Skip the probabilistic machinery; use the simple proposition list.

### Stylistic / Linguistic Personality

#### Current State (and what's wrong with it)

The codebase audit reveals **significant over-prompting**:

| Component | Tokens | What It Does |
|-----------|--------|-------------|
| `buildSystemPrompt()` | ~2,700 | Full persona contract (personality, bias, stakes, epistemology, timeHorizon, flipConditions, evidencePolicy, anchor quotes) |
| `buildVoiceConstraints()` | ~750 | Chat style hint, speech patterns, vocabulary, forbidden phrases, voice examples |
| `CHAT_TONE_EXAMPLES` | ~150 | Generic Alice/Bob/Charlie chat example |
| `HARD RULES` (user message) | ~80 | "Never hedge", "Never lists" — repeats forbidden phrases |
| `Good examples` (user message) | ~200 | 4 example utterances |
| **Total per dialogue turn** | **~4,400** | For 200 tokens of output |

**Redundancy:** Each layer does overlapping work:
- Personality section says "communicates with intensity and conviction"
- Voice constraints repeats "Declarative. Never hedge."
- HARD RULES repeats "Never hedge", "No lists"
- Forbidden phrases list repeats "I think", "I believe"

~1,000 tokens are wasted on duplicated instruction. A consolidated system prompt of ~2,200 tokens would suffice.

**The user's concern about prompt injection is valid.** With 4,400 tokens of instruction fighting for control of a 200-token output at temperature 1.0, you get:
- Contradictory signals (persona says "systematic reframes" but HARD RULES says "no lists")
- High variance from temp=1.0 with an extreme context-to-output ratio (22:1)
- Potential for the model to latch onto the wrong signal (recent chat history vs. persona identity)

#### Semantic Memory (LoRA / Prompt Baking)

**Prompt baking** (arXiv:2409.13697) is a real technique: LoRA-based gradient optimization that minimizes KL divergence between a prompted model and an unprompted model. The result is weights that behave as if the prompt were always present. It works — the paper shows "near constant persona stability throughout dialogues."

**But it requires open-source model weight access.** It is incompatible with Claude API. It only works with models you can backprop through (Llama, Qwen, etc.).

**LoRA** is the same constraint — requires open-source model deployment. CharLoRA (ACL Findings 2025) demonstrates multi-expert LoRA that separates style from reasoning, which is the right decomposition. But it's infrastructure you don't have for MVP.

**For Claude API, the alternative:**
1. Consolidate the system prompt to ~2,200 tokens (remove redundancy)
2. Periodic re-anchoring: every N turns, re-inject core identity (name, 2-3 key beliefs) into the USER message (not just system prompt) to counteract attention decay
3. Compact belief graph in context (~500 tokens of structured JSON) as a supplementary anchor

#### Episodic Memory / Argumentative Memory

**PRIME** (EMNLP 2025) maps well to Faultline: episodic memory = corpus (tweets, essays), semantic memory = contract (beliefs, biases). But PRIME does personalized chain-of-thought via self-distillation, which requires training. For MVP, the corpus data can be used as retrieval demonstrations (RAGs to Riches approach, arXiv:2509.12168) — retrieve relevant corpus chunks per turn to ground responses in authentic source material.

**R-Debater** passes full partial history to each agent. No truncation, no summarization. This works for short debates but not for Faultline's 50+ message dialogues.

**For debate history management, the tiered approach:**
- **Recent turns**: Keep verbatim (last 5-8 messages)
- **Older turns**: Rolling LLM-generated summary of positions taken + cruxes identified
- **Contested claims**: Extract explicitly from crux cards and disagreement detection; include as a separate field in context rather than relying on history compression to preserve the signal

---

## Debate Format

### Structure: Panel Debate with Crux Rooms

(Detailed in `debate_format.md`. Summary here.)

```
Topic Decomposition (1 LLM call upfront)
  → Opening Round (all agents respond in parallel)
  → Themed Rounds (one per aspect)
      → Take: all agents respond in parallel
      → Clash: sequential rebuttal between disagreeing agents
      → Crux Room spawns if disagreement is strong enough
  → Closing Round (all agents, final positions)
```

**Moderator role:** Topic-setter only. Picks sub-topics upfront, says "now discuss X." Does not evaluate, steer, or synthesize.

**The original topic must be passed to the crux room.** Agreed — the crux room prompt should include: "This crux room is about [specific disagreement], which arose in the context of the wider debate on [original topic]. Stay relevant to the wider topic."

**Crux cards posted back to the debate for another layer:** This is a future feature. For MVP, crux cards are the final output of each room. A later version could re-inject cards as "evidence" for subsequent themed rounds.

### Disagreement Detection

**Current approach:** Haiku analyzes a 10-message sliding window every 3 messages. Confidence threshold ≥ 0.8. Same pair detected twice → spawn.

**The user's concern: "not relevant to the wider topic."** This is a real problem. The disagreement detector currently doesn't check whether the detected disagreement is relevant to the debate topic — it just finds any opposing positions. In a themed-round format, this is partially solved (agents are discussing the same aspect), but the detector should also verify topic relevance.

**On fidelity:** LLM-verbalized confidence scores are unreliable. Research shows they're the worst calibration method available — the model hallucinates numbers. Two better options:

1. **Majority vote:** Run Haiku detection 3 times with the same context; spawn crux room if ≥ 2/3 return `hasDisagreement: true`. Converts unreliable float into a majority-vote binary. Cost: 3× Haiku instead of 1×, but Haiku is cheap.

2. **Boolean decomposition:** Instead of asking for a confidence float, ask for `has_direct_opposition: bool` and `has_repeated_engagement: bool` separately. Trigger on the conjunction. Avoids relying on calibrated confidence entirely.

### Debate History

**Current:** Full 5-message recent window in user message. No summarization.

**Problem:** With the panel debate format (4 agents × 3 aspects × parallel + rebuttal), history grows fast. By mid-debate you could have 30+ messages.

**Solution: Tiered context.**

```
Each agent receives:
1. [Contested claims so far] — explicit list from disagreement detection + crux cards
   "Saylor and Vitalik disagree on whether PoS provides equivalent security."
   "Hayes and Armstrong disagree on regulatory timeline."

2. [Current round context] — the themed round's parallel takes + rebuttals (verbatim)

3. [Older round summaries] — 1-2 sentence summary per previous round
   "Round 1 (Mental Health): Agents diverged on addiction evidence. Crux: definition of addiction."

4. [Crux cards produced so far] — structured, compact
```

This keeps context under ~2,000 tokens regardless of debate length. The contested claims field is the most important — it ensures agents know what's been established.

### Crux Room

#### "Premise Left Unsaid" Insights

The paper (ACL ArgMining 2025) validates a core crux room assumption: structured multi-agent engagement around disagreement produces better epistemic outcomes than single-agent reasoning. **Critical finding: forcing agents to defend assigned stances DEGRADES performance** ("rhetorical rigidity to flawed reasoning"). Agents that argue from genuine assessment outperform those told "you must argue for X."

**Implication for crux rooms:** Do not pre-assign who is "pro" and who is "con." Let agents argue from their actual beliefs as derived from their persona contracts and belief graphs. The current crux room already does this correctly — agents enter with their positions from the dialogue, not assigned roles.

#### Crux Room Flow

**The user's suggestion:** Initial rounds are clarification, later rounds prompt agents to neutrally evaluate both premises and converge.

**How to implement this without over-prompting:**

```
Phase 1: Position Statement (1 turn each)
  Prompt: "State your position on [crux question] and WHY you hold it."
  No additional instruction. Let the belief graph ground the response.

Phase 2: Directed Exchange (2-8 turns, adaptive)
  Early turns prompt: "Identify where specifically you disagree with
  [opponent]'s last statement. What evidence or reasoning do they
  rely on that you reject?"

  Later turns prompt (after turn 4): "Consider [opponent]'s strongest
  argument. If you had to steelman their position, what would you say?
  Then explain why you still disagree — or where you've updated."

Phase 3: Convergence Check (1 turn each)
  Prompt: "In one sentence: what is the core thing you two can't agree on?
  Is it a factual question, a values difference, or a definitional issue?"

  If both agents name the same thing → extract card.
  If they name different things → 2 more rounds of Phase 2.
```

**This is NOT over-prompting.** The phase-specific prompts replace the current generic "argue back in 2-3 sentences" with targeted instructions that guide the conversation structure without steering content. The instructions get more specific as the room progresses, which mirrors the "Premise Left Unsaid" finding that rounds should progress from exploration to convergence.

### Crux Cards

**Visualization:** No research supports hexagonal layouts for debate visualization. The closest validated approach is a **force-directed claim graph**: nodes = claims (not personas), edges = support/attack relations, node color = which persona holds the claim. This produces a genuine disagreement map. D3.js force simulation handles this.

**Key constraint for non-hallucinated graphs:** Every node must correspond to an explicit text segment. Every edge must correspond to an explicit argumentative move. Do not infer latent connections. The crux card already captures this structure — extend it with explicit claim IDs.

**Persona alignment graph:** Map each persona to their position on each resolved crux. Binary (agree/disagree) or ternary (agree/disagree/nuanced). The alignment graph is derived directly from crux card data — no inference needed.

---

## Criticisms on Current Architecture (Honest Audit)

### What's Actually Happening Under the Hood

Per the codebase audit, a single dialogue turn sends:

```
System prompt: buildSystemPrompt()          2,700 tokens
             + buildVoiceConstraints()        750 tokens
             + CHAT_TONE_EXAMPLES             150 tokens
User message: microTurnPrompt()              500 tokens
             + HARD RULES                      80 tokens
             + Good examples                  200 tokens
─────────────────────────────────────────────────────────
Total input:                               ~4,400 tokens
Output budget:                               200 tokens
Model: Haiku, Temperature: 1.0
```

**There are FOUR overlapping constraint layers:**
1. PersonaContract prose (2,700 tokens) — describes personality, tells agent how to behave
2. VoiceConstraints (750 tokens) — speech patterns, vocabulary, examples that repeat what the contract already says
3. CHAT_TONE_EXAMPLES (150 tokens) — generic Alice/Bob conversation that has nothing to do with the specific persona
4. HARD RULES + Good examples (280 tokens) — forbidden patterns that duplicate the VoiceConstraints forbidden list

**Is this hallucination-inducing?** Yes. The model receives contradictory signals:
- Contract says "systematic reframes" → HARD RULES says "no lists" → model doesn't know which to follow
- VoiceConstraints shows examples in one style → CHAT_TONE_EXAMPLES shows a completely different style
- Temperature 1.0 with a 22:1 input-to-output ratio means the model has maximum freedom to pick any signal

### What "Confidence" Means

Currently used in disagreement detection: `confidence: 0.0-1.0`. This is an LLM-hallucinated number. Research confirms: self-verbalized confidence scores are the worst calibration method available. The model hallucinates a number that looks reasonable but has no relationship to actual certainty.

**Fix:** Replace with majority vote (3 Haiku calls, trigger on 2/3 agreement) or boolean decomposition (separate `has_opposition` and `has_engagement` fields, trigger on conjunction). Drop the float.

### Temperature

| Current Call | Temp | Assessment |
|-------------|------|------------|
| Dialogue turns | 1.0 | **Too high.** Max sampling randomness with 4,400 token context. Reduces persona consistency. Research shows temp ≤ 0.5 + assertive persona produces best outcomes. Recommend: 0.8-0.9. |
| Disagreement detection | 0.2 | Good. Low variance for classification. |
| Crux room turns | 0.9 | Slightly high for focused argumentation. Recommend: 0.7-0.8. |
| Crux exit check | 0.2 | Good. |
| Card extraction | 0.3 | Good. |

### How Can Prompt Injection Be Managed?

The current architecture sends personality card + debate history + debate instructions + structural instructions (steelman first, then conflict) all in one call. This IS a lot.

**The answer is not to reduce information but to SEPARATE concerns:**

```
System prompt (stable per persona, sent once):
  - Consolidated identity: who you are, how you think, how you talk
  - ~2,200 tokens (down from 3,600)

User message (changes per turn):
  - What's happening now: conversation context, turn instructions
  - ~500-800 tokens

NOT in prompt (structural decisions made by orchestrator):
  - Whether to steelman or conflict (orchestrator picks the phase, not the model)
  - When to exit the crux room (Haiku exit check, not self-monitoring)
  - What topic to discuss next (moderator decision, not agent decision)
```

The key insight: **move structural decisions OUT of the prompt and INTO the orchestrator code.** The model doesn't need to be told "first steelman then conflict" — the orchestrator simply sends different prompts in different phases. The model just responds to what's in front of it.

---

# Part 2: MVP Implementation

What's actually buildable in the next sprint, given: Claude API only, no open-source model deployment, no training infrastructure.

## MVP Scope

### Build

1. **Belief graph extraction** (extend `build-personas.ts`)
2. **Consolidated system prompt** (refactor `loader.ts` + `agent.ts`)
3. **Panel debate format** (rewrite `orchestrator.ts`)
4. **Improved crux room flow** (rewrite `crux/orchestrator.ts`)
5. **Better disagreement detection** (majority vote or boolean decomposition)
6. **Tiered debate history** (rolling summaries + contested claims)

### Don't Build

- LoRA / prompt baking (requires open-source model)
- Activation steering / persona vectors (requires open-source model)
- Full belief propagation / do-calculus (nobody has implemented this)
- TagPR reasoning trace tagging (evaluation tool, not generation tool)
- Crux card re-injection into debate (future feature)
- Hexagonal alignment graphs (no research basis; do force-directed claim graph)

---

## 1. Belief Graph Extraction

**Where:** New step in `build-personas.ts`, after contract generation.

**Process:**

```
For each persona:
  1. Load filtered corpus (already done in build-personas)
  2. Chunk into ~280-token segments
  3. For each chunk, Haiku extracts causal triples:
     { cause: string, effect: string, polarity: +1|-1, confidence: 0-1 }
     Only extract relationships the author clearly expressed.
  4. Deduplicate: same (cause, effect) from multiple chunks → keep highest confidence
  5. Build adjacency list
  6. Write to data/seed/beliefs/[Name].json
```

**Schema:**

```typescript
interface BeliefGraph {
  personaId: string
  nodes: BeliefNode[]
  edges: BeliefEdge[]
}

interface BeliefNode {
  id: string
  concept: string
  type: 'core_value' | 'factual_claim' | 'inference' | 'assumption'
  grounding: string[]  // corpus chunk IDs
}

interface BeliefEdge {
  from: string  // node ID
  to: string    // node ID
  polarity: 1 | -1
  confidence: number
  sourceChunks: string[]
}
```

**Cost:** ~200 Haiku calls per persona × ~$0.001 = ~$0.20 per persona. Run once.

---

## 2. Consolidated System Prompt

**Current:** 3,600 tokens across 3 concatenated blocks with ~1,000 tokens of redundancy.

**Target:** ~2,200 tokens in a single block.

```
You are {name} ({handle}).

## Identity
{merged personality + bias + stakes — 800 tokens max}

## How You Think
{merged epistemology + evidence policy + time horizon — 500 tokens max}

## What Changes Your Mind
{flip conditions — 200 tokens max}

## Your Voice
{merged voice constraints + speech patterns + vocabulary — 500 tokens max}
{2-3 voice examples embedded here}
{forbidden phrases as a short list}

## Grounding
{top 5 anchor quotes — 200 tokens max}
```

**What's removed:**
- CHAT_TONE_EXAMPLES (generic, not persona-specific)
- HARD RULES from user message (moved into "Your Voice" section)
- Good examples from user message (moved into "Your Voice" section)
- Duplicate forbidden phrases across VoiceConstraints and HARD RULES

**User message becomes pure context:** just the conversation, turn instructions, and (if applicable) epistemic graph. ~500 tokens.

---

## 3. Panel Debate Format

**Rewrite `orchestrator.ts`.**

```typescript
async function* runDebate(config: DebateConfig): AsyncGenerator<DebateEvent> {
  // 1. Topic decomposition (1 Haiku call)
  const aspects = await decomposeTopicIntoAspects(config.topic, 3-4)
  yield { type: 'debate_start', topic: config.topic, aspects }

  // 2. Opening round (parallel)
  const openings = await Promise.all(
    config.personaIds.map(id => generateOpening(id, config.topic))
  )
  for (const msg of openings) yield { type: 'message_posted', message: msg }

  // 3. Themed rounds
  for (const aspect of aspects) {
    yield { type: 'round_start', aspect }

    // 3a. Parallel takes
    const takes = await Promise.all(
      config.personaIds.map(id => generateTake(id, aspect, debateContext))
    )
    for (const msg of takes) yield { type: 'message_posted', message: msg }

    // 3b. Disagreement detection on parallel takes
    const disagreement = await detectDisagreementFromTakes(takes)

    // 3c. Sequential clash if disagreement detected
    if (disagreement) {
      yield { type: 'clash_start', personas: disagreement.personas }
      // 2-4 sequential rebuttal messages
      for await (const msg of runClash(disagreement, debateContext)) {
        yield { type: 'message_posted', message: msg }
      }

      // 3d. Crux room if clash doesn't resolve
      if (disagreement.intensity > threshold) {
        for await (const event of runCruxRoom(...)) {
          yield event
        }
      }
    }

    yield { type: 'round_end', aspect }
    updateDebateContext(takes, clashMessages, cruxCards)
  }

  // 4. Closing round (parallel)
  const closings = await Promise.all(
    config.personaIds.map(id => generateClosing(id, config.topic, debateContext))
  )
  for (const msg of closings) yield { type: 'message_posted', message: msg }

  // 5. Shift detection (compare opening vs closing positions)
  yield { type: 'debate_complete', shifts: detectShifts(openings, closings) }
}
```

**Token budget:**

| Phase | Messages | Tokens (input) | Model |
|-------|----------|----------------|-------|
| Topic decomposition | 1 call | ~500 | Haiku |
| Opening round | 4 parallel | 4 × 2,700 = 10,800 | Haiku |
| Themed round (take) | 4 parallel × 3 rounds | 12 × 3,200 = 38,400 | Haiku |
| Themed round (clash) | ~3 msgs × 3 rounds | 9 × 3,500 = 31,500 | Haiku |
| Crux room (~8 turns) | ~2 rooms × 8 turns | 16 × 4,000 = 64,000 | Sonnet |
| Closing round | 4 parallel | 4 × 3,200 = 12,800 | Haiku |
| Detection + exit checks | ~15 calls | 15 × 800 = 12,000 | Haiku |
| Card extraction | ~2 calls | 2 × 2,500 = 5,000 | Sonnet |
| **Total** | | **~175,000 tokens** | |

Comparable to current system (~180,000 tokens for a 50-message dialogue + crux rooms). But with guaranteed topic coverage.

---

## 4. Improved Crux Room

**Rewrite `crux/orchestrator.ts`.**

Key changes:
- Phase-specific prompts (position → exchange → convergence) instead of generic "argue back"
- Belief graph nodes included in context
- Last 4-6 exchanges instead of full history in each turn
- Separate summary of established positions
- Original debate topic included: "This room is about [crux], in the context of [original topic]"
- Do NOT assign stances — agents argue from genuine belief (per "Premise Left Unsaid" finding)

**Crux room turn budget:**

```
System prompt: 2,200 tokens (consolidated)
User message:
  - "Crux room about: [question]" — 30 tokens
  - "In the wider debate about: [original topic]" — 30 tokens
  - "So far: [position summary]" — 100 tokens
  - "Last 4 exchanges:" — 400-600 tokens
  - Phase-specific instruction — 50 tokens
  - Relevant belief graph nodes — 150-200 tokens
Total input: ~3,000-3,200 tokens (down from 4,050-5,500)
Output: 250 tokens
Model: Sonnet, Temperature: 0.7-0.8
```

---

## 5. Better Disagreement Detection

**Option A: Majority vote** (recommended)

Run Haiku detection 3 times on the same parallel takes. Spawn if ≥ 2/3 agree.

```typescript
async function detectDisagreementReliable(takes: Message[]): Promise<Disagreement | null> {
  const results = await Promise.all([
    detectDisagreement(takes),
    detectDisagreement(takes),
    detectDisagreement(takes),
  ])
  const positives = results.filter(r => r.hasDisagreement)
  if (positives.length >= 2) {
    return positives[0] // Use first positive detection
  }
  return null
}
```

Cost: 3× Haiku calls instead of 1×. ~$0.003 per detection instead of ~$0.001. Negligible.

**Option B: Boolean decomposition**

Replace `confidence: float` with structured booleans:

```json
{
  "has_direct_opposition": true,
  "has_repeated_engagement": true,
  "same_specific_claim": true,
  "topic_relevant_to_debate": true
}
```

Spawn when all four are true. No unreliable confidence float.

**Both options should include topic relevance check.** Add to the detection prompt: "Is this disagreement relevant to the wider debate topic: '[original topic]'? Ignore tangential disputes."

---

## 6. Tiered Debate History

```typescript
interface DebateContext {
  // Stable across the debate
  originalTopic: string
  aspects: string[]
  personaIds: string[]

  // Updated after each round
  roundSummaries: { aspect: string; summary: string }[]
  contestedClaims: { claim: string; personas: [string, string]; status: 'unresolved' | 'resolved' }[]
  cruxCards: CruxCard[]

  // Current round only (replaced each round)
  currentRoundMessages: Message[]
}
```

Each agent receives:

```
Debate on: {originalTopic}
Current round: {current aspect}

What's been established:
{roundSummaries — 1-2 sentences per previous round}

Open disagreements:
{contestedClaims — bullet list}

Crux cards so far:
{compact card summaries}

This round:
{current round messages — verbatim}
```

Total context: ~1,500-2,000 tokens regardless of debate length.

---

## What I Disagree With

### "Agents think before they respond — creating reasoning traces"

Two-stage generation (internal trace → visible response) is conceptually right but has a practical cost: 2 LLM calls per turn instead of 1. For dialogue turns (Haiku, cheap), this doubles latency from ~500ms to ~1s. For crux room turns (Sonnet), it goes from ~2s to ~4s.

**My recommendation:** Do the two-stage generation ONLY in crux rooms, where reasoning quality matters most. Dialogue turns can use single-stage with belief graph nodes in context — cheaper, nearly as good. The belief graph already grounds the response without needing an explicit reasoning trace.

### "PRISM persona-agnostic — replace random seeds with persona-specific epistemic seeds?"

Yes, this is the right adaptation. But for MVP, a simpler version works: instead of PRISM's full Mapping/Blending/Inversion operator pipeline, just retrieve the 3-5 most relevant belief graph nodes + their grounding corpus chunks and include them in context. This achieves 80% of the benefit at 20% of the complexity. Full PRISM-style operators are Phase 2.

### "Maybe at a later version, crux cards can be posted back to the debate"

I'd push this to Phase 2 but with a caveat: if crux cards are re-injected, they should be treated as EVIDENCE, not as truth. A crux card says "Saylor and Vitalik disagree on X because of Y" — it doesn't say who's right. Re-injecting it should prompt further debate, not closure.

### "Cool hexagon graph of persona alignment"

No research supports hexagonal layouts for this. Use a force-directed claim graph: nodes = claims, edges = support/attack, color = persona. This is honest (shows actual structure from crux cards) and visually clear. D3.js force layout handles it well. Alternatively, a simple persona × crux matrix (each cell = agree/disagree/nuanced) is even more informative and easier to parse.

### "I'm scared about prompt injection"

You should be. The current system sends 4,400 tokens to generate 200 tokens. That's a 22:1 ratio at temperature 1.0. The fix is:
1. Consolidate to ~2,700 tokens total input (2,200 system + 500 user)
2. Drop temperature to 0.8-0.9 for dialogue, 0.7-0.8 for crux rooms
3. Move structural decisions (when to steelman, when to clash) into orchestrator code, not prompts
4. The model just responds to what's in front of it — it doesn't need to know the room has phases

---

## Open Questions

1. **Belief graph × debate topic interaction.** The corpus is deck-scoped (e.g., "crypto"). The belief graph is implicitly topic-scoped. But what if two personas from the same deck debate a sub-topic not well-covered by the corpus? The graph would be sparse. Need to handle gracefully (fall back to contract-only prompting when belief graph has no relevant nodes).

2. **Parallel response UX.** How to display 4 simultaneous responses in the UI? Side-by-side cards? Tabbed view? Stacked panels? This is a frontend design question that needs to be resolved before the panel format is built.

3. **When to skip a themed round.** If all 4 agents agree on an aspect (no disagreement detected), skip the clash step and move on. Don't waste tokens on consensus.

4. **Crux room spawning threshold in panel format.** With parallel takes, disagreements are more obvious than in sequential chat. May need to raise the spawning threshold to avoid over-spawning.

5. **How many aspects?** Topic decomposition should produce 3-4 aspects. Fewer = incomplete coverage. More = debate drags. Could let the user choose or let the decomposition LLM decide based on topic complexity.

---

## Sources

### Papers Referenced
- GenMinds — arXiv:2506.06958 (MIT Media Lab, ICML 2025)
- PRISM — arXiv:2602.21317 (Feb 2026)
- Premise Left Unsaid — ACL ArgMining 2025
- Prompt Baking — arXiv:2409.13697
- TagPR — arXiv:2509.23140
- PRIME — arXiv:2507.04607 (EMNLP 2025)
- R-Debater — arXiv:2512.24684
- CharLoRA — arXiv:2502.12988 (ACL Findings 2025)
- DMAD — ICLR 2025
- DeGroot belief update — Chuang et al., NAACL 2024
- Temperature + Persona — arXiv:2507.11198
- LLM Confidence calibration — Harvard Data Science Review, Winter 2025
- Persona drift — arXiv:2412.00804, arXiv:2402.10962
- FREE-MAD anti-conformity — arXiv:2509.11035
- DEBATE benchmark — arXiv:2510.25110
- Debate or Vote — arXiv:2508.17536 (NeurIPS 2025)

### Key Findings Not in Previous Docs
- **GenMinds has no code repository** (confirmed Feb 2026)
- **AGM belief revision has never been implemented for LLM agents**
- **Prompt baking requires weight access** (incompatible with Claude API)
- **Self-verbalized confidence is the worst calibration method** — use majority vote or boolean decomposition
- **Temperature 1.0 is too high for persona consistency** — research recommends ≤ 0.5 for reasoning tasks, 0.7-0.9 for dialogue
- **Assigning stances in debate rooms degrades performance** (Premise Left Unsaid)
- **~1,000 tokens per dialogue turn are wasted on redundant prompt injection** in current system
