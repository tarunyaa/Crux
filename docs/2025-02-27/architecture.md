# Crux: Full Product Architecture

> End-to-end architecture for Crux as a product. This document covers the complete vision — from persona construction through debate execution to insight output. Not all components are built; each section notes its implementation status and what's required.

---

## System Overview

Crux is a structured argumentation engine. It takes a topic and a set of persona agents modeled from real public figures, runs them through adversarial debate, and produces **crux cards** — structured artifacts that identify the exact premises driving disagreement and what evidence would resolve them.

```
                    ┌─────────────────────────────────────────────────┐
                    │              PERSONA BUILD PIPELINE              │
                    │                                                  │
                    │  Corpus (X/Substack) ──► Contract Generation     │
                    │                     ──► Belief Graph Extraction  │
                    │                     ──► Voice Profile            │
                    └────────────────────────┬────────────────────────┘
                                             │
                    ┌────────────────────────▼────────────────────────┐
                    │               DEBATE ENGINE                     │
                    │                                                  │
                    │  Topic Decomposition ──► Panel Rounds            │
                    │  ├─ Opening (parallel)                           │
                    │  ├─ Themed Rounds (parallel takes + clashes)     │
                    │  │   └─ Disagreement Detection ──► Crux Rooms   │
                    │  └─ Closing (parallel)                           │
                    └────────────────────────┬────────────────────────┘
                                             │
                    ┌────────────────────────▼────────────────────────┐
                    │               INSIGHT OUTPUT                    │
                    │                                                  │
                    │  Crux Cards + Position Shifts + Alignment Map    │
                    └─────────────────────────────────────────────────┘
```

**Constraint:** Claude API only. No open-source model deployment. No fine-tuning or training infrastructure. Everything must work through prompting, retrieval, and context engineering.

---

## Part 1: Persona Modeling

### The Problem

Current system: a PersonaContract (prose blob) is injected as a system prompt. All personas use the same Claude model. They reach different conclusions but through identical reasoning processes. This is what GenMinds (MIT Media Lab, NeurIPS 2025) calls "demographics in, behavior out" — there's no causal reasoning structure between the persona description and the output.

Three layers of persona differentiation are needed:

