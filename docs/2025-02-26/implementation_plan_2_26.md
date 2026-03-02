# Implementation Plan: February 26, 2026

**Goal:** YC demo — a followable debate with quality insights.

**Constraint:** Claude API only. No open-source model deployment. No training.

---

## Priority Order (for Demo Impact)

| Priority | Item | Why | Effort |
|----------|------|-----|--------|
| **P0** | Consolidated system prompt + temperature | Immediate quality uplift. Zero architectural change. Every response gets better. | 2-3 hrs |
| **P1** | Panel debate format | Makes the debate followable. Topic coverage guaranteed. This IS the demo. | 8-12 hrs |
| **P2** | Improved crux room flow | Produces the insights. Phase-specific prompts → better crux cards. | 4-6 hrs |
| **P3** | Tiered debate history | Prevents context degradation mid-debate. Keeps late-round responses coherent. | 3-4 hrs |
| **P4** | Better disagreement detection | Reduces false positive crux rooms. Boolean decomposition is simple. | 2-3 hrs |
| **P5** | Belief graph extraction | Cool, but blocked by corpus gap (only 5/24 personas have corpus files). Skip for initial demo; add when corpus is rebuilt. | 6-8 hrs |

**Total estimated effort for P0-P4:** ~20-28 hours of implementation.

**P5 is deferred.** It requires re-running `build-personas.ts` for all 24 personas first (~$2 API cost, but needs X API tokens and Substack scraping to work). The demo can be great without it — the panel format + crux room improvements are the visible wins.

---

## P0: Consolidated System Prompt + Temperature Fix

**Files to modify:**
- `lib/personas/loader.ts` — rewrite `buildSystemPrompt()`
- `lib/dialogue/agent.ts` — remove layered prompt concatenation, fix temperature
- `lib/dialogue/prompts.ts` — move HARD RULES + examples into system prompt
- `lib/dialogue/speech-roles.ts` — merge into consolidated prompt builder
- `lib/crux/orchestrator.ts` — fix crux room temperature

**What changes:**

### Step 1: New `buildConsolidatedPrompt()` in `loader.ts`

Replace the current `buildSystemPrompt()` + `buildVoiceConstraints()` + `CHAT_TONE_EXAMPLES` + HARD RULES stack (~4,400 tokens) with a single function (~2,200 tokens):

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
{2-3 voice examples}
{forbidden phrases — short list}

## Grounding
{top 5 anchor quotes — 200 tokens max}
```

The VoiceProfile data from `speech-roles.ts` gets folded into this. The HARD RULES from `prompts.ts` get folded into "Your Voice." The generic `CHAT_TONE_EXAMPLES` gets deleted entirely.

### Step 2: Simplify `agent.ts`

```typescript
// Before (4 layers):
const systemPrompt = `${buildSystemPrompt(contract, persona)}${buildVoiceConstraints(persona.name)}\n\n${CHAT_TONE_EXAMPLES}`

// After (1 layer):
const systemPrompt = buildConsolidatedPrompt(contract, persona)
```

### Step 3: Temperature fixes

| Call | Current | New |
|------|---------|-----|
| Dialogue turns (`agent.ts`) | 1.0 | 0.85 |
| Crux room turns (`crux/orchestrator.ts`) | 0.9 | 0.75 |
| Opening statements | 1.0 | 0.85 |

### Step 4: Clean up `prompts.ts`

Remove HARD RULES block and Good examples from `microTurnPrompt()`. The user message becomes pure context:

```
Group chat.

Recent thread:
{history}

{replyContext}

Your move: {intentInstruction}
Length: {lengthGuide}

