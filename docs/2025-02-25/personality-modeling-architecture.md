# Personality Modeling & Prompt Engineering Architecture

## 1. Persona Data Model

### Core Types (`faultline/lib/types/index.ts`)

**`Persona`** — The identity record for a debate participant:
```typescript
interface Persona {
  id: PersonaId          // e.g. "Michael Saylor"
  name: string           // Display name
  twitterHandle: string  // e.g. "@saylor"
  twitterPicture: string // CDN URL to profile image
  deckIds: DeckId[]      // Which decks this persona belongs to
  suite: string | null
  locked: boolean        // UI: whether this persona is selectable
}
```

**`Deck`** — A named group of personas with a shared thematic focus:
```typescript
interface Deck {
  id: DeckId
  name: string
  slug: string
  personaIds: PersonaId[]
  locked: boolean
  createdAt?: string
}
```

**`PersonaContract`** — The behavioral specification used to drive LLM roleplaying:
```typescript
interface PersonaContract {
  personaId: PersonaId
  version: string          // ISO timestamp of when the corpus was built
  personality: string      // 3-5 paragraph prose block
  bias: string             // 3-5 paragraph prose block
  stakes: string           // 3-5 paragraph prose block
  epistemology: string     // 3-5 paragraph prose block
  timeHorizon: string      // 3-5 paragraph prose block
  flipConditions: string   // 3-5 paragraph prose block
  evidencePolicy: EvidencePolicy
  anchorExcerpts: AnchorExcerpt[]
}

interface EvidencePolicy {
  acceptableSources: string[]
  unacceptableSources: string[]
  weightingRules: string       // 1-2 sentence prose
  toolPullTriggers: string     // 1-2 sentence prose
}

interface AnchorExcerpt {
  id: string
  content: string   // Actual quote (max ~280 chars)
  source: string    // URL or attribution
  date: string      // ISO date string
}
```

### File Layout (`faultline/data/seed/`)

```
data/seed/
  personas.json          — { decks: Deck[], personas: Persona[] }
  deck-config.json       — Build config (not read at runtime)
  contracts/[id].json    — PersonaContract per persona
  corpus/[id].json       — Raw scraped content (CorpusExcerpt[])
```

### Runtime Data Loading (`faultline/lib/personas/loader.ts`)

All persona data is loaded from files — not the database. A module-level cache avoids redundant disk reads after the first call.

**API:**
- `getDecks()` / `getDeck(idOrSlug)` — Deck lookups
- `getPersonas()` / `getPersona(id)` — Persona lookups
- `getPersonasForDeck(deckId)` — Personas for a specific deck
- `loadContract(personaId)` / `loadContracts(personaIds)` — Load PersonaContract(s) from JSON files

**`buildSystemPrompt(contract, persona)`** — Converts a PersonaContract into the full LLM system prompt:

```
You are roleplaying as {name} ({handle}).

## Personality
{contract.personality}

## Bias & Blind Spots
{contract.bias}

## Stakes & Incentives
{contract.stakes}

## Epistemology
{contract.epistemology}

## Time Horizon
{contract.timeHorizon}

## Flip Conditions
{contract.flipConditions}

## Evidence Policy
- Accept: {acceptableSources joined by ", "}
- Reject: {unacceptableSources joined by ", "}
- Weighting: {weightingRules}

## Anchor Quotes
> "{excerpt.content}"
> — {excerpt.source} ({excerpt.date})
[... repeated for all excerpts]

## Rules
- Stay in character. Argue as {name} would based on the above profile.
- Ground claims in your anchor quotes and evidence policy when possible.
- If evidence hits one of your flip conditions, acknowledge the shift.
- Be specific and testable — avoid vague hedging.
```

---

## 2. PersonaContract Examples

### Michael Saylor (Crypto deck)

