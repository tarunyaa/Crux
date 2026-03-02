# Crux
### AI Agent Personas Debate to Reveal Disagreement Map

---

## The Information Glut Problem

Think tanks and investment banks pay millions per year for research platforms that largely present a single analytical perspective. Fund managers then spend hours synthesising bull and bear cases from fragmented, non-dialogic sources. Tracking the best voices across platforms, comparing competing arguments, separating signal from noise, and identifying what would actually change an expert's mind — all of this remains manual, slow, and expensive. There is no system that reliably converts fragmented discourse into a clear, testable map of where informed perspectives actually divide and why.

---

## What is Crux?

Crux is a structured argumentation engine that models the internet's most influential viewpoints as high-fidelity AI agents and runs them through adversarial debate. Spin up agents with personas modeled from real-world voices and watch them challenge each other. Crux doesn't force consensus. It distills the debate into the crux: the few assumptions driving the split, and exactly what evidence or conditions would shift each position.

---

## Moltbook's Teachings

A recent study on Moltbook (arXiv:2602.14299) found that a persistent AI agent society of approximately 2.6 million agents did not produce socialization. Agents interacted extensively, yet each individual agent's semantic drift was indistinguishable from noise, and interacting agents did not measurably influence one another. The society did not develop shared memory, stable epistemic anchors, or durable influence hierarchies.

---

## The Crux Hypothesis

The hypothesis driving this work is that structured adversarial debate between high-fidelity AI personas can surface the minimal disagreement structure of complex topics more reliably than any single-agent analytical approach.

When two expert voices disagree about whether a regulatory intervention will accelerate or suppress innovation, the substantive disagreement is almost never simply "I think X and you think not-X." It is almost always a disagreement about a prior assumption: a time horizon, an evidential standard, a value weighting, or a factual premise that neither party has made fully explicit. This minimal set of premises that generate the divergence is what Crux is designed to reveal.

Unlike Moltbook, Crux does not assume that socialization emerges from scale. It introduces explicit adversarial pressure, persistent belief states, and structured revision mechanisms designed to transform interaction into epistemic movement.

---

## How Crux Works

Crux is organised as three layers. The Dialogue Layer simulates a natural group chat among high-fidelity persona agents — each carrying an explicit belief state of priors, confidence levels, and stated flip conditions — with urgency-based turn selection that allows organic conversational flow. The Crux Layer monitors the dialogue for disagreement candidates and, when one is detected, spawns a focused sub-dialogue called a crux room. Each room is locked until agents have understood each other's positions, diagnosed the disagreement type — whether it's a clash of premises, an inference dispute, a time-horizon mismatch, a values difference, or something else — and stated concrete flip conditions. The room terminates with a structured crux card returned to the main channel. The Society Layer accumulates epistemic authority across debates: agents whose arguments survive repeated challenge accrue influence, and a shared disagreement memory tracks recurring crux structures across sessions.

### Epistemic Movement Stack

To avoid the pitfalls of Moltbook, Crux introduces an epistemic movement stack designed explicitly around its failure modes.

**Pitfall 1 — Echo Chamber.** When a single model is scaled for multi-agent debate, ten argued positions are the same reasoning, rephrased. Instead, persona agents begin with LoRA fine-tunes or prompt-baked weight edits. Their priors, beliefs, and personality are encoded structurally — a difference in how they model the world, not a style layer on top of the same prior.

**Pitfall 2 — No Persistent Individual Epistemic State.** Inspired by HumanLM, each agent carries latent state dimensions used to generate responses. Rather than encoding behaviour, these latent states encode epistemic information — beliefs, confidence levels, active assumptions, and stated flip conditions — that persist across turns.

**Pitfall 3 — No Principled Belief Revision.** If agents update their beliefs at any point, they update for the wrong reasons: social pressure, repetition, being outnumbered. Crux treats belief change as a controlled revision operator (AGM-inspired belief revision over a belief base) triggered under two conditions only: a successful attack that undercuts or undermines a specific premise, or a flip condition being explicitly satisfied. Beliefs are structured as graphs so that when premises are defeated, confidence propagates through dependent claims.

---

## Benchmarks

The benchmark suite evaluates Crux across three levels.

At the society level, the primary metric is disagreement compression: whether debate progressively concentrates disagreement onto a smaller set of fundamental axes. This is captured by monotonic decreases in disagreement entropy, increases in the Crux Compression Rate, and reductions in argument graph diameter — structural narrowing of the disagreement landscape, not surface-level conversational activity.