Output ONLY JSON:
{ "utterance": "your response" }
```

~120 tokens user message instead of ~500.

### Verification

Run a test debate before/after. Check:
- Total input tokens per turn (target: ~2,700 down from ~4,400)
- Responses sound persona-specific (not generic)
- No AI politeness patterns leaking through

---

## P1: Panel Debate Format

**Files to create/modify:**
- `lib/dialogue/orchestrator.ts` — full rewrite
- `lib/dialogue/types.ts` — new types for rounds, aspects, debate context
- `lib/dialogue/agent.ts` — new functions: `generateTake()`, `generateRebuttal()`, `generateClosing()`
- `lib/dialogue/prompts.ts` — new prompts for each round type
- `lib/dialogue/turn-manager.ts` — delete (no longer needed; panel format replaces round-robin)
- `lib/dialogue/topic-decomposer.ts` — new file: 1 Haiku call to break topic into aspects
- `app/api/dialogue/route.ts` — update event types
- `lib/hooks/useDialogueStream.ts` — handle new SSE events
- `components/dialogue/DialogueView.tsx` — round markers, parallel response grouping
- `components/dialogue/ThreeColumnLayout.tsx` — round headers, parallel take cards

### Step 1: Types (`lib/dialogue/types.ts`)

Add:

```typescript
interface DebateAspect {
  id: string
  label: string       // "Mental Health & Addiction"
  description: string  // 1 sentence elaboration
}

interface DebateRound {
  aspect: DebateAspect
  takes: DialogueMessage[]     // parallel responses
  clashMessages: DialogueMessage[]  // sequential rebuttals
  cruxCards: CruxCard[]
}

interface DebateContext {
  originalTopic: string
  aspects: DebateAspect[]
  rounds: DebateRound[]
  contestedClaims: ContestedClaim[]
  cruxCards: CruxCard[]
}

interface ContestedClaim {
  claim: string
  personas: [string, string]
  status: 'unresolved' | 'resolved'
  source: 'detection' | 'crux_card'
}
```

New SSE event types:

```typescript
type DialogueEvent =
  | { type: 'debate_start'; topic: string; aspects: DebateAspect[]; personas: string[] }
  | { type: 'round_start'; aspect: DebateAspect; roundNumber: number }
  | { type: 'message_posted'; message: DialogueMessage; phase: 'opening' | 'take' | 'clash' | 'closing' }
  | { type: 'clash_start'; personas: string[]; aspect: string }
  | { type: 'round_end'; aspect: DebateAspect }
  | { type: 'crux_room_spawning'; ... }
  | { type: 'crux_message'; ... }
  | { type: 'crux_card_posted'; ... }
  | { type: 'debate_complete'; shifts: PositionShift[] }
  | { type: 'error'; error: string }
```

### Step 2: Topic Decomposer (`lib/dialogue/topic-decomposer.ts`)

New file. Single function, 1 Haiku call:

```typescript
export async function decomposeTopicIntoAspects(
  topic: string,
  count: number = 3,
): Promise<DebateAspect[]>
```

Prompt:

```
Break this debate topic into {count} distinct debatable aspects.

Topic: "{topic}"

Each aspect should be:
- A specific, arguable sub-question (not just a category)
- Different enough from other aspects that agents won't repeat themselves
- Relevant to the topic

Output JSON array:
[{ "id": "aspect-1", "label": "short label", "description": "one sentence" }]
```

### Step 3: New Agent Functions (`lib/dialogue/agent.ts`)

Add alongside existing functions:

```typescript
// Parallel take — each agent responds to a themed aspect
export async function generateTake(
  contract: PersonaContract,
  persona: Persona,
  aspect: DebateAspect,
  debateContext: DebateContext,
): Promise<string | null>

// Sequential rebuttal — respond to specific disagreeing agent
export async function generateRebuttal(
  contract: PersonaContract,
  persona: Persona,
  targetMessage: DialogueMessage,
  targetName: string,
  debateContext: DebateContext,
): Promise<string | null>

// Closing statement — final position after full debate
export async function generateClosing(
  contract: PersonaContract,
  persona: Persona,
  debateContext: DebateContext,
): Promise<string | null>
```

Each uses the consolidated system prompt from P0. User message varies by function.

**Take prompt (~200 tokens):**

```
Round: {aspect.label}
{aspect.description}

What's been established so far:
{roundSummaries}

Open disagreements:
{contestedClaims}

What's your specific view on this aspect? Argue from YOUR angle — don't just respond to others.

Length: 2-4 sentences.

Output ONLY JSON:
{ "utterance": "your take" }
```

**Rebuttal prompt (~200 tokens):**

```
Round: {aspect.label}

{targetName} said: "{targetMessage.content}"

You disagree. Push back specifically on the weakest part of their argument.

Length: 2-3 sentences.

Output ONLY JSON:
{ "utterance": "your rebuttal" }
```

**Closing prompt (~250 tokens):**

```
The debate on "{topic}" is concluding.

