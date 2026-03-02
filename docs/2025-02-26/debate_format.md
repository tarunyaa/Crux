# Debate Format: Design Analysis

## The Real Problem with the Current System

Let's be honest about what the current dialogue layer actually does. Look at `turn-manager.ts`:

```ts
// Simple heuristic for now: next persona in rotation
const nextIndex = (currentIndex + 1) % personaIds.length

// Determine intent based on conversation flow
if (Math.random() > 0.7) intent = 'ASK'
else if (Math.random() > 0.5) intent = 'EVIDENCE'
```

This is round-robin with random intents. There's no intelligence in who speaks, when, or about what. The "natural group chat" idea sounds good in theory, but in practice:

1. **No topic coverage.** Agents can circle the same sub-issue for 50 messages. If the topic is "Should we ban social media for kids?" the whole debate might get stuck on "addiction" and never touch privacy, development, parental rights, or enforcement.

2. **Agents talk about whatever the last person said.** There's no mechanism for an agent to bring up what *they* care about. A privacy hawk and an economist are both forced to respond to whatever was said last, not to inject their unique angle.

3. **Sequential turn-taking wastes turns.** With 4 agents, each gets ~12 turns in a 50-message debate. Most of those turns are reactions to the previous message, not original contributions.

4. **Sycophancy cascade.** Research shows LLM agents converge to false consensus in free-form conversation (arXiv:2510.25110). Without structure, the dialogue produces fake agreement.

The crux room saves this somewhat — it catches disagreements and compresses them. But the dialogue layer feeding the crux room is weak. Garbage in, garbage out.

---

## What the Research Says

(Preserved from previous analysis — see Sources section at bottom for full citations.)

- **Unmoderated LLM debate produces false consensus**, not insight (DEBATE Benchmark, 36K+ messages)
- **Content-steering moderators make things worse** — they respond to rhetoric, not logic (ICLR 2025 MAD meta-analysis)
- **Process-enforcing moderators work** — Kahneman's adversarial collaboration, Delphi method, Double Crux all enforce structure without directing content
- **Debate adds value only when agents genuinely disagree** (NeurIPS 2025 Spotlight) — which is when the crux room triggers
- **Adaptive stopping beats fixed rounds** (arXiv:2510.12697)

---

## The Presidential Debate Model: Honest Assessment

The idea: structured rounds where a moderator sets sub-topics, all agents respond, rebuttals happen, crux rooms spawn from disagreements. Like a presidential debate with multiple candidates.

### What's genuinely good about this idea

**Topic decomposition solves the coverage problem.** One LLM call upfront: "Break 'Should we ban social media for kids?' into 3-4 debatable aspects." You get: addiction/mental health, privacy/data, developmental impact, enforcement/practicality. Each aspect gets a round. The full topic space is explored.

This IS moderation, but it's the *right kind*. The moderator picks *what to discuss*, not *what to think*. Presidential debate moderators do exactly this. The research says moderators fail when they evaluate argument quality — picking sub-topics is not evaluating quality.

**Parallel responses solve the turn-routing problem.** Instead of agonizing over who speaks next (which the current code does with `Math.random()`), everyone speaks every round. Each agent naturally gravitates to what their persona cares about. The privacy hawk talks about data. The economist talks about market effects. The psychologist talks about development. No routing algorithm needed.

**Guaranteed breadth + depth.** Rounds give breadth (cover the whole topic). Crux rooms give depth (compress the real disagreements). The current system only has depth (crux rooms) with no breadth mechanism.

### Where I'd push back

**Parallel responses create a UX challenge.** 4 messages appearing at once is harder to follow than a threaded chat. But this is a UI problem, not an architecture problem — present them as a "panel response" block (side-by-side cards or a grouped section), not as individual chat messages.

**Too many round types is an MVP risk.** Opening + themed rounds + rebuttals + free-for-all + closing = 5 distinct modes in the orchestrator. Each needs different prompts, different turn logic, different UI treatment. For MVP, simplify ruthlessly.

**The "adjacency routing" idea is overengineering.** If each agent responds to the round's sub-topic, the persona contract already biases them toward what they care about. You don't need an algorithm to compute "highest adjacency" — just let the agent respond naturally and it'll gravitate to its perspective. The contract IS the routing.

**A free-for-all round at the end might not add much.** By the time you've done themed rounds + crux rooms, the key disagreements are already surfaced. A free-for-all risks the same problems as the current system — drift, sycophancy, circling. Better to have a structured synthesis round.

---

## Proposed Format: Panel Debate with Crux Rooms