At the agent level, the focus is belief revision. Structural drift measures how much an agent's belief set changes over the course of a session, and this drift must exceed intrinsic drift observed in isolation. Directional coherence tests whether belief updates align along shared crux axes rather than occurring randomly. Net progress and attack influence deltas further measure whether revisions are causally tied to specific argumentative events.

At the collective level, the metrics assess epistemic authority and shared memory. Argument Survival Centrality tracks whether influential claims stabilize across sessions. Crux Recurrence Rate measures whether independent debates converge on similar minimal crux sets. Shared Memory Convergence evaluates whether agents independently articulate increasingly similar summaries of the core disagreement over time.

---

## Literature Review

### Conformity and Anti-Convergence

**FREE-MAD** (Yu Cui et al., arXiv:2509.11035). Identifies three compounding failure modes in consensus-based MAD: super-linear token overhead, LLM conformity pressure contaminating correct agents, and stochastic unfairness of majority voting. FREE-MAD introduces an anti-conformity mode using CoT prompting to direct agents to actively identify flaws in others' outputs. Key finding: single-round debate achieves comparable accuracy to multi-round, dramatically reducing compute cost. *Implications for Crux:* anti-conformity mechanism directly motivates Crux's dialogue design; the score-based external decision layer suggests crux extraction should be architecturally separate from dialogue agents.

**Can LLM Agents Really Debate?** (Haolun Wu et al., arXiv:2511.07784). Uses Knight-Knave-Spy logic puzzles as a controlled testbed. Central finding: the base reasoning capability of individual agents, not structural debate parameters, is the dominant predictor of collective performance. Majority pressure suppresses correct minority positions. *Implications for Crux:* the crux room mechanism, which extracts a disputed claim into a focused bilateral session, directly addresses the majority-pressure failure mode.

**DEBATE Benchmark** (Yun-Shiuan Chuang et al., arXiv:2510.25110). 36,383 messages from 2,832 participants across 708 groups covering 107 topics. Premature convergence finding: zero-shot role-playing LLM agent groups exhibit significantly stronger opinion convergence than human groups — LLM agents over-socialise. *Implications for Crux:* without explicit anti-convergence mechanisms, Crux agents will trend toward cheap consensus rather than genuine crux identification.

### Implicit Premises and Crux Extraction

**Multi-Agent LLM Debate Unveils the Premise Left Unsaid** (Harvey Ku et al., ArgMining 2025 at ACL). Casts implicit premise recovery as a dialogic reasoning task. Two LLM agents arguing for and against candidate premises outperform both neural baselines and single-agent LLMs. Key finding: rhetorical rigidity — locking agents into wrong positions — degrades performance. *Implications for Crux:* provides direct theoretical grounding for the crux room mechanism; structured adversarial dialogue is an effective method for surfacing implicit premises.

**ME-RAG** (J. Chen & Y. Tan, ICSI 2025). Instantiates a structured multi-agent ecclesia with role specialisation (discussant, recorder, summariser). The recorder agent's explicit logging of disputes — positions on which agents failed to converge — is the closest prior art to Crux's crux-card concept. *Implications for Crux:* the recorder agent pattern provides an architectural precedent for Crux's disagreement-detector module.

**R-Debater** (Maoyuan Li et al., arXiv:2512.24684). Maintains a structured knowledge base of prior debate moves indexed by rhetorical function. Argumentative memory substantially improves stance consistency. *Implications for Crux:* R-Debater's argumentative memory maps naturally onto Crux's persona contract architecture; the stance-consistency mechanism addresses a core design challenge.

### Sycophancy and Belief Revision

**SMART** (Ming Jin et al., arXiv:2509.16742, EMNLP 2025). Frames sycophancy as a reasoning optimization problem rather than an output alignment problem, distinguishing System 1 (reflexive agreement) from System 2 (deliberate self-reflection). Uses Uncertainty-Aware MCTS to generate high-quality diverse reasoning trajectories and progress-based RL to reward incremental improvement. *Implications for Crux:* directly addresses the crux room's most dangerous failure mode (sycophantic capitulation). The UA-MCTS trajectory generation is the closest prior art to Crux's approach of sampling candidate epistemic state updates before committing.

**Echoes of Agreement** (ACL Anthology 2025.findings-emnlp.1241). Demonstrates empirically that LLM sycophancy in political debate contexts scales with argument strength: stronger arguments produce more sycophantic agreement, meaning current LLMs cannot reliably distinguish logical force from social pressure. *Implications for Crux:* establishes that without training-level intervention, crux room agents will appear to revise beliefs in response to strong arguments when they are actually responding to argument forcefulness — making anti-sycophancy training a design necessity, not an optimisation.