Rounds covered:
{roundSummaries}

Crux cards produced:
{cardSummaries}

What's your final position? If you've updated from your opening, say how. If not, say why.

Length: 3-5 sentences.

Output ONLY JSON:
{ "utterance": "your closing statement" }
```

### Step 4: Rewrite Orchestrator (`lib/dialogue/orchestrator.ts`)

Full rewrite. The new orchestrator:

```typescript
export async function* runDebate(
  config: DialogueConfig,
): AsyncGenerator<DialogueEvent> {
  // Load personas, contracts
  // ...

  // 1. Topic decomposition
  const aspects = await decomposeTopicIntoAspects(config.topic, 3)
  yield { type: 'debate_start', topic: config.topic, aspects, personas: personaIds }

  const context: DebateContext = {
    originalTopic: config.topic,
    aspects,
    rounds: [],
    contestedClaims: [],
    cruxCards: [],
  }

  // 2. Opening round (parallel)
  const openings = await Promise.all(
    personaIds.map(id => generateOpening(contracts.get(id)!, personas.get(id)!, config.topic))
  )
  for (const [i, content] of openings.entries()) {
    if (content) {
      const msg = makeMessage(personaIds[i], content)
      yield { type: 'message_posted', message: msg, phase: 'opening' }
    }
  }

  // 3. Themed rounds
  for (let r = 0; r < aspects.length; r++) {
    const aspect = aspects[r]
    yield { type: 'round_start', aspect, roundNumber: r + 1 }

    // 3a. Parallel takes
    const takes = await Promise.all(
      personaIds.map(id =>
        generateTake(contracts.get(id)!, personas.get(id)!, aspect, context)
      )
    )
    const takeMessages: DialogueMessage[] = []
    for (const [i, content] of takes.entries()) {
      if (content) {
        const msg = makeMessage(personaIds[i], content)
        takeMessages.push(msg)
        yield { type: 'message_posted', message: msg, phase: 'take' }
      }
    }

    // 3b. Disagreement detection on parallel takes
    const disagreement = await detectDisagreementFromTakes(takeMessages, personaNames, config.topic)

    // 3c. Sequential clash if disagreement detected
    let clashMessages: DialogueMessage[] = []
    if (disagreement) {
      yield { type: 'clash_start', personas: disagreement.personas, aspect: aspect.label }

      // 2-4 rebuttal exchanges between disagreeing agents
      for (let clash = 0; clash < 4; clash++) {
        const speakerId = disagreement.personas[clash % 2]
        const targetId = disagreement.personas[(clash + 1) % 2]
        const lastTarget = clashMessages.length > 0
          ? clashMessages[clashMessages.length - 1]
          : takeMessages.find(m => m.personaId === targetId)!

        const content = await generateRebuttal(
          contracts.get(speakerId)!, personas.get(speakerId)!,
          lastTarget, personaNames.get(targetId)!, context,
        )
        if (content) {
          const msg = makeMessage(speakerId, content)
          clashMessages.push(msg)
          yield { type: 'message_posted', message: msg, phase: 'clash' }
        }
      }

      // 3d. Crux room if clash doesn't resolve
      if (disagreement.spawnCruxRoom) {
        // ... spawn crux room (same pattern as current code)
        // yield crux events
        // push resulting card to context.cruxCards
      }
    }

    // Update context
    const roundSummary = await summarizeRound(aspect, takeMessages, clashMessages)
    context.rounds.push({ aspect, takes: takeMessages, clashMessages, cruxCards: [] })

    yield { type: 'round_end', aspect }
  }

  // 4. Closing round (parallel)
  const closings = await Promise.all(
    personaIds.map(id =>
      generateClosing(contracts.get(id)!, personas.get(id)!, context)
    )
  )
  for (const [i, content] of closings.entries()) {
    if (content) {
      const msg = makeMessage(personaIds[i], content)
      yield { type: 'message_posted', message: msg, phase: 'closing' }
    }
  }

  // 5. Shift detection
  const shifts = detectPositionShifts(openings, closings, personaIds)
  yield { type: 'debate_complete', shifts }
}
```

### Step 5: Delete `turn-manager.ts`

The panel format replaces round-robin turn assignment entirely. No more `Math.random()` intents. The orchestrator determines who speaks when based on the round structure.

### Step 6: Frontend Updates

**`useDialogueStream.ts`** — handle new event types:

```typescript
// New state fields:
interface DialogueStreamState {
  // existing...
  aspects: DebateAspect[]
  currentRound: number | null
  currentPhase: 'opening' | 'take' | 'clash' | 'closing' | null
  shifts: PositionShift[]
}
```

Handle `debate_start` (store aspects), `round_start` / `round_end` (track current round), `clash_start`, `debate_complete` (store shifts).

**`ThreeColumnLayout.tsx` / `MessageThread.tsx`** — visual changes:

- **Round markers:** Between messages, show a divider: "Round 1: Mental Health & Addiction"
- **Parallel take grouping:** When multiple `phase: 'take'` messages arrive for the same round, group them visually (stacked cards with a thin left border, not individual chat bubbles)
- **Clash indicator:** Show "Clash: Saylor vs Vitalik" before rebuttal messages
- **Closing section:** Visual separator before closing statements
- **Shift badges:** On closing messages, show "Position shifted" or "Held firm" based on shift detection

These are CSS/layout changes, not new components. Keep it minimal for the demo.

### Verification

Run a full debate. Check:
- Topic decomposes into 3 distinct aspects
- All 4 personas respond to each aspect (parallel)
- Disagreements trigger clashes between the right pairs
- Crux rooms spawn from real disagreements, not false positives
- Closing statements reference what happened in the debate
- Total messages: ~30-50 (not bloated)
- Total time: <3 minutes for a full debate

---

## P2: Improved Crux Room Flow

**Files to modify:**
- `lib/crux/orchestrator.ts` — rewrite with phase-specific prompts
- `lib/crux/prompts.ts` — new phase prompts (position, exchange, convergence)

**What changes:**

### Three-Phase Crux Room

Replace the current "free exchange until exit check" with structured phases:

```
Phase 1: Position Statement (1 turn each)
  "State your position on [crux] and WHY you hold it."