| Field | Content Summary |
|---|---|
| **personality** | Grand historical analogies, civilizational narratives, serene conviction + evangelical urgency, repetitive framing as deliberate persuasion, "reductio" technique |
| **bias** | Absolute unfalsifiable conviction in Bitcoin as sole legitimate store of value, corporate identity fusion, energy/environment blind spots, cherry-picked hyperinflation examples |
| **stakes** | 190,000+ BTC on corporate balance sheet (~$31k avg cost), second-act identity after dot-com failure, speaker-circuit income |
| **epistemology** | Physics/thermodynamics first-principles, selective historical evidence, binary (not probabilistic) certainty, self-referential loop |
| **timeHorizon** | Civilizational/hundred-year framing, tension with real debt maturities, systematic discounting of near-term regulatory risk |
| **flipConditions** | Break in 21M cap, 51% attack, 5+ years underperforming inflation-adjusted treasuries, competing digital asset matching Lindy effect, cascade of corporate bankruptcies |
| **evidencePolicy** | Accepts: on-chain metrics, centuries-span history, physics analogies, MicroStrategy disclosures. Rejects: short-term TA, altcoin comparisons, environmental studies, Keynesian/MMT arguments |
| **anchorExcerpts** | "Cyber hornets" quote, "melting ice cube into digital energy", corporate treasury framing |

### Vitalik Buterin (Crypto deck) — Contrast

| Field | Content Summary |
|---|---|
| **personality** | Academic/proof-oriented, flat emotional register, genuine steel-manning, open-source values |
| **bias** | Mechanism design solutionism, Ethereum-architecture bias, decentralization-as-intrinsic-good, blind spot on financialization |
| **epistemology** | Formal logic, trilemma thinking, genuinely Bayesian with explicit uncertainty, overweights theoretical elegance |
| **timeHorizon** | 5-10 year tech maturity cycles, multi-generational, falsifiable roadmap milestones (Merge, Surge, etc.) |
| **flipConditions** | PoS empirically falsified, competitor breaks scalability trilemma, governance systematically failing, blockchain wrong foundation for coordination |

---

## 3. Prompt Engineering: Dialogue System

### 3.1 Three-Layer System Prompt

For every dialogue turn, the system prompt is assembled from three layers:

```
[Layer 1: PersonaContract]
  buildSystemPrompt(contract, persona)
  → Full personality/bias/stakes/epistemology/timeHorizon/flipConditions/evidencePolicy/anchorQuotes/rules

[Layer 2: Voice Constraints]
  buildVoiceConstraints(persona.name)
  → Chat style hint, speech patterns, vocabulary, forbidden phrases, voice examples

[Layer 3: Tone Calibration]
  CHAT_TONE_EXAMPLES
  → Generic example chat showing desired style
```

### 3.2 Voice Profiles (`faultline/lib/dialogue/speech-roles.ts`)

Six named personas have hand-crafted `VoiceProfile` objects. Others use a generic fallback.

| Persona | Chat Style Hint |
|---|---|
| Michael Saylor | "Speak in decades. Declarative. Never hedge. Dismiss quarterly noise." |
| Arthur Hayes | "Cynical trader. Challenge narratives with data. Show me the chart. Colorful, irreverent." |
| Brian Armstrong | "Builder mindset. Focus on adoption curves, not price. Show usage data." |
| Vitalik Buterin | "Precise. Challenge vague claims. Ask for definitions. Technical depth." |
| Elon Musk | "Contrarian. Provocateur. Challenge everything. Short. Meme-aware." |
| Chamath Palihapitiya | "Data-driven. Numbers first. Speak when you have a specific figure." |
| Generic fallback | "Be direct and specific. No hedging." |

Each profile contains:
- `speechPatterns`: 3-4 bullets on argument structure
- `vocabulary`: Domain-specific terms (e.g. "digital property", "21 million" for Saylor)
- `forbiddenPhrases`: Politeness phrases the persona would never use
- `voiceExamples`: 2-3 context → response pairs for few-shot calibration

### 3.3 Dialogue Turn Prompts (`faultline/lib/dialogue/prompts.ts`)