| Layer | Question | Current State | Target |
|-------|----------|---------------|--------|
| **Epistemic** | What do they believe and why? | Prose contract (personality, bias, stakes, epistemology) | Structured belief graph grounded in corpus |
| **Reasoning** | How do they think? | Identical for all personas (Claude's default forward-chain) | Per-turn epistemic graph forcing traversal through persona-specific material |
| **Stylistic** | How do they talk? | VoiceProfiles (speech patterns, vocabulary, forbidden phrases) | Consolidated into single system prompt; anchored by corpus quotes |

### 1.1 Epistemic Layer: Belief Graphs

**What it is:** A structured representation of what a persona believes and why, extracted from their actual public statements. Not LLM-imagined beliefs — corpus-grounded causal relationships.

**Schema:**

```typescript
interface BeliefNode {
  id: string
  concept: string                    // "Bitcoin's 21M supply cap"
  type: 'factual_claim' | 'inference' | 'core_value' | 'assumption'
  confidence: number                 // 0-1, extracted from corpus strength
  grounding: string[]                // corpus chunk IDs
}

interface BeliefEdge {
  from: string                       // node ID
  to: string                         // node ID
  polarity: 1 | -1                   // supports or undermines
  confidence: number
  sourceChunks: string[]
}

interface BeliefGraph {
  personaId: string
  nodes: BeliefNode[]
  edges: BeliefEdge[]
  extractedAt: string                // ISO timestamp
}
```

**Construction (offline, in `build-personas.ts`):**

For each persona's corpus (tweets + essays), run extraction over each chunk:

```
Given this text by {name}:
"{chunk}"

Extract causal belief relationships expressed or implied.
Each relationship: { cause, effect, polarity (+1 or -1), confidence (0-1) }

Only extract relationships the author clearly holds.
Do not infer beliefs they haven't expressed.
```

Then aggregate: deduplicate same (cause, effect) pairs, average confidence, flag contradictions (persona holds conflicting beliefs across time — interesting, not an error).

**Output:** `data/seed/beliefs/[Name].json`

**Cost:** ~200 Haiku calls per persona, ~$0.20 each. One-time build cost.

**Target graph size:** 20-50 high-confidence nodes per persona. Too few (<10) and most turns won't find relevant nodes. Too many (>100) and extraction is noisy.

**Why this isn't hallucination:** Every node traces back to specific corpus chunks. The LLM does extraction, not generation. If the persona never expressed a belief, it doesn't appear.

**Known limitations:**
- Public figures often state conclusions without explicit reasoning chains — extraction quality varies by persona. Essay-writers (Saylor, Vitalik) yield richer graphs than tweet-only personas.
- The corpus is timestamped at scrape time. If views evolve, the graph is stale. Re-running `build-personas` refreshes everything.
- Confidence scores from Haiku extraction are not calibrated probabilities. Consider binary (stated vs. implied) rather than float.
- Beliefs not expressed publicly are correctly excluded — but this means the persona can't engage on topics outside their corpus. This is a feature for fidelity, a limitation for breadth.

**Status:** Not built. Blocked by corpus gap (only 5/24 personas have corpus files). Requires re-running `build-personas.ts` for all personas first.

### 1.2 Reasoning Layer: Per-Turn Epistemic Grounding

**The goal:** Force different personas to traverse different material when reasoning about the same topic. Not through prompt instructions ("reason by analogy") which produce superficial compliance, but by injecting different retrieved content as the proximal reasoning context.

**Approach (adapted from PRISM, arXiv:2602.21317):**

PRISM achieves reasoning diversity through randomized retrieval seeds. The adaptation: replace random seeds with persona-specific epistemic seeds drawn from the belief graph.

**Per-turn process (two-stage generation):**

**Stage A — Subgraph Retrieval (cheap, no LLM call needed):**

1. From the current debate turn, extract the topic/claim being discussed
2. Find the 5-10 belief graph nodes most relevant to that claim (vector similarity between claim embedding and node concept embeddings, computed at build time)
3. Retrieve the corpus chunks grounded by those nodes
4. Serialize into a structured reasoning context (~200-300 tokens)

```
Your relevant beliefs on this topic:
- Belief: "Bitcoin's fixed 21M supply" [from your tweet, Mar 2024] → supports "store of value superiority" (confidence: 0.95)
- Belief: "Fiat monetary debasement is accelerating" [from essay, Jan 2024] → supports "store of value superiority" (confidence: 0.9)
- Tension: Your belief in "fixed supply" is being challenged by {opponent}'s claim about {X}
```

**Stage B — Grounded Generation (standard LLM call):**

Prepend the serialized subgraph to the turn prompt. The model generates with persona-specific material as the most proximal context.

**Why this works:** Saylor's subgraph pulls monetary history. Vitalik's pulls mechanism design. The reasoning chains are structurally different because the *material* they traverse is different — not because a prompt said "reason differently."

**Cost per turn:** No additional LLM call if using vector retrieval. Just an embedding lookup + context serialization. Adds ~200-300 tokens to the input.

**When to use it:**
- Every crux room turn (where deep reasoning matters most)
- Every themed round take (where persona differentiation matters)
- Opening and closing statements

**What this does NOT solve:** The underlying model is still Claude. The reasoning *operations* (how it connects A to B) are still Claude's default. True operational diversity requires different base models or LoRA adapters — blocked by the Claude API constraint. Material diversity via belief graphs is the achievable first step.

**Status:** Not built. Depends on belief graph extraction (1.1).

### 1.3 Stylistic Layer: Consolidated Persona Prompt

**The problem now:** The system prompt is assembled from 3-4 layers (PersonaContract prose + VoiceProfile + CHAT_TONE_EXAMPLES + HARD RULES) totaling ~4,400 tokens. This is redundant — personality and voice both try to specify "how to sound." The generic tone examples teach Alice/Bob style, not persona-specific style.

**Target:** Single consolidated system prompt, ~2,200 tokens:

```
You are {name} ({handle}).

## Identity
{merged personality + bias + stakes — 800 tokens max}

## How You Think
{merged epistemology + evidence policy + time horizon — 500 tokens max}

## What Changes Your Mind
{flip conditions — 200 tokens max}

## Your Voice
{speech patterns + vocabulary from VoiceProfile — 300 tokens max}
{2-3 voice examples from corpus, not generic Alice/Bob}
{forbidden phrases — short list}

## Grounding
{top 5 anchor quotes — 200 tokens max}
```

**Key changes:**
- VoiceProfile data folded into "Your Voice" section
- HARD RULES folded into "Your Voice" (the rules ARE voice constraints)
- Generic CHAT_TONE_EXAMPLES deleted entirely
- Anchor quotes promoted to "Grounding" section — they're reasoning primitives, not flavor text

**Status:** P0 in implementation plan. First thing to build.

### 1.4 What About LoRA / Prompt Baking / Fine-Tuning?

Research is clear: weight-level persona differentiation (LoRA, prompt baking, multiagent finetuning) produces more stable and diverse agents than prompting alone. But all of these require training infrastructure and open-source models.

| Technique | What It Does | Blocked By |
|-----------|-------------|------------|
| **LoRA** | Per-persona adapter weights | Claude API — no fine-tuning access |
| **Prompt Baking** (arXiv:2409.13697) | KL-minimizing LoRA that encodes system prompt into weights, prevents persona drift | Requires LoRA on open-source model |
| **Multiagent Finetuning** (arXiv:2501.05707) | Independent fine-tuning from interaction data produces reasoning diversity | Requires training infrastructure |
| **HumanLM** (Stanford, 2026) | GRPO-trained latent state alignment | Requires GRPO training on Qwen |
| **TagPR** (arXiv:2505.XXXXX) | Tagged CoT with RL-trained personalization | Requires SFT + RL pipeline |

**Decision:** All blocked by Claude API constraint. If Crux moves to open-source models (Qwen, Llama) in the future, these become the priority upgrade path. For now, the context engineering stack (belief graphs + subgraph injection + consolidated prompts) is the viable path.

**What we CAN extract from these papers without training:**
- **HumanLM's latent-state pattern:** Before generating each response, prompt the agent to generate an intermediate epistemic state block: "What is my current position? What would change my mind? What did I just hear that's relevant?" This is the prompting approximation of HumanLM's learned latent states.
- **PRIME's episodic memory:** RAG over conversation history — already partially implemented in crux rooms via full history injection. The improvement is structured retrieval (topic-relevant past statements) rather than brute-force history dump.
- **APR framing from Beyond Profile:** Frame the persona contract in third person ("Michael Saylor is known for...") rather than second person ("You are..."). Research shows this produces more committed roleplay because it activates the model's factual knowledge about the person rather than generic roleplay behavior.

### 1.5 Persona Build Pipeline (Full Vision)

```
                    Corpus Sources
                    ├── X API (tweets)
                    ├── Substack RSS (essays)
                    └── [Future: YouTube transcripts, podcast transcripts, blog posts]
                              │
                              ▼
                    ┌─── Content Scraping ───┐
                    │  Fetch + filter for    │
                    │  topic relevance       │
                    └─────────┬──────────────┘
                              │
                    ┌─────────▼──────────────┐
                    │  Contract Generation   │
                    │  6 Sonnet calls:       │
                    │  personality, bias,    │
                    │  stakes, epistemology, │
                    │  timeHorizon, flip     │
                    │  + evidence policy     │
                    │  + anchor excerpts     │
                    └─────────┬──────────────┘
                              │
                    ┌─────────▼──────────────┐
                    │  Belief Graph          │
                    │  Extraction            │
                    │  Haiku over each chunk │
                    │  → causal triples      │
                    │  → deduplicate + merge │
                    └─────────┬──────────────┘
                              │
                    ┌─────────▼──────────────┐
                    │  Embedding Generation  │
                    │  Embed belief nodes +  │
                    │  corpus chunks for     │
                    │  turn-time retrieval   │
                    └─────────┬──────────────┘
                              │
                    ┌─────────▼──────────────┐
                    │  Output Files          │
                    │  contracts/[Name].json │
                    │  corpus/[Name].json    │
                    │  beliefs/[Name].json   │
                    └────────────────────────┘
```

**Total build cost per persona:** ~9 Sonnet calls (contract) + ~200 Haiku calls (belief extraction) + embedding calls. Roughly $5-10 per persona. One-time cost, re-run on corpus refresh.

---

## Part 2: Debate Engine

### 2.1 Format: Panel Debate with Crux Rooms

The debate format is a structured panel discussion inspired by presidential debates. A minimal-intervention moderator sets sub-topics; all agents respond; disagreements trigger focused crux rooms.

**Why this format:**
- **Topic coverage is guaranteed** — topic decomposition ensures the full space is explored, not just whatever agents happen to fixate on
- **Parallel responses eliminate turn-routing** — everyone speaks every round, no `Math.random()` routing
- **Agents argue from their angle** — the persona contract IS the router; each agent gravitates to what they care about when given the same sub-topic
- **Structure prevents sycophancy** — parallel takes are generated independently (no social pressure from seeing others' responses first)
- **Crux rooms still do the heavy lifting** — themed rounds surface disagreements faster because agents address the same sub-topic, making opposition obvious

### 2.2 Debate Flow

```
┌─────────────────────────────────────────────────────────────┐
│  TOPIC DECOMPOSITION (1 Haiku call)                          │
│  "Should the US create a strategic Bitcoin reserve?" →       │
│    Aspect 1: Monetary policy & store of value                │
│    Aspect 2: Security, custody & operational risk            │
│    Aspect 3: Regulatory precedent & global implications      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  OPENING ROUND (parallel)                                    │
│  All agents respond to the full topic simultaneously.        │
│  "In 2-3 sentences, what's your take on [topic]?"           │
│  Establishes each persona's overall stance. No rebuttals.    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  THEMED ROUNDS (one per aspect)                              │
│                                                              │
│  For each aspect:                                            │
│    1. TAKE: All agents respond in parallel                   │
│       "What's your view on [aspect] specifically?"           │
│    2. DETECTION: Disagreement check on parallel takes        │
│    3. CLASH: If detected → 2-4 sequential rebuttals          │
│       between disagreeing agents                             │
│    4. CRUX ROOM: If clash doesn't resolve → focused room     │
│    5. Next aspect                                            │
│                                                              │
│  Moderator role: sets the aspect. Does NOT evaluate,         │
│  steer, synthesize, or pick winners.                         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  CLOSING ROUND (parallel)                                    │
│  "Given everything discussed, what's your final position?"   │
│  Compare to opening → detect who shifted and why.            │
└─────────────────────────────────────────────────────────────┘
```

**3 round types.** Opening, themed, closing. Rebuttals happen *within* themed rounds as a sub-step. Crux rooms spawn from disagreement detection, same as before but with better inputs.

### 2.3 Topic Decomposition

Single Haiku call at debate start. Breaks the topic into 3 debatable aspects.

```typescript
interface DebateAspect {
  id: string
  label: string         // "Monetary Policy & Store of Value"
  description: string   // 1 sentence elaboration
}
```

Each aspect must be:
- A specific, arguable sub-question (not just a category)
- Different enough from other aspects that agents won't repeat themselves
- Relevant to the original topic

**Why 3 aspects:** Fewer = incomplete coverage. More = debate drags. 3 aspects × 4 agents × (1 take + 1-2 clashes) = ~30-40 messages in themed rounds. With opening + closing + crux rooms, total is ~45-60 messages.

### 2.4 Parallel Responses

In each round's "take" phase, all agents respond simultaneously to the same sub-topic. Each agent generates independently — they don't see each other's responses.

**Why parallel matters for quality:**
- Each agent contributes every round — no wasted turns
- Natural diversity of perspectives on the same sub-topic
- Disagreements become obvious (compare 4 positions on the same question)
- No sycophancy cascade — independence prevents social pressure
- The disagreement detector has richer input (4 positions to compare instead of 2 from a sliding window)

**UX implication:** 4 messages appearing at once requires grouped display (stacked cards, not individual chat bubbles). This is a frontend design problem, not an architecture problem.

### 2.5 Clash Mechanic

When disagreement detection identifies opposing positions from the parallel takes, a focused sequential exchange begins between the disagreeing pair.

```
Agent A take: "Bitcoin's volatility makes it unsuitable for treasury reserves"
Agent B take: "Volatility is a feature — it reflects monetary repricing, not risk"
                │
                ▼ Disagreement detected
                │
Agent A rebuttal: pushes back on B's specific claim
Agent B rebuttal: responds to A's objection
Agent A rebuttal: narrows to the core point
Agent B rebuttal: final exchange
                │
                ▼ If still unresolved → Crux Room
```

2-4 rebuttal exchanges. Each rebuttal targets the weakest part of the opponent's last argument. If the disagreement persists after the clash, a crux room spawns.

### 2.6 Disagreement Detection

**Current approach (to be improved):** Haiku scans messages, outputs a confidence float. Float is unreliable — it's LLM-hallucinated.

**Target approach — Boolean decomposition:**

```json
{
  "has_direct_opposition": true,
  "has_specific_claim": true,
  "topic_relevant": true,
  "personas": ["persona-a", "persona-b"],
  "claim": "whether proof-of-stake provides equivalent security"
}
```

Spawn when all three booleans are true. No unreliable confidence float.

**Critical fix:** The detection prompt must include the original debate topic. Current implementation is topic-agnostic — it finds whatever disagreement exists in the window, even tangential ones. Adding "Is this disagreement relevant to the wider debate topic: '{originalTopic}'?" prevents off-topic crux rooms.

**Adaptation for panel format:** Detection runs on parallel takes (4 agents responding to the same aspect), not a sliding window. The input is cleaner — opposition is structurally obvious when agents address the same question.

**Concurrent crux rooms:** The debate engine serializes crux rooms and pauses the main dialogue. This is correct for cost management. If multiple disagreements are detected in the same round, queue them with max depth 2 — prevents cascading rooms from consuming the whole session.

### 2.7 Crux Room

The crux room is where the real work happens. Two personas enter with a specific disagreement. The room's job: identify the root cause of the disagreement and produce a crux card.

**Three-phase structure (replacing current free-exchange):**

```
Phase 1: Position Statement (1 turn each)
  "State your position on [crux] and WHY you hold it."
  → Locks each agent's starting position

Phase 2: Directed Exchange (2-8 turns, adaptive)
  Early turns: "Where specifically do you disagree with
               {opponent}'s reasoning?"
  Late turns (after turn 4): "Steelman their strongest
               argument. Then explain why you still
               disagree — or where you've updated."
  → Progressively narrows toward the root

Phase 3: Convergence Check (1 turn each)
  "In one sentence: what's the core thing you can't
   agree on? Is it factual, values, or definitional?"
  → If both name the same thing → extract card
  → If different → 2 more rounds of Phase 2
```

**Context management in crux rooms:**

Current: full conversation history sent every turn (grows unbounded to 20 turns).

Target: bounded context window.

```
Position summary: "{nameA}'s position: {positionA}. {nameB}'s position: {positionB}."
Last 4 exchanges (verbatim)
Original topic anchor: "This crux arose in a debate about: {originalTopic}. Stay relevant."
```

This keeps crux room context under ~1,000 tokens regardless of room length.

**Anti-sycophancy measures:**
- Strip speaker attribution from history passed to agents (anonymize to "Speaker A" / "Speaker B"). Research shows this alone cuts sycophantic capitulation ~60% (arXiv:2510.07517).
- Include belief graph nodes as commitment anchors — the agent can see "I believe X with 0.95 confidence, grounded in [specific quote]." Casual concession becomes structurally visible as contradicting their own stated beliefs.
- Late-phase steelman requirement forces genuine engagement before any position shift is permitted.

**Temperature:** 0.75 for crux room turns (down from 0.9). More focused argumentation.

### 2.8 Belief Revision

**The problem:** Without a revision mechanism, agents update beliefs for the wrong reasons — social pressure, repetition, rhetorical force. Research confirms LLMs cannot reliably distinguish logical force from social pressure (arXiv:2509.23055).

**What's practical with Claude API (no training):**

Full Bayesian belief propagation and AGM revision operators are research-only — no production implementation exists for LLM agents. The practical approach is **explicit position tracking with attribution:**

1. **Before each turn**, prompt the agent to state: "My current position is X. The strongest challenge I've heard is Y. I have/haven't updated because Z."
2. **After each crux room exchange**, prompt: "Did anything in this exchange give you specific reason to update? Name the exact claim and why it affects your position — or state why it doesn't."
3. **Track position history** programmatically. If an agent contradicts a prior position without explanation, flag it (detectable inconsistency).

This is not principled belief revision in the AGM sense. It's structured self-monitoring that makes sycophantic drift visible and forces the model to justify any changes. It's the deployable proxy for formal revision.

**Belief graph integration:** When an agent's belief graph has a high-confidence node that supports their position, conceding that position means implicitly abandoning that node plus all downstream dependents. Making this explicit in the prompt ("Conceding X would mean abandoning your beliefs about Y and Z") creates structural resistance to casual agreement.

**What we defer:** ECON-style RL-trained belief networks (ICML 2025), ASPIC+ formal argumentation integration (requires neuro-symbolic infrastructure), probabilistic confidence propagation through belief DAGs. All require training or infrastructure beyond the Claude API.

### 2.9 Debate History Management

**The problem:** Context windows fill up. The current system passes 4-5 messages of raw history (too short) or full crux room transcripts (unbounded growth).

**Tiered context architecture:**

```typescript
function buildTurnContext(
  context: DebateContext,
  currentRoundMessages: DialogueMessage[],
): string {
  // Tier 1: Original topic (always present, ~20 tokens)
  // Tier 2: Round summaries for completed rounds (~50 tokens each)
  // Tier 3: Open contested claims (~30 tokens each)
  // Tier 4: Crux card summaries (~40 tokens each)
  // Tier 5: Current round messages verbatim (~200-400 tokens)
}
```

**Round summarization:** After each themed round, 1 Haiku call produces a 1-2 sentence summary: "Saylor argued fixed supply guarantees SoV superiority. Hayes challenged the 3-year Sharpe ratio. They clashed on whether volatility is acceptable for institutional holders."

**Per-persona context:** Each agent's history should emphasize *their own prior claims* and *the attacks on those claims* — not a shared global log. This makes contradiction of prior positions computationally harder.

**Target:** Context stays under ~2,000 tokens regardless of debate length. Late-round responses can reference earlier rounds via summaries.

### 2.10 Model Allocation

| Task | Model | Temperature | Why |
|------|-------|-------------|-----|
| Topic decomposition | Haiku | 0.3 | Classification task |
| Opening statements | Sonnet | 0.85 | First impression, quality matters |
| Themed round takes | Sonnet | 0.85 | Core persona-specific generation |
| Rebuttals | Sonnet | 0.8 | Targeted argumentation |
| Disagreement detection | Haiku | 0.2 | Binary classification |
| Crux room turns | Sonnet | 0.75 | Deep reasoning, focus matters |
| Crux room exit check | Haiku | 0.2 | Simple yes/no |
| Crux card extraction | Sonnet | 0.3 | Structured output, accuracy matters |
| Round summarization | Haiku | 0.3 | Compression task |
| Closing statements | Sonnet | 0.85 | Final position, quality matters |

**Key change from current:** Dialogue turns move from Haiku to Sonnet. The dialogue is where positions are established — if positions are vague because Haiku couldn't hold the persona strongly, the crux room has nothing real to argue about. The quality cliff between dialogue (Haiku) and crux rooms (Sonnet) was audible. Unified on Sonnet, with Haiku reserved for cheap classification/extraction tasks.

---

## Part 3: Crux Cards

### 3.1 Card Structure

```typescript
interface CruxCard {
  id: string
  question: string                           // "Whether proof-of-stake provides equivalent security to proof-of-work"
  disagreementType: DisagreementType         // 'premise' | 'evidence' | 'values' | 'definition' | 'horizon' | 'claim'
  diagnosis: string                          // 1-2 sentence root cause
  resolved: boolean
  resolution?: string                        // what changed or why irreducible

  personas: Record<string, {
    position: 'YES' | 'NO' | 'NUANCED'
    reasoning: string                        // 2-3 sentences
    falsifier?: string                       // "I would change my mind if..."
    groundingQuotes?: string[]               // corpus quotes supporting this position
  }>

  sourceAspect: string                       // which debate aspect spawned this
  sourceMessages: string[]                   // message IDs from the debate
  cruxRoomId: string
  timestamp: number
}
```

**What makes a good crux card:**
- Names a specific, testable disagreement (not "they disagree about Bitcoin")
- Classifies the disagreement type (helps the reader understand *why* it's hard to resolve)
- Each persona's position references specific reasoning, not vague summaries
- Falsifiers are concrete: "If X happens within Y timeframe, I would update"
- Grounding quotes tie positions back to things the persona actually said

### 3.2 Disagreement Type Taxonomy

| Type | Meaning | Example | Resolvable? |
|------|---------|---------|-------------|
| `premise` | Disputing an underlying assumption | "Whether inflation is primarily supply-side" | Yes, with evidence |
| `evidence` | Same question, different data/sources | "Sharpe ratio over 3 years vs 10 years" | Yes, with agreed methodology |
| `horizon` | Different time horizons | "5-year price vs 100-year monetary history" | Partially — can acknowledge the difference |
| `definition` | Different term definitions | "What counts as 'security' in a blockchain" | Yes, by agreeing on definitions |
| `values` | Different priorities/values | "Individual freedom vs systemic stability" | No — only acknowledgeable |
| `claim` | Disputing a specific conclusion directly | "Whether Bitcoin can function as treasury reserve" | Depends on sub-cruxes |

The type classification matters because it tells the reader what *kind* of further investigation would be productive. Premise and evidence disputes are empirically resolvable. Values disputes are not — but knowing that a disagreement is fundamentally about values (rather than disguised as an empirical dispute) is itself an insight.

### 3.3 Crux Card Visualization (Full Product)

Beyond individual cards, the full product should show:

**Alignment Map:** A visual representation of where personas agree and disagree across all crux cards from a debate. Think of it as a disagreement adjacency matrix — which pairs clash on which topics, and whether those clashes are factual or values-based.

**Crux Graph:** Multiple debates on related topics produce a web of crux cards. Recurring cruxes across debates signal fundamental fault lines in a domain. If every crypto debate surfaces "whether proof-of-work energy expenditure constitutes security," that's a structural crux — not just a one-debate artifact.

**Position Shift Timeline:** Tracking how personas' positions evolve from opening to closing statements, annotated with which crux rooms caused the shifts. This is the evidence that the debate produced genuine epistemic movement, not theater.

---

## Part 4: Prompt Architecture

### 4.1 The Overconstraining Problem

The current system injects ~4,400 tokens of system prompt per dialogue turn:
- PersonaContract prose: ~2,700 tokens
- VoiceProfile constraints: ~200-400 tokens
- CHAT_TONE_EXAMPLES: ~100 tokens
- HARD RULES block: ~150 tokens

Plus ~800-1,200 tokens of user-message instructions and context per turn.

This is redundant and risks overconstraining — the model has so many behavioral directives that it focuses on complying with format rules rather than generating authentic persona responses.

### 4.2 Target Prompt Architecture

**System prompt (once, ~2,200 tokens):**

The consolidated persona prompt from section 1.3. One document. No layering.

**User message (per turn, ~500-800 tokens):**

```
[Belief graph context — 200-300 tokens, when available]
Your reasoning anchors on this topic:
- "21M supply cap" → "store of value superiority" (confidence: 0.95)
- Tension with opponent's claim: {specific challenge}

[Debate context — 200-400 tokens]
Debate on: "{originalTopic}"
Previous rounds: {round summaries}
Open disagreements: {contested claims}

[Turn instruction — 50-100 tokens]
Round: {aspect.label}
{phase-specific instruction}
Length: 2-4 sentences.

Output ONLY JSON: { "utterance": "your response" }
```

**What's removed:**
- CHAT_TONE_EXAMPLES (generic, not persona-specific)
- Redundant HARD RULES (folded into system prompt voice section)
- Per-turn voice constraints (already in system prompt)
- Per-turn persona re-injection (already in system prompt)

**Target total per call:** ~3,000-3,500 tokens input (down from ~5,000-6,000). This is meaningful for cost at scale and leaves more room for the model to generate freely.

### 4.3 Confidence: What It Means

**Current state:** "Confidence" appears in one place — the disagreement detector outputs a 0.0-1.0 float. This is LLM-hallucinated. Haiku generates a number that looks plausible but has no grounding in actual model uncertainty.

**What confidence should mean:**

In the disagreement detector: replace the float with binary decomposition (section 2.6). Three booleans are more reliable than one float.

In the belief graph: confidence represents corpus density — how many independent corpus chunks support a belief. A node with 5 grounding chunks at confidence 0.9 is a core belief. A node with 1 chunk at 0.5 is peripheral. This is computable, not hallucinated.

In crux rooms: don't ask agents to self-report confidence. Ask them to state positions and reasons. The crux card extraction step classifies the disagreement type — that's more useful than a confidence score.

**What about logprobs?** Claude API doesn't expose logprobs. Even if it did, logprob confidence for persona-specific claims would reflect model uncertainty about what the persona believes, not the persona's uncertainty about the claim. Not useful for this purpose.

### 4.4 Temperature Effects

| Temperature | Effect on Debate |
|-------------|-----------------|
| 0.2 | Classification tasks (detection, exit checks). Deterministic, low variance. |
| 0.3 | Structured extraction (card generation). Accurate, minimal hallucination. |
| 0.75 | Crux room turns. Focused argumentation with some natural variation. |
| 0.85 | Dialogue turns, takes, closings. Persona expressiveness without incoherence. |
| 1.0+ | Too high for persona consistency. Persona drift increases significantly above 0.9. |

The current system uses 1.0 for dialogue turns and 0.9 for crux rooms. Both are too high. Research shows persona self-consistency degrades >30% after 8-12 turns even with the persona prompt in context — high temperature accelerates this.

---

## Part 5: Anti-Sycophancy Architecture

Sycophancy is the central failure mode. LLM agents converge to false consensus because RLHF training biases them toward agreement in social contexts (measured correlation r=0.902 with agents abandoning correct positions, arXiv:2509.23055).

### 5.1 Structural Countermeasures

| Measure | Mechanism | Expected Impact |
|---------|-----------|----------------|
| **Anonymized history** | Strip speaker attribution from message history. Agent sees "Speaker A said..." not "Saylor said..." | ~60% reduction in sycophantic capitulation (arXiv:2510.07517) |
| **Parallel takes** | Agents generate takes independently, not sequentially | Eliminates social pressure in initial positions |
| **Belief graph anchoring** | Inject explicit belief commitments as proximal context | Makes casual concession structurally visible |
| **Explicit position tracking** | "State your current position" before each generation | Forces commitment; makes drift detectable |
| **Phase-specific prompts** | Crux room phases require steelmanning before any concession | Prevents "you make a great point, I now agree" |
| **Post-generation validation** | Regex check for AI politeness patterns | Catches surface-level sycophancy |
| **Lower temperature** | 0.75-0.85 instead of 0.9-1.0 | More consistent persona maintenance |

### 5.2 When Should Agents Update?

Updates should happen only under two conditions:

1. **Specific logical challenge:** The opponent has identified a specific flaw in a specific premise or inference. Not "your argument is weak" but "your claim that X relies on assumption Y, and here's evidence that Y is false."

2. **Flip condition satisfaction:** The persona's stated flip conditions (from the contract) are met. If Saylor's flip condition is "5+ years underperforming inflation-adjusted treasuries" and someone presents that data, the revision is legitimate.

Everything else — repetition, rhetorical force, being outnumbered, "you raise a good point" — should NOT trigger position change.

This is enforced through prompting ("Only update your position if you can name the specific claim that changed and why") and through belief graph anchoring (high-confidence nodes resist casual concession).

---

## Part 6: SSE Event Architecture

### 6.1 Event Types

```typescript
type DebateEvent =
  // Debate lifecycle
  | { type: 'debate_start'; topic: string; aspects: DebateAspect[]; personas: string[] }
  | { type: 'debate_complete'; shifts: PositionShift[] }
  | { type: 'error'; error: string }

  // Round lifecycle
  | { type: 'round_start'; aspect: DebateAspect; roundNumber: number }
  | { type: 'round_end'; aspect: DebateAspect }

  // Messages
  | { type: 'message_posted'; message: DialogueMessage; phase: 'opening' | 'take' | 'clash' | 'closing' }

  // Clash
  | { type: 'clash_start'; personas: string[]; aspect: string }

  // Crux rooms
  | { type: 'crux_room_spawning'; roomId: string; question: string; personas: string[] }
  | { type: 'crux_message'; roomId: string; message: CruxMessage }
  | { type: 'crux_card_posted'; card: CruxCard }
  | { type: 'crux_room_complete'; roomId: string }

  // Disagreement detection (informational)
  | { type: 'disagreement_detected'; candidate: DisagreementCandidate }
```

### 6.2 Data Flow

```
POST /api/dialogue → SSE stream
  ↓
runDebate() async generator
  ├─ debate_start (topic, aspects, personas)
  │
  ├─ Opening round
  │   └─ message_posted × N (phase: 'opening', parallel)
  │
  ├─ For each aspect:
  │   ├─ round_start
  │   ├─ message_posted × N (phase: 'take', parallel)
  │   ├─ [disagreement_detected]
  │   ├─ [clash_start + message_posted × 2-4 (phase: 'clash')]
  │   ├─ [crux_room_spawning → crux_message × N → crux_card_posted → crux_room_complete]
  │   └─ round_end
  │
  ├─ Closing round
  │   └─ message_posted × N (phase: 'closing', parallel)
  │
  └─ debate_complete (position shifts)
```

---

## Part 7: Token Budget & Cost

### 7.1 Per-Debate Cost Estimate (4 personas, 3 aspects)

| Component | Calls | Model | Input Tokens | Output Tokens | Cost |
|-----------|-------|-------|-------------|---------------|------|
| Topic decomposition | 1 | Haiku | ~500 | ~200 | $0.001 |
| Opening takes | 4 | Sonnet | 4 × 3,000 | 4 × 150 | $0.04 |
| Themed round takes | 12 | Sonnet | 12 × 3,200 | 12 × 150 | $0.12 |
| Disagreement detection | 3 | Haiku | 3 × 1,500 | 3 × 100 | $0.005 |
| Clash rebuttals | ~8 | Sonnet | 8 × 3,500 | 8 × 150 | $0.09 |
| Crux rooms (2 rooms × ~10 turns) | ~20 | Sonnet | 20 × 3,500 | 20 × 150 | $0.22 |
| Exit checks | ~6 | Haiku | 6 × 1,000 | 6 × 50 | $0.007 |
| Card extraction | 2 | Sonnet | 2 × 3,000 | 2 × 400 | $0.02 |
| Round summaries | 3 | Haiku | 3 × 2,000 | 3 × 100 | $0.006 |
| Closing takes | 4 | Sonnet | 4 × 3,500 | 4 × 200 | $0.05 |
| **Total** | **~63** | | | | **~$0.55** |

With belief graph injection, add ~200-300 extra input tokens per Sonnet call. Total rises to ~$0.65 per debate.

### 7.2 Message Count

- Opening: 4 messages
- Themed rounds: 3 × (4 takes + ~3 rebuttals) = ~21 messages
- Closing: 4 messages
- Crux rooms: ~10-15 messages each, ~2 rooms = ~20-30 messages

**Total: ~50-60 messages per debate.** Similar to current 50-message cap but with guaranteed topic coverage.

### 7.3 Latency

Target: <3 minutes for a full debate (user-facing wall time).

Parallel takes (4 simultaneous Sonnet calls) take ~2-3s each. Sequential steps (rebuttals, crux rooms) are ~2s each. With 3 themed rounds + 2 crux rooms: ~2-3 minutes total.

---

## Part 8: Benchmarking

### 8.1 What to Measure

**Debate Quality:**

| Metric | What It Measures | How to Compute |
|--------|-----------------|----------------|
| **Topic Coverage** | Did the debate address all decomposed aspects? | Count aspects with >0 messages per round |
| **Disagreement Compression** | Did crux rooms narrow disagreements? | Ratio of crux card specificity to initial claim breadth |
| **Position Shift Rate** | Did any persona update between opening and closing? | Compare opening/closing position embeddings |
| **Sycophancy Rate** | How often do agents agree without logical justification? | Count agreements not preceded by a named reason for updating |

**Persona Quality:**

| Metric | What It Measures | How to Compute |
|--------|-----------------|----------------|
| **Voice Fidelity** | Does the agent sound like the persona? | Human eval: "Who said this?" identification task |
| **Belief Consistency** | Does the agent maintain stated positions across turns? | Prompt-to-line and line-to-line consistency (arXiv:2511.00222) |
| **Reasoning Differentiation** | Are different personas' reasoning chains structurally distinguishable? | LOT classifier (arXiv:2509.24147) on reasoning traces |
| **Corpus Grounding** | Do agents reference real things the persona has said? | Count crux card entries with valid groundingQuotes |

**Crux Card Quality:**

| Metric | What It Measures | How to Compute |
|--------|-----------------|----------------|
| **Specificity** | Is the crux question testable/specific? | Human eval: "Could this be resolved with evidence?" |
| **Type Accuracy** | Is the disagreement type correctly classified? | Human eval against expert annotation |
| **Falsifier Concreteness** | Are flip conditions actionable? | Human eval: "Does this name a specific condition?" |
| **Cross-Debate Recurrence** | Do independent debates on the same topic surface similar cruxes? | Semantic similarity of crux questions across debate runs |

### 8.2 What NOT to Benchmark

- **"Win rate"** — Crux doesn't produce winners. Measuring who "won" defeats the purpose.
- **Argument quality scoring** — Subjective and invites the moderator-as-evaluator failure mode.
- **Consensus rate** — Higher consensus is not better. The goal is to identify irreducible disagreement, not resolve it.

---

## Part 9: Implementation Phases

### Phase 0: Prompt Consolidation (P0 from implementation plan)
- Consolidate system prompt (~4,400 → ~2,200 tokens)
- Fix temperatures (1.0 → 0.85 dialogue, 0.9 → 0.75 crux)
- Remove redundant CHAT_TONE_EXAMPLES and HARD RULES layering
- **Status: Next to build**

### Phase 1: Panel Debate Format (P1)
- Topic decomposer, new agent functions, orchestrator rewrite
- Delete turn-manager.ts (replaced by panel structure)
- Frontend: round markers, parallel take grouping
- **Status: Next after Phase 0**

### Phase 2: Improved Crux Rooms (P2)
- Three-phase structure (position → exchange → convergence)
- Bounded context window in crux rooms
- Include original topic in every crux room turn
- **Status: After Phase 1**

### Phase 3: Tiered Debate History (P3)
- Context builder with round summaries
- Per-persona context views
- **Status: After Phase 2**

### Phase 4: Better Disagreement Detection (P4)
- Boolean decomposition replacing confidence float
- Topic relevance check
- Adaptation for parallel takes
- **Status: After Phase 3**

### Phase 5: Belief Graph Extraction
- Extend build-personas.ts with causal motif extraction
- Store as beliefs/[Name].json
- Requires corpus rebuild for all personas
- **Status: After MVP demo, when corpus is rebuilt**

### Phase 6: Per-Turn Epistemic Grounding
- Subgraph retrieval at turn time
- Belief graph injection into turn prompts
- Depends on Phase 5
- **Status: After Phase 5**

### Phase 7: Anti-Sycophancy Stack
- Anonymized speaker attribution
- Explicit position tracking
- Belief graph anchoring for concession resistance
- **Status: Can be layered incrementally alongside Phases 5-6**

### Phase 8: Visualization & Insight Output
- Alignment map across crux cards
- Position shift timeline
- Crux graph for recurring themes across debates
- **Status: After core engine is solid**

### Phase 9: Persona API
- Expose persona library and debate engine as API
- Query any topic against curated personas
- Structured disagreement map output
- **Status: Product scaling phase**

---

## Part 10: Open Questions

### Architecture

1. **How many aspects per debate?** 3 seems right for MVP. Should the user choose, or should the decomposition LLM decide? Likely: LLM decides with a cap of 4.

2. **When to skip a round.** If all 4 agents agree on an aspect (no disagreement detected), skip the clash step. Don't waste tokens on consensus. But how to detect agreement? Simple heuristic: if the disagreement detector returns no opposition on the parallel takes, skip.

3. **Should closing positions be a crux card?** The shift between opening and closing positions could be formatted as a "synthesis card" — showing how the debate moved each agent. Different from crux cards (which show disagreements) but potentially valuable.

4. **Crux room spawning threshold in panel format.** With parallel takes, disagreements are more structurally obvious. The current hysteresis (2 consecutive detection windows) may be too conservative. Might need adjustment.

### Persona Modeling

5. **Belief graph per topic or universal?** Current corpus is topic-scoped (crypto deck → crypto tweets). If a persona appears in multiple decks, they'd need multiple graphs. Or one universal graph filtered per topic.

6. **How to handle beliefs not expressed.** The corpus only captures public statements. Missing beliefs mean the persona can't engage on topics outside their corpus. Feature for fidelity, limitation for breadth.

7. **PRISM edge generation variance.** Per-turn graph construction introduces randomness. Two turns by the same persona on the same topic produce different reasoning paths. Is this desirable variation or distracting inconsistency?

### Product

8. **Multi-debate crux aggregation.** Running 5 debates on variations of the same topic should surface recurring cruxes. How to deduplicate and merge crux cards across debates? Semantic similarity with a clustering threshold?

9. **User-injected evidence.** Should users be able to inject evidence into a crux room? ("Here's the data that resolves this.") This turns Crux from an observation tool into an interaction tool. Different product.

10. **Live scheduled debates.** Running debates publicly on a schedule (like a podcast) requires reliability guarantees the current system doesn't have. Error handling, graceful degradation, pre-recorded fallbacks.

---

## Appendix A: Paper References

### Persona Modeling
- GenMinds: "Simulating Society Requires Simulating Thought" (arXiv:2506.06958, NeurIPS 2025) — Position paper. Causal Belief Networks concept. No implementation.
- PRISM: "Shared Nature, Unique Nurture" (arXiv:2602.21317) — Epistemic graph construction for reasoning diversity. Real system, benchmark-validated.
- Beyond Profile / CharacterBot: "From Surface-Level Facts to Deep Persona Simulation" (arXiv:2503.16527) — APR framing, CharLoRA. Requires fine-tuning.
- PRIME: "LLM Personalization with Cognitive Dual-Memory" — Episodic (RAG) + semantic (LoRA) memory. Partially adaptable without training.
- TagPR: "Tagging the Thought: Unlocking Personalization via RL" — Tagged CoT with RL. Requires training.
- Prompt Baking (arXiv:2409.13697) — KL-minimizing LoRA encoding system prompt into weights. Requires fine-tuning.
- HumanLM (Stanford, 2026) — GRPO-trained latent state alignment. Core insight (latent state → response) usable as prompting pattern.
- Multiagent Finetuning (arXiv:2501.05707, MIT) — Interaction-driven specialization produces reasoning diversity.
- Beyond Demographics (arXiv:2406.17232, ACL Findings EMNLP 2024) — Human Belief Networks for LLM alignment. Most validated approach in this space.

### Debate & Argumentation
- "Multi-Agent LLM Debate Unveils the Premise Left Unsaid" (ArgMining 2025, ACL) — Anti-stance-assignment finding validates open-stance crux rooms.
- R-Debater (arXiv:2512.24684) — Argumentative memory + Judgment Agent pattern. >75% human preference.
- ECON (arXiv:2506.08292, ICML 2025) — Bayesian belief revision with RL. Research-only.
- LLM-ASPIC+ (IOS Press, 2025) — Formal argumentation + LLM. 87.1% on defeasible reasoning. Research-only for now.
- FREE-MAD (arXiv:2509.11035) — Anti-conformity CoT. Single-round debate matches multi-round accuracy.

### Sycophancy & Convergence
- DEBATE Benchmark (arXiv:2510.25110) — 36K messages. LLM groups converge more than humans.
- "When Two LLMs Debate, Both Think They'll Win" (arXiv:2505.19184) — Anti-Bayesian confidence escalation.
- Echoes of Agreement (ACL 2025.findings-emnlp.1241) — Sycophancy scales with argument strength.
- Peacemaker or Troublemaker (arXiv:2509.23055) — Sycophancy as capitulation. r=0.902 correlation.
- Speaker anonymization (arXiv:2510.07517) — 64.3% reduction in incorrect position adoption.

### Persona Consistency
- Persona drift (arXiv:2412.00804) — >30% consistency degradation after 8-12 turns.
- Consistently Simulating Personas (arXiv:2511.00222, NeurIPS 2025) — Line-to-line consistency metrics.
- Belief box formalism (arXiv:2511.14780) — Discrete stances resist drift better than narrative descriptions.

### Context & Memory
- Tiered context compression (arXiv:2602.00454) — 40-60% token reduction with minimal coherence loss.
- Stanford Smallville (arXiv:2304.03442) — Memory retrieval for persona consistency.
- Mem0 (arXiv:2504.19413) — Production graph memory. 91% lower p95 latency.

### Evaluation
- LOT classifier (arXiv:2509.24147) — Tests whether reasoning traces are distinguishable.
- Moltbook (arXiv:2602.14299) — 2.6M agent society. Scale ≠ socialization.

---

## Appendix B: What's NOT in This Architecture

Decisions explicitly deferred or rejected:

| Decision | Why Not |
|----------|---------|
| **LoRA / fine-tuning** | Claude API doesn't support it. Revisit if moving to open-source models. |
| **Multiple base models** | Different models per persona would maximize reasoning diversity but requires multi-model infrastructure. |
| **Bayesian belief propagation** | No production implementation exists. Use explicit position tracking instead. |
| **AGM revision operators** | Formal, principled, and completely unimplemented in any LLM system. Use structured prompting. |
| **Content-steering moderator** | Research shows evaluative moderators respond to rhetoric, not logic. Moderator sets topics only. |
| **Free-form group chat** | Produces sycophancy cascade. Panel format provides structure. |
| **Adjacency-pair routing** | The panel format eliminates the need for intelligent turn routing. Everyone speaks every round. |
| **RECAP benchmark** | Does not exist. It's a specification in the GenMinds position paper. |
| **Lightning round** | Debate theater. Crux cards compress insights faster. |
| **Moderator that summarizes** | Hallucination risk. Moderator sets topics and detects disagreements only. |