Phase 2: Directed Exchange (2-8 turns, adaptive)
  Early: "Where specifically do you disagree with {opponent}'s reasoning?"
  Late (after turn 4): "Steelman their strongest argument. Then explain
  why you still disagree — or where you've updated."

Phase 3: Convergence Check (1 turn each)
  "In one sentence: what's the core thing you can't agree on?
  Is it factual, values, or definitional?"
  → If both name the same thing → extract card
  → If different → 2 more rounds of Phase 2
```

### Context Window Fix

Current: full conversation history sent every turn (grows unbounded).
New: last 4 exchanges + position summary.

```typescript
// Current (unbounded):
const history = room.messages
  .filter(m => m.type === 'persona')
  .map(m => `${name}: ${m.content}`)
  .join('\n\n')

// New (bounded):
const recentExchanges = room.messages
  .filter(m => m.type === 'persona')
  .slice(-4)
  .map(m => `${name}: ${m.content}`)
  .join('\n\n')

const positionSummary = `${nameA}'s position: ${positionA}\n${nameB}'s position: ${positionB}`
```

### Include Original Topic

Every crux room turn includes: "This crux arose in a debate about: {originalTopic}. Stay relevant."

### Don't Assign Stances

Per "Premise Left Unsaid" finding: agents enter with their beliefs from the dialogue, not assigned pro/con roles. The current code already does this correctly — preserve it.

### Temperature

Crux room turns: 0.75 (down from 0.9). More focused argumentation.

### Verification

- Crux rooms produce cards that name the actual disagreement type (factual / values / definitional)
- Cards reference specific claims from the conversation, not vague summaries
- Rooms close in 6-12 turns, not hitting the 20-turn cap
- No sycophantic agreement ("you make a great point, I now agree")

---

## P3: Tiered Debate History

**Files to modify:**
- `lib/dialogue/orchestrator.ts` — build and maintain `DebateContext`
- `lib/dialogue/agent.ts` — use `DebateContext` in prompts instead of raw message slice
- New helper: `lib/dialogue/context-builder.ts`

### Context Builder

```typescript
export function buildTurnContext(
  context: DebateContext,
  currentRoundMessages: DialogueMessage[],
  personaNames: Map<string, string>,
): string {
  const parts: string[] = []

  // 1. Topic
  parts.push(`Debate on: "${context.originalTopic}"`)

  // 2. Round summaries (older rounds)
  if (context.rounds.length > 0) {
    parts.push('Previous rounds:')
    for (const round of context.rounds) {
      parts.push(`- ${round.aspect.label}: ${round.summary}`)
    }
  }

  // 3. Contested claims
  if (context.contestedClaims.length > 0) {
    parts.push('Open disagreements:')
    for (const claim of context.contestedClaims) {
      const names = claim.personas.map(p => personaNames.get(p) ?? p)
      parts.push(`- ${names.join(' vs ')}: ${claim.claim}`)
    }
  }

  // 4. Crux cards
  if (context.cruxCards.length > 0) {
    parts.push('Crux cards produced:')
    for (const card of context.cruxCards) {
      parts.push(`- ${card.question} [${card.disagreementType}] ${card.resolved ? '(resolved)' : '(unresolved)'}`)
    }
  }

  // 5. Current round (verbatim)
  if (currentRoundMessages.length > 0) {
    parts.push('This round:')
    for (const msg of currentRoundMessages) {
      parts.push(`${personaNames.get(msg.personaId) ?? msg.personaId}: "${msg.content}"`)
    }
  }

  return parts.join('\n\n')
}
```

### Round Summarization

After each themed round completes, 1 Haiku call to summarize:

```typescript
export async function summarizeRound(
  aspect: DebateAspect,
  takes: DialogueMessage[],
  clashMessages: DialogueMessage[],
  personaNames: Map<string, string>,
): Promise<string>
```

Prompt: "Summarize this round in 1-2 sentences. What positions were taken? What was contested?"

Output: "Saylor argued fixed supply guarantees SoV superiority. Hayes challenged the 3-year Sharpe ratio. They clashed on whether volatility is acceptable for institutional holders."

~50 tokens output per round. 1 Haiku call. Negligible cost.

### Verification

- Late-round responses reference earlier rounds ("as we discussed in the enforcement round...")
- Context stays under ~2,000 tokens regardless of debate length
- Contested claims list grows as disagreements are detected

---

## P4: Better Disagreement Detection

**Files to modify:**
- `lib/dialogue/disagreement-detector.ts` — boolean decomposition + topic relevance

### Boolean Decomposition (replacing confidence float)

Current output schema:

```json
{ "hasDisagreement": true, "confidence": 0.82, "personas": [...], "topic": "..." }
```

New output schema:

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

### Topic Relevance Check

Add to the detection prompt: "Is this disagreement relevant to the wider debate topic: '{originalTopic}'? Ignore tangential disputes."

This prevents crux rooms spawning for off-topic disagreements.

### Adaptation for Panel Format

In the panel format, disagreement detection runs on parallel takes (not a sliding window). The input is cleaner — 4 agents responding to the same aspect, making opposition obvious.

```typescript
export async function detectDisagreementFromTakes(
  takes: DialogueMessage[],
  personaNames: Map<string, string>,
  debateTopic: string,
): Promise<Disagreement | null>
```

### Verification

- No crux rooms spawn for tangential agreements
- Detection correctly identifies the disagreeing pair from parallel takes
- False positive rate drops (currently anecdotally high due to hallucinated confidence)

---

## P5: Belief Graph Extraction (Deferred)

**Blocked by:** Only 5/24 personas have corpus files. Need to re-run `build-personas.ts` for all personas first.

**When to do it:** After the demo, or if there's time to re-scrape personas before.

**Quick summary of what it requires:**
1. Add a step to `build-personas.ts` after contract generation
2. For each corpus chunk, Haiku extracts `(cause, effect, polarity, confidence)` triples
3. Deduplicate and write to `data/seed/beliefs/[Name].json`
4. Modify `loader.ts` to load belief graphs
5. Modify `agent.ts` to include relevant belief graph nodes in context
6. ~200 Haiku calls per persona, ~$0.20 each

**For the demo without belief graphs:** The consolidated prompt + panel format + improved crux rooms already produce dramatically better output. Belief graphs add epistemic differentiation on top of that — important long-term, not critical for the first demo.

---

## Implementation Sequence

```
Day 1: P0 (Consolidated prompt + temperature)
  Morning: Write buildConsolidatedPrompt(), merge VoiceProfile data
  Afternoon: Simplify agent.ts, fix temperatures, test a debate

