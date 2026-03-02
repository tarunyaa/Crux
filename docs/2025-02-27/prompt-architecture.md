# Prompt Architecture

Every LLM call in a single debate run, in execution order.

---

## Phase 0: Topic Decomposition

**Call 1 — `decomposeTopicIntoAspects()`** (`topic-decomposer.ts`)
```
system:  "You break debate topics into distinct debatable aspects."
user:    "Break this debate topic into 3 distinct debatable aspects..."
model:   haiku | temp: 0.3 | max: 300
```
No persona identity. Pure utility call. Turns "Is Bitcoin a good investment?" into 3 sub-questions.

---

## Phase 1: Opening Round

**Call 2 — `generateOpeningMicroTurn()`** (`agent.ts`, once per persona)
```
system:  buildConsolidatedPrompt(contract, persona)    ← ~2200 tokens
user:    'Someone just brought up: "{topic}" — React naturally...'
model:   sonnet | temp: 0.85 | max: 200
```
All persona-voiced calls go through `buildConsolidatedPrompt`, which merges:
- **Identity**: personality + bias + stakes (from `PersonaContract` JSON file)
- **How You Think**: epistemology + time horizon + evidence policy
- **What Changes Your Mind**: flip conditions
- **Your Voice**: chatStyleHint + speechPatterns + vocabulary + voiceExamples (from `VOICE_PROFILES` in `speech-roles.ts`)
- **Forbidden phrases**: persona-specific + universal AI patterns
- **Grounding**: top 5 anchor quotes from contract

Post-processing: `checkBanned()` strips AI-sounding prefixes from output.

---

## Phase 2: Aspect Rounds (×3 aspects, ×3 minirounds each)

**Call 3 — `generateTake()`** (`agent.ts`, once per persona per miniround)

Miniround 0 (initial take):
```
system:  buildConsolidatedPrompt(contract, persona)
user:    "Now discussing: {aspect.label}..."
         + buildTurnContext() output (previous rounds, open disagreements, crux cards)
         + opening statements (DO NOT repeat these)
model:   sonnet | temp: 0.85 | max: 250
```

Miniround 1+ (reactions):
```
system:  buildConsolidatedPrompt(contract, persona)
user:    "Topic: {aspect.label}..."
         + "Others just said: {filtered previous takes, excluding self}"
         + "Respond to whoever you have the most tension with..."
model:   sonnet | temp: 0.85 | max: 250
```

`buildTurnContext()` (`context-builder.ts`) is a pure string formatter — no LLM call. It assembles:
- Debate topic
- Previous round summaries
- Open disagreements
- Crux cards produced so far

**Call 4 — `generateReplyToReply()`** (`agent.ts`, miniround 2 only, when someone replied to you)
```
system:  buildConsolidatedPrompt(contract, persona)
user:    'You said: "{myOriginalTake}" — {name} replied: "{theirReply}" — Fire back...'
model:   sonnet | temp: 0.85 | max: 250
```