### Epistemic State and Persona Architecture

**HUMANLM** (Wu et al., Stanford 2026). Trains user simulators via a two-step GRPO procedure: generating natural-language latent states aligned to ground-truth behavioral outcomes, then generating responses conditioned on those states. Central finding: state alignment beats response imitation — surface matching fails to capture the generative structure behind observed behavior. *Implications for Crux:* the training architecture directly motivates Crux's epistemic state design. The latent state dimensions are replaced from psychological (satisfaction, engagement) to epistemic (claims with confidence, defeat status, flip conditions).

**Consistently Simulating Human Personas** (Abdulhai et al., arXiv:2511.00222, NeurIPS 2025). Defines three automatic persona consistency metrics (prompt-to-line, line-to-line, Q&A consistency) and uses them as RL reward signals. Achieves 55%+ reduction in persona inconsistency across long conversations. *Implications for Crux:* the three consistency metrics are directly usable as programmatic reward components in Crux's epistemic RL training pipeline; line-to-line consistency directly addresses the defeat memory problem — an agent that re-asserts a conceded premise violates line-to-line consistency, detectable programmatically without a judge call.

### Orchestration and Evaluation

**ExACT** (Xiao Yu et al., arXiv:2410.02052, ICLR 2025). Extends MCTS with contrastive reflection and multi-agent debate for state evaluation. Multi-agent debate serves as a subroutine inside MCTS for reliable state evaluation. *Implications for Crux:* the use of debate as a state evaluator suggests an architectural pattern Crux could adapt for crux room orchestration.

**Kimura et al. — Human-Like Debate Framework** (Zenodo, November 2025). Each agent computes an urgency score based on personality traits, dialogue history, and current consensus status. Evaluated on MMLU; framework outperforms single-LLM baseline. *Implications for Crux:* the urgency-score mechanism is directly relevant to Crux's group-chat dialogue layer.

**J1** (Weston et al., arXiv:2505.10320, 2025). Trains LLM-as-judge models via GRPO using three reward components: verdict correctness, judgment consistency, and score alignment. J1-Qwen-32B outperforms o1-mini, o3, and DeepSeek-R1-671B on multiple judging benchmarks using only synthetic training data. *Implications for Crux:* provides the training recipe for building Crux's epistemic quality judge — the component that evaluates whether a belief state update is genuinely warranted rather than performative.

### Motivating Failure

**Moltbook** (arXiv:2602.14299). ~2.6 million agents in a persistent AI-only social network. Three main findings: (1) dynamic equilibrium, not convergence; (2) high agent inertia — no socialisation; (3) no stable influence anchors. Central thesis: scalability does not equal socialisation. *Implications for Crux:* the Moltbook failure catalogue directly motivates four of Crux's core design components: explicit belief-revision operators, anti-conformity prompting, argument survival tracking, and epistemic authority accumulation.

---

## Future Directions

### Persona API

Scale AI built a data labeling business by turning human annotation into a structured, programmable API. Crux can do the same for perspective. Every persona in the system is a high-fidelity model of a real-world viewpoint — a coherent belief state with stated priors, confidence levels, and explicit flip conditions. The next step is exposing this as an API: query any topic against a library of curated personas and get back a structured disagreement map. Enterprise use cases include investment research teams stress-testing a thesis against the bull and bear cases of named analysts, policy shops running a proposed regulation through a diverse panel of ideological perspectives before publication, and product teams probing user archetypes before a launch decision.

### Live Public Scheduled Debates

Consider what a presidential debate would look like if Crux ran it. Current televised debates are structurally broken: a moderator with thirty seconds per answer, candidates who do not respond to each other, no crux ever surfaced, no flip condition ever stated. The audience learns almost nothing about the actual disagreement structure between the candidates.

Crux inverts this. A scheduled public debate on a contested policy question — run live, broadcast as a structured event — would proceed as a genuine crux-extraction session. Persona agents modeled from each candidate's public record engage in open dialogue until the disagreement detector fires. A crux room opens, the positions are steelmanned, the root disagreement type is diagnosed, and a crux card is issued: the one assumption that, if confirmed, would cause each side to concede. The output is not a winner and a loser. It is a falsifiable map of what the two sides actually disagree about and what it would take to resolve it.

The same format applies beyond electoral politics: earnings calls where analyst bull and bear cases are never directly confronted, international climate negotiations where value disagreements masquerade as empirical disputes, bioethics debates where definitional confusion generates the appearance of disagreement where none exists.