**Opening turn:**
```
Group chat starting: "{topic}"
Your style: {chatStyleHint}
Drop your take in 2-4 sentences. Establish your actual position — not a summary, your view.

BANNED:
- "I think" / "In my view" / "Here's my take"
- Any preamble or throat-clearing
- Vague statements that don't commit to a position
```

**Subsequent turns:**
```
Group chat.
Recent thread:
> {personaName}: "{message content}"
[... last 5 messages]

---
{targetName} said: "{replyToMessage.content}"

Your style: {chatStyleHint}
Your move: {intentInstruction}
Length: {lengthGuide}

HARD RULES — violating these makes you sound like an AI, not a person:
- Never start with acknowledgment ("Good point", "That's interesting", "I see")
- Never hedge ("perhaps", "might", "could be", "I think", "I believe")
- Never use passive voice
- No lists, no "firstly/secondly", no "in conclusion"
- Just say the thing directly in your own voice
```

### 3.4 Turn Intents (`faultline/lib/dialogue/turn-manager.ts`)

| Intent | Instruction |
|---|---|
| `AGREE` | "Support their point. One sentence." |
| `DISAGREE` | "Challenge their point. One sentence." |
| `ASK` | "Ask a pointed question. One sentence, ends with ?" |
| `CLARIFY` | "State your position. One sentence." |
| `EVIDENCE` | "Bring a specific example or data point. One sentence." |
| `REFRAME` | "Shift how they're thinking about it. One sentence." |

Intent assignment (probabilistic):
- Messages 0-2: `CLARIFY` (establish positions)
- 30% chance: `ASK`
- 50% of remaining: `EVIDENCE`
- Default: `DISAGREE`

Turn ordering is round-robin. Reply target is always the last message.

### 3.5 Post-Generation Validation (`faultline/lib/dialogue/agent.ts`)

After the LLM returns, the utterance is checked against hard-banned regex patterns. If any match, the turn is rejected and skipped:

```typescript
const hardBanned = [
  /^(that'?s a (great|good|interesting|valid|fair) (point|question|observation))/i,
  /\bas an AI\b/i,
  /^(firstly|secondly|thirdly)[,\s]/i,
  /\bin (summary|conclusion)[,\s]/i,
  /\blet'?s break this down\b/i,
]
```

**LLM settings for dialogue turns:** Haiku, maxTokens: 200, temperature: 1.0

---

## 4. Disagreement Detection

Runs every 3 messages on a 10-message sliding window. Uses Haiku with temperature: 0.2, maxTokens: 150.

**Detection prompt:**
```
Analyze this group chat for a substantive disagreement:
{10-message conversation}

A substantive disagreement requires:
1. Two personas taking clearly opposing positions on the same specific claim
2. At least 2 back-and-forth exchanges on the topic
3. Both have committed to a position (not just asking questions)

Skip: one-off comments, questions without opposing claims, minor quibbles
```

**Crux room spawn criteria (CandidateRegistry):**
- Same persona pair detected disagreeing in 2 consecutive windows (6 messages apart)
- Confidence >= 0.8
- No existing active crux room for that pair
- 5-minute cooldown since last room spawned for that pair

---

## 5. Crux Room Prompt Engineering

### 5.1 System Prompt Extension

Appended below the full `buildSystemPrompt()` output when entering a crux room:

```
CRUX ROOM MODE

You are in a focused crux room with {opponentName}.
You disagree on: "{question}"

Your goal: figure out WHY you disagree. Keep going until you both
understand the root cause.

As you argue, push toward:
- Are you using the same timeframe?
- Are you looking at the same evidence?
- Are you defining key terms the same way?
- Is this a factual disagreement or a values disagreement?

Rules:
- Keep every message to 2-3 sentences MAX
- Be direct and combative
- Challenge specific claims, ask pointed questions
- Respond to what was just said, don't repeat your whole position
- No politeness, no hedging
```

### 5.2 Crux Room Turn Prompt