Day 2: P1 Part 1 (Panel format backend)
  Morning: topic-decomposer.ts, new types, new agent functions
  Afternoon: Rewrite orchestrator.ts, delete turn-manager.ts

Day 3: P1 Part 2 (Panel format frontend + P2)
  Morning: Update useDialogueStream.ts, add round markers to UI
  Afternoon: Rewrite crux/orchestrator.ts with phase-specific prompts

Day 4: P3 + P4 + Polish
  Morning: context-builder.ts, round summarization
  Afternoon: Boolean decomposition for disagreement detection
  Evening: End-to-end test, fix edge cases, demo dry run
```

---

## Demo Script (YC Interview)

1. **Open the app.** Show the deck selection / persona cards briefly.
2. **Start a debate.** Pick a provocative topic ("Should the US create a strategic Bitcoin reserve?") with 4 personas (Saylor, Hayes, Armstrong, Vitalik).
3. **Topic decomposition appears.** "The system breaks the topic into 3 debatable aspects." Show: monetary policy, security/custody, regulatory precedent.
4. **Opening round.** 4 parallel takes appear. Point out: "Each persona argues from their actual angle — the economist talks markets, the builder talks adoption, the maximalist talks monetary history."
5. **Themed round plays out.** Parallel takes → clash between Saylor and Hayes on volatility → crux room spawns.
6. **Crux room.** Show the focused exchange. "The system detected a real disagreement and pulled them into a focused room to find the root cause."
7. **Crux card appears.** "This is the output — a crux card that identifies the exact disagreement, classifies it (factual vs values vs definitional), and captures what would change each person's mind."
8. **Closing round.** Show position shifts. "Hayes updated on X but held firm on Y."

**Key demo talking points:**
- "We don't moderate content — we moderate structure. The moderator picks what to discuss, not what to think."
- "Crux cards are the insight product. They tell you exactly where smart people disagree and why."
- "Every persona response is grounded in what that person actually says publicly. These aren't generic AI characters."

---

## What Could Go Wrong

| Risk | Mitigation |
|------|-----------|
| Topic decomposition produces bad aspects | Fallback: hardcode 3 good aspects for the demo topic. Fix the prompt after. |
| Parallel takes are too similar (personas agree on everything) | Pick a topic where personas genuinely disagree. The crypto deck is good for this. |
| Crux room doesn't converge | The 20-turn cap still exists. Phase-specific prompts should converge faster. For demo: if room drags, it's fine — the card extraction handles it. |
| Closing statements don't show shifts | Shift detection is a nice-to-have. If it fails, closing statements are still valuable as final positions. |
| Responses still sound AI-ish | Temperature fix + consolidated prompt should help. If not: tune the prompt, add more persona-specific examples. |
| SSE stream breaks mid-debate | Existing error handling catches this. For demo: have a pre-recorded fallback (run a debate beforehand, save the output). |

---

## Files Changed Summary

### New Files
- `lib/dialogue/topic-decomposer.ts` — topic → aspects
- `lib/dialogue/context-builder.ts` — tiered context assembly

### Rewritten Files
- `lib/dialogue/orchestrator.ts` — panel format
- `lib/crux/orchestrator.ts` — phase-specific crux rooms
- `lib/crux/prompts.ts` — new phase prompts

### Modified Files
- `lib/personas/loader.ts` — new `buildConsolidatedPrompt()`
- `lib/dialogue/agent.ts` — new functions, simplified prompt stack
- `lib/dialogue/prompts.ts` — simplified, HARD RULES removed
- `lib/dialogue/types.ts` — new types for panel format
- `lib/dialogue/disagreement-detector.ts` — boolean decomposition
- `lib/hooks/useDialogueStream.ts` — new event handling
- `components/dialogue/DialogueView.tsx` — round markers
- `components/dialogue/ThreeColumnLayout.tsx` — parallel take grouping
- `app/api/dialogue/route.ts` — pass-through (no logic change)

### Deleted Files
- `lib/dialogue/turn-manager.ts` — replaced by panel format
- `lib/dialogue/speech-roles.ts` — merged into `loader.ts` (or kept as data, exported differently)
