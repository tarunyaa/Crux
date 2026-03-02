# Demo Script — 3 Minutes

---

## [0:00 — Landing Page]

*[Lobby: logo centered, "Where AI minds debate — so you can decide."]*

Think tanks and investment banks pay millions per year for research platforms that present a single analytical perspective. Fund managers spend hours synthesising bull and bear cases from fragmented, non-dialogic sources. Tracking the best voices across platforms, comparing competing arguments, separating signal from noise — all of it remains manual, slow, and expensive. There is no system that reliably converts fragmented expert discourse into a clear, testable map of where informed perspectives actually divide and why.

Crux is that system.

---

## [0:30 — Cards Page]

*[Navigate to /cards — show deck grid with persona photos]*

Before we run a debate, here's what the system is actually built on. These are the personas — high-fidelity agents modeled from real-world voices. Not a generic LLM playing a character. Each one carries a structured belief state: explicit priors, confidence levels on their core claims, and stated flip conditions. What would actually change their mind.

*[Click one persona — show /cards/[id] contract]*

You can read the full contract for any persona. This is the epistemic fingerprint the agent carries into every debate.

---

## [1:00 — Setup Page]

*[Navigate to /setup — "Build Your Hand"]*

Now let's build a debate. Pick a deck — say the Bitcoin and Macro deck — choose your panel, enter a topic. "Will Bitcoin replace gold as a global reserve asset?" Hit start.

---

## [1:15 — Dialogue Page — messages streaming in]

*[Dialogue page loads, messages begin appearing in the chat feed]*

This is the Dialogue Layer. The agents are running a natural group conversation, with turn-taking driven by urgency — which agent has the most at stake in what was just said.

Watch the Alignment graph in the sidebar. Each node is a persona. The edges show the relationship between each pair — right now they're faint, talking but not yet directly clashing.

---

## [1:40 — Crux Room spawns in sidebar]

*[Crux room card appears in the sidebar with two avatars and a short label]*

There. A crux room just spawned.

The system detected a structural disagreement — not just that two agents disagree, but a specific claim being re-engaged repeatedly. That pair gets pulled into a focused bilateral session: the Crux Layer.

Inside the crux room, they do three things. They steelman each other's position first — no straw-manning. They diagnose *why* they disagree: is this a time horizon clash? An evidence dispute? A values difference? A definitional gap? And then each states their flip condition — the one thing that would cause them to concede.

Meanwhile the main dialogue keeps running.

---

## [2:10 — Crux Card drops into the strip]

*[Playing card drops into the horizontal strip at the bottom]*

The crux room closes with a crux card.

This is the output. Not a summary. A structured card: the core question, each persona's position — YES, NO, or NUANCED — their one-sentence reasoning, and the falsifier. The specific condition that would shift the position.

This is more useful than a consensus. A consensus tells you what people agreed on. A crux card tells you exactly what remains open and what it would take to close it.

---

## [2:35 — Debate Results]

*[Scroll down to results panel]*

When the debate ends: the Position Matrix shows every persona mapped against every crux card — who said YES, NO, or NUANCED, and on what. The Fault Lines section shows which pairs clashed and what type of disagreement drove it.

Below that, the benchmark metrics. Disagreement entropy. Crux compression rate. These are not decorative. They're the empirical test of whether the debate actually did useful work — whether it compressed disagreement onto a tight set of root causes, or just produced more noise.

---

## [2:50 — Wrap]

*[Stay on results]*

There's a study from earlier this year that ran 2.6 million AI agents in a persistent social network. The central finding: no epistemic movement. Agents interacted extensively, yet their belief drift was statistically indistinguishable from random noise. They did not influence each other. The society never developed shared memory or stable structure. The conclusion: scalability is not socialization.

What was missing wasn't more agents or more turns. It was structure. Explicit adversarial pressure. A mechanism that forces agents to engage with specific attacks rather than talk past each other. A revision operator that only fires when a premise is actually defeated — not when the other side repeats themselves more forcefully.

That's what the crux room is. And the hypothesis — which the benchmark metrics are designed to test — is that this structure is sufficient. That you can take the same underlying models that failed to socialize at 2.6 million agents, add a crux room, and get genuine epistemic movement.

That's what Crux is trying to prove.

---

*~560 words / ~3:30 at a comfortable speaking pace*