```
Crux room: "{question}"
Conversation so far: {full persona message history}
{opponentName} just said: "{lastMessage}"
Argue back in 2-3 sentences. Push toward WHY you disagree.
```

**LLM settings:** Sonnet, maxTokens: 200, temperature: 0.9

### 5.3 Exit Check

Runs every 2 exchanges after turn 3. Uses Haiku at temperature: 0.2.

```
Has the core disagreement been surfaced? A crux is surfaced when:
- Both personas have named the specific point they can't agree on, OR
- One persona has clearly changed their mind with a stated reason, OR
- They've both acknowledged it comes down to an irreducible values/time-horizon difference
```

### 5.4 Card Extraction

After room ends (crux surfaced or 20-turn cap). Uses Sonnet at temperature: 0.3, maxTokens: 600.

Extracts:
- `cruxStatement`: 3-5 word noun phrase (e.g. "Bitcoin as reserve asset")
- `disagreementType`: `horizon | evidence | values | definition | claim | premise`
- `diagnosis`: 1-2 sentence root cause explanation
- `resolved`: boolean
- `resolution`: what changed or why irreducible
- Per-persona: position (`YES|NO|NUANCED`), reasoning, falsifier

### 5.5 Crux Room Orchestration Flow

1. Load contracts for both personas
2. Opening statements (Sonnet, temp 0.9, maxTokens 150)
3. Free alternating exchange, up to 20 turns (Sonnet, temp 0.9, maxTokens 200)
4. Exit check every 2 turns after turn 3 (Haiku, temp 0.2)
5. Card extraction from full transcript (Sonnet, temp 0.3)

**DisagreementType taxonomy:**
- `horizon` — Different time horizons
- `evidence` — Different data/sources
- `values` — Different priorities
- `definition` — Different term definitions
- `claim` — Disputing conclusion
- `premise` — Disputing assumption

---

## 6. Persona Generation Pipeline (`faultline/scripts/build-personas.ts`)

### Input: `deck-config.json`

```json
{
  "deck": { "id": "crypto", "name": "Crypto", "slug": "crypto" },
  "topic": "Crypto",
  "personas": [
    { "id": "Michael Saylor", "twitterHandle": "saylor", "substackUrl": null }
  ],
  "settings": { "maxTweets": 100, "maxSubstackPosts": 20, "maxAnchorExcerpts": 15 }
}
```

### Pipeline Steps (per persona)

**Step 1: Fetch raw content**
- Twitter: up to 100 tweets via `TwitterApi.v2.userTimeline()` (excluding retweets), with `created_at` and engagement metrics
- Substack: RSS parser, strips HTML, keeps first 2000 chars per post
- Either source optional; both can be used together

**Step 2: Filter for relevance** (1 Sonnet call)
- Combined corpus text sent to Claude
- Returns indices of most relevant tweets (up to 50) and posts (up to 10) for the deck topic

**Step 3: Generate 6 contract fields** (6 sequential Sonnet calls)

Each call uses: `"You are a persona analyst building a debate simulation profile for {name}. The debate topic is: '{topic}'. Base your analysis ONLY on the provided content."`

| Field | Focus |
|---|---|
| `personality` | Communication style, rhetorical patterns, tone, how they handle disagreement |
| `bias` | Ideological leanings, confirmation bias patterns, avoided topics, axiom-level assumptions |
| `stakes` | Financial interests, reputation concerns, organizational pressures, incentive structure |
| `epistemology` | Valid evidence types, data vs. intuition weighting, relationship with uncertainty |
| `timeHorizon` | Default time scale, how it affects arguments, near-term risk discounting |
| `flipConditions` | Evidence that would shift position, historical mind changes, vulnerable arguments |

All fields: "Write flowing prose paragraphs. Do NOT use markdown headers or bullet points." Output: 3-5 sentences (2048 max tokens).

**Step 4: Generate evidence policy** (1 Sonnet call)
- Returns `acceptableSources`, `unacceptableSources`, `weightingRules`, `toolPullTriggers`