**Call 5 — `summarizeRound()`** (`context-builder.ts`, after each aspect's minirounds)
```
system:  "Summarize debate rounds concisely."
user:    'Summarize this round about "{aspectLabel}"... What positions? What was contested?'
model:   haiku | temp: 0.2 | max: 100
```
No persona identity. Feeds into `buildTurnContext()` for the next round.

**Call 6 — `detectDisagreementFromTakes()`** (`disagreement-detector.ts`, after each aspect's final miniround)
```
system:  "You detect substantive disagreements between parallel debate responses. Be conservative..."
user:    "These are parallel responses... Identify the strongest disagreement..."
         + formatted takes from final miniround
         + 3 boolean gates: has_direct_opposition, has_specific_claim, topic_relevant
model:   haiku | temp: 0.2 | max: 150
```
No persona identity. All 3 booleans must be true to spawn a crux room.

---

## Phase 3: Crux Room (if disagreement detected)

The crux room appends a mode overlay to the standard persona prompt:

```
system:  buildConsolidatedPrompt(contract, persona)  ← same ~2200 token prompt as dialogue
         + cruxRoomSystemPrompt(question, opponent)   ← appended (~150 tokens, crux mode rules)
```

Personas retain their full voice profile in crux rooms.

**Call 7 — Position statement** (`crux/orchestrator.ts:82`, once per persona)
```
system:  buildConsolidatedPrompt + cruxRoomSystemPrompt
user:    positionStatementPrompt(question)  →  "State your position on: {question}..."
model:   sonnet | temp: 0.75 | max: 200
```

**Call 8 — Exchange turns** (`crux/orchestrator.ts:150`, alternating, up to 14 turns)
```
system:  buildConsolidatedPrompt + cruxRoomSystemPrompt
user:    earlyExchangePrompt() (turns 0-3) → "Where SPECIFICALLY do you disagree..."
         OR lateExchangePrompt() (turns 4+) → "Steelman their strongest argument..."
         Both include: position summary + last 4 exchanges + opponent's last message
model:   sonnet | temp: 0.75 | max: 250
```

Context is **bounded** — only position summary + last 4 exchanges, not full history.

**Call 9 — Exit check** (`crux/orchestrator.ts:183`, every 2 turns after turn 3)
```
system:  "You analyze debate conversations to determine if the core disagreement has been surfaced."  ← INLINE
user:    cruxExitCheckPrompt(question, last6Messages)
model:   haiku | temp: 0.2 | max: 200
```

**Call 10 — Convergence check** (`crux/orchestrator.ts:224`, after exchange ends)
```
system:  "You analyze debate conversations to identify the core disagreement."  ← INLINE
user:    convergenceCheckPrompt(question, fullConversation)
model:   haiku | temp: 0.2 | max: 200
```

**Call 11 — Card extraction** (`crux/orchestrator.ts:262`)
```
system:  "You extract crux cards from debate transcripts. Be precise and faithful..."  ← INLINE
user:    cruxExtractionPrompt(question, fullConversation, personaIds, names)
model:   sonnet | temp: 0.3 | max: 600
```

---

## Phase 4: Closing + Summary

**Call 12 — `generateClosing()`** (`agent.ts`, once per persona)
```
system:  buildConsolidatedPrompt(contract, persona)
user:    'The debate on "{topic}" is concluding...' + buildTurnContext()
         "Address the key disagreements directly. Where do you still disagree and why?
          Where have you moved or found common ground? Name who and on what."
model:   sonnet | temp: 0.85 | max: 350
```

**Call 13 — `detectShifts()`** (`orchestrator.ts`, inline)
```
system:  "You detect position shifts in debate participants..."
user:    Opening vs closing statement pairs → "Did they shift?"
model:   haiku | temp: 0.2 | max: 300
```

**Call 14 — `summarizeDebate()`** (`summarizer.ts`)
```
system:  "You summarize debates by extracting ONLY what participants actually said..."
user:    Full transcript + crux cards → extract claims, agreements, evidence, flip conditions, open questions
model:   sonnet | temp: 0.2 | max: 1500
```

---

## System Prompt Stack

All persona-voiced LLM calls use the same base:

| Context | Builder | Used By |
|---|---|---|
| Dialogue (main chat) | `buildConsolidatedPrompt` | agent.ts (opening, take, reply, closing) |
| Crux room | `buildConsolidatedPrompt` + `cruxRoomSystemPrompt` | crux/orchestrator.ts |

The crux room appends a ~150 token mode overlay (combative tone, 2-3 sentence limit, push toward root cause).

## Temperature Tiers

| Tier | Temp | Purpose |
|---|---|---|
| Generation | 0.85 | Dialogue messages (opening, take, reply, closing) |
| Crux exchange | 0.75 | Crux room turns (slightly more constrained) |
| Analysis | 0.2-0.3 | Detection, summarization, extraction, topic decomposition |

## Inactive Code

**`detectDisagreements()`** in `disagreement-detector.ts` exists but is not called by the orchestrator. It was designed for a sequential sliding-window detection path using `CandidateRegistry` (requires same pair to disagree across 2 consecutive 10-message windows). Only the parallel-takes path (`detectDisagreementFromTakes`) is wired in.