Strip the presidential debate model down to its essential parts:

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│  TOPIC DECOMPOSITION (1 LLM call, upfront)                 │
│  "Ban social media for kids?" →                            │
│    Aspect 1: Mental health & addiction                      │
│    Aspect 2: Privacy & data exploitation                    │
│    Aspect 3: Enforcement & practicality                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  OPENING ROUND                                              │
│                                                             │
│  All agents respond IN PARALLEL to the full topic.          │
│  "In 2-3 sentences, what's your take on [topic]?"          │
│  This establishes each persona's overall stance.            │
│  No rebuttals. Just positions.                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  THEMED ROUNDS (one per aspect)                             │
│                                                             │
│  For each aspect:                                           │
│    1. TAKE: All agents respond in parallel                  │
│       "What's your view on [aspect] specifically?"          │
│    2. CLASH: Disagreement detection on parallel responses   │
│       → If detected: sequential rebuttal exchange (2-4      │
│         messages between disagreeing agents)                │
│       → If strong enough: CRUX ROOM spawns                  │
│    3. Move to next aspect                                   │
│                                                             │
│  Moderator role: ONLY sets the aspect topic.                │
│  Does not evaluate, steer, or synthesize.                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  CLOSING ROUND                                              │
│                                                             │
│  All agents respond in parallel:                            │
│  "Given everything discussed, what's your final position?"  │
│  Compare to opening positions → detect who shifted.         │
└─────────────────────────────────────────────────────────────┘
```

### Why this works

**3 round types, not 5.** Opening, themed, closing. That's it. Rebuttals happen *within* themed rounds as a sub-step, not as a separate round type. Crux rooms spawn naturally from disagreement detection, same as current system.

**Parallel responses where they matter.** The "take" step is parallel — breadth exploration, every agent speaks. The "clash" step is sequential — depth, focused exchange between disagreeing agents. You get both.

**The moderator is a topic-setter, nothing more.** It picks the sub-topics upfront (1 LLM call). After that it just says "now discuss [aspect X]." No evaluation, no steering, no synthesis. This is the minimal-intervention moderator you described.

**Crux rooms still do the heavy lifting.** Themed rounds surface disagreements faster (because agents are forced to address the same sub-topic, making disagreements obvious). Crux rooms compress them into cards. The output is still crux cards.

**Opening + closing enables "shift detection."** If Agent A says X in the opening and Y in the closing, that's interesting. It means the debate actually moved someone. The current system has no way to detect position shifts.

### Token budget

With 4 agents and 3 aspects:
- Opening: 4 messages
- Themed rounds: 3 × (4 parallel takes + ~3 rebuttal messages) = ~21 messages
- Closing: 4 messages
- Crux rooms: ~10-15 messages each, maybe 2-3 rooms

Total: ~45-60 messages. Similar to current 50-message cap, but with guaranteed topic coverage.

---

## On "All Agents Respond Every Miniround"

This is the most interesting idea you raised. Let me think through it carefully.

### The strong version: every agent responds to every miniround

In a round about "privacy & data exploitation":
- Agent A (economist): talks about data markets
- Agent B (psychologist): talks about children's consent capacity
- Agent C (libertarian): talks about parental rights vs state intervention
- Agent D (tech person): talks about technical feasibility of age verification

Each agent naturally gravitates to what their persona's contract makes them care about. No routing needed. The contract IS the router.

**This is good** because:
- Every agent contributes every round — no "wasted" turns
- Natural diversity of perspectives on the same sub-topic
- Disagreements become obvious (A and C clash on regulation, B and D clash on feasibility)
- The disagreement detector has richer input — 4 positions to compare instead of 2

**But be careful** because:
- 4 agents × 3 aspects × 1 parallel message = 12 "take" messages. If each is ~50 tokens output, that's 600 output tokens + 4 LLM calls per round. Not cheap.
- Users need to read 4 responses at once. UI must group them visually (not just dump them in a chat thread).
- Agents might talk past each other — 4 monologues rather than a conversation. That's why the rebuttal step matters.

### The weak version (recommended for MVP): parallel takes, sequential clashes

Don't make EVERY exchange parallel. Make the opening "take" parallel (breadth), then let the clash be sequential between specific disagreeing agents (depth). This gives you the benefit of parallel exploration without the cost of parallel everything.

---

## What NOT to Build

**Don't build a "lightning round."** It's debate theater. The crux card already compresses insights faster than any lightning round could.

**Don't build opening/closing statements as separate elaborate phases.** The "take" step in the opening round IS the opening statement. The closing round IS the closing statement. Don't add ceremony.

**Don't build a moderator that summarizes.** The moment the moderator synthesizes agent outputs into new text, you get hallucination risk. The moderator sets topics and detects disagreements. That's it.

**Don't build adjacency routing.** The persona contract already biases each agent toward their perspective. Explicit "highest adjacency" computation is overengineering. Just prompt the agent with the sub-topic and let the contract do the work.

---

## Comparison: Current vs. Proposed

| Dimension | Current (Group Chat) | Proposed (Panel Debate) |
|-----------|---------------------|------------------------|
| Topic coverage | Hope agents wander into all aspects | Guaranteed by topic decomposition |
| Turn routing | Random rotation + `Math.random()` intent | Parallel takes + disagreement-triggered clashes |
| Agent voice | Everyone reacts to last message | Each agent addresses sub-topic from their angle |
| Breadth | None — emerges or doesn't | Structured — one round per aspect |
| Depth | Crux rooms (good) | Crux rooms (same, but fed better inputs) |
| Moderator | None | Minimal — sets sub-topics only |
| Sycophancy risk | High (free-form convergence) | Lower (parallel takes are independent) |
| UX feel | Discord group chat | Panel discussion / debate stage |
| Messages | ~50 sequential | ~45-60 mixed parallel/sequential |
| LLM calls | ~50 (1 per message) | ~35-45 (parallel takes batch well) |

---

## The Crux Room (Unchanged)

The crux room design from the previous analysis still holds. Regardless of how the dialogue layer works, crux rooms should:

1. **Position Lock** (1 turn each) — state your position before responding
2. **Contested Exchange** (adaptive, 2-10 turns) — steelman constraint per turn, adaptive exit
3. **Card Extraction** — with disagreement type classification (empirical / values / definition)

The panel debate format actually *improves* crux room inputs — because agents are forced to address the same sub-topic, the disagreements fed into crux rooms are more focused and specific.

---

## MVP Decision: Which to Build?

**If the priority is "good response to the wider topic"** — build the panel debate format. The current group chat cannot guarantee topic coverage. Period.

**If the priority is "natural sounding conversation"** — the group chat sounds more natural. But it produces worse insights because it can't guarantee coverage.

**My recommendation**: Build the panel debate format. The "natural conversation" goal was always in tension with the "disagreement compression and insight" goal. You're asking the system to produce crux cards that cover the full topic space — that requires structural guarantees that emergent conversation can't provide.

The panel format still sounds natural within each response — agents still speak in their persona's voice, still use casual language, still have personality. It just adds structure *around* the responses (which round, which sub-topic) rather than leaving everything to chance.

---

## Open Questions

1. **How many aspects?** 3-4 seems right for MVP. Fewer = incomplete coverage. More = debate drags. Could let the user choose or let the decomposition LLM decide.

2. **Parallel response UI.** How to display 4 simultaneous responses? Side-by-side cards? Tabbed view? Stacked panels? This is a frontend design question, not an architecture question.

3. **When to skip a round.** If all 4 agents agree on an aspect (no disagreement detected), skip the clash step and move on. Don't waste tokens on consensus.

4. **Crux room spawning threshold.** In the current system, disagreement must be detected twice before spawning. With parallel takes, disagreements are more obvious — might need to adjust the threshold.

5. **Should closing positions be a crux card?** The shift between opening and closing positions could itself be formatted as a "synthesis card" — showing how the debate moved each agent. Different from crux cards (which show disagreements) but potentially valuable.

---

## Sources

- Du et al. (ICML 2024) — Improving Factuality and Reasoning through Multiagent Debate (arXiv:2305.14325)
- Khan et al. (ICML 2024 Best Paper) — Debating with More Persuasive LLMs Leads to More Truthful Answers (arXiv:2402.06782)
- Choi, Zhu, Li (NeurIPS 2025 Spotlight) — Debate or Vote (arXiv:2508.17536)
- ICLR 2025 Blogpost — Multi-LLM-Agents Debate: Performance, Efficiency, and Scaling
- Multi-Agent Debate for LLM Judges with Adaptive Stability Detection (arXiv:2510.12697)
- Chuang et al. — DEBATE Benchmark (arXiv:2510.25110)
- Cui et al. — FREE-MAD, anti-conformity CoT (arXiv:2509.11035)
- Irving et al. (2018) — AI Safety via Debate (arXiv:1805.00899)
- Kenton et al. (NeurIPS 2024) — Scalable Oversight (arXiv:2407.04622)
- Human-AI Hybrid Delphi Model (arXiv:2508.09349)
- Kahneman — Adversarial Collaboration (Edge.org, 2003)
- CFAR — Double Crux Protocol
- arXiv:2509.23055 — Sycophancy as capitulation in multi-agent debate
- arXiv:2510.07517 — Anonymization cuts sycophancy in MAD
- arXiv:2505.19184 — Anti-Bayesian confidence escalation in LLM debate
- arXiv:2412.00804 — Persona identity drift in extended conversations