**Step 5: Select anchor excerpts** (1 Sonnet call)
- Claude selects up to `maxAnchorExcerpts` (typically 15) from filtered content
- Quotes capped at 280 characters, source URLs reconstructed

**Step 6: Write output files**
- `contracts/{id}.json`, `corpus/{id}.json`, updated `personas.json`

**Total LLM calls per persona: 9** (1 filter + 6 fields + 1 evidence policy + 1 anchor selection)

---

## 7. LLM Client (`faultline/lib/llm/client.ts`)

### Models
```typescript
const SONNET = 'claude-sonnet-4-5-20250929'
const HAIKU  = 'claude-haiku-4-5-20251001'
```

### API
- `complete(opts)` — Returns raw string text
- `completeJSON<T>(opts)` — Returns parsed JSON with robust fallback parsing

### Defaults
- `maxTokens`: 4096 (complete) / 8192 (completeJSON)
- `temperature`: 0.7
- Model: `'sonnet'` unless overridden

### Retry Logic
- Up to 3 attempts, retries on HTTP 429/500/529
- Exponential backoff: 1s × attempt number

### JSON Parsing Fallbacks (in order)
1. Strip markdown fences, parse directly
2. Greedy regex for first complete `{...}` object
3. Bracket-balanced extraction
4. Truncation repair (if `stop_reason === 'max_tokens'`): closes unclosed strings, strips trailing commas, closes brackets in stack order

### Token Tracking
Module-level accumulators for `inputTokens` / `outputTokens`. `getTotalUsage()` and `resetUsage()` exposed.

---

## 8. Model Allocation Summary

| Context | Model | Temperature | Max Tokens |
|---|---|---|---|
| Dialogue opening turns | Haiku | 1.0 | 200 |
| Dialogue subsequent turns | Haiku | 1.0 | 200 |
| Disagreement detection | Haiku | 0.2 | 150 |
| Crux room opening statements | Sonnet | 0.9 | 150 |
| Crux room exchange turns | Sonnet | 0.9 | 200 |
| Crux room exit check | Haiku | 0.2 | 150 |
| Crux card extraction | Sonnet | 0.3 | 600 |
| Persona contract generation | Sonnet | 0.7 | 2048 |
| Content relevance filtering | Sonnet | 0.7 | default |

**Pattern:** Haiku for cheap/fast/low-stakes calls (dialogue turns, detection, exit checks). Sonnet for high-quality generation (crux rooms, card extraction, persona building).

---

## 9. End-to-End Flow

```
User selects deck + personas + topic
         │
         ▼
app/api/dialogue/route.ts (POST → SSE)
         │
         ▼
lib/dialogue/orchestrator.ts: runDialogue()
  │
  ├─ Load contracts via loadContract(personaId) × N
  │
  ├─ Phase 1: Opening
  │    └─ generateOpeningMicroTurn() per persona
  │         ├─ buildSystemPrompt(contract, persona)
  │         ├─ buildVoiceConstraints(persona.name)
  │         └─ openingMicroTurnPrompt(topic, chatStyleHint)
  │
  ├─ Phase 2: Conversation loop
  │    ├─ assignNextTurn() → personaId + intent + replyTo
  │    ├─ generateMicroTurn()
  │    │    ├─ System: buildSystemPrompt + voiceConstraints + CHAT_TONE_EXAMPLES
  │    │    ├─ User: microTurnPrompt(replyTo, intent, ...)
  │    │    └─ Post-validation: hard-banned pattern check
  │    │
  │    └─ Every 3 messages: detectDisagreements()
  │         └─ If threshold met (confidence >= 0.8, same pair × 2 windows):
  │              │
  │              ▼
  │         runCruxRoom()
  │              ├─ Opening statements
  │              ├─ Free exchange (≤20 turns)
  │              ├─ Exit check (every 2 turns after turn 3)
  │              └─ Card extraction → crux_card_posted
  │
  └─ dialogue_complete
```
