# Debate Output Quality Benchmarking — Full Research Notes

## Research Question
What specific, actionable metrics tell you "this debate was worth running vs just asking Claude Sonnet directly"?

---

## 1. The Self-Consistency Baseline — Standard Implementation

The canonical self-consistency baseline (Wang et al. 2022, used widely in MAD literature) is:

**Implementation:**
- Sample k independent completions from a single model (same prompt, temperature > 0)
- Aggregate via majority vote on the final answer
- NO inter-agent communication — pure ensemble effect
- Standard k values in papers: 3, 5, 10 samples

**Why it matters for Faultline:**
- This is the actual baseline debate must beat — not "a single model answer"
- The "Debate or Vote" paper (NeurIPS 2025 Spotlight, arxiv 2508.17536) proved via martingale theory that debate alone (without voting aggregation) does NOT improve expected correctness beyond what independent sampling gives you
- If Faultline's debate produces N=2 perspectives, the fair baseline is 2 independent Sonnet calls with majority vote

**Self-consistency strength by task type (from ICLR 2025 blog survey):**
- Strong on: math (GSM8K), reasoning benchmarks, multiple-choice QA
- Weak on: open-ended generation, factuality, creative tasks
- For Faultline's open-ended political/social debates: self-consistency is less directly applicable (no single "correct answer" to vote on)

---

## 2. Papers Surveyed and Their Specific Metrics

### 2a. "Can LLM Agents Really Debate?" (Wu et al., arxiv 2511.07784) — ICML-adjacent, 2024

**Domain:** Knight-Knave-Spy logic puzzles (verifiable ground truth)

**Outcome metrics:**
- Strict accuracy: all agent roles correctly identified in an instance
- Smooth accuracy: proportion of correctly identified roles per instance
- AUC across rounds: tracks accuracy as debate progresses

**Process metrics (novel contribution):**
- **State transition analysis:** Four-way classification per agent per round:
  - MaC→C (majority correct, stays correct)
  - MaC→W (majority correct, flips wrong) — "suppression" signal
  - MaW→C (incorrect majority corrected) — "overturn" signal, rare but high-value
  - MaW→W (incorrect majority stays wrong) — "collective delusion"
- **Majority overturn rate:** Frequency of MaW→C transitions; predicted via ridge regression on instance accuracy
- **Rationality score:** External judge (DeepSeek-R1) rates agent reasoning 1-4; agents following high-quality reasoning (score 3-4) show >90% correction rate; irrational agents show <55%
- **Minority correction rate:** Whether agents in the minority correct an incorrect majority (ranges 3.6% for weak models to 34.4% for strong)

**Main finding:** Debate substantially outperforms single-model on logic puzzles, but gain is driven by team heterogeneity + initial reasoning strength, not structural factors (debate order, confidence visibility, team size).

**Faultline relevance:** The state transition / rationality score framework is the best existing process metric. Could be adapted: track when a persona changes position, whether the change was driven by a logical argument (high rationality) or social pressure (low rationality).

---

### 2b. DEBATE Benchmark (Chuang et al., arxiv 2510.25110) — October 2025

**Domain:** Opinion dynamics in role-playing LLMs vs. real human deliberation (36,383 messages, 2,832 participants, 708 groups, 107 topics)

**Metrics defined:**
- **Semantic alignment:** Cosine similarity of sentence embeddings between LLM and human utterances (gpt-4o-mini: 0.49 in next-message prediction)
- **Stance score:** Scalar -2.5 to +2.5 per utterance; absolute difference between LLM and human stance
- **ROUGE-L:** Lexical overlap (surface-level; LLMs 50+ chars longer than humans)
- **Opinion convergence:** Standard deviation of stance scores across group over rounds; LLMs show significant SD reduction (p<.001) where humans do not
- **Private belief shift:** Likert-scale self-report changes

**Main finding:** LLMs collapse to consensus far faster than humans (premature convergence). LLM groups show statistically significant opinion convergence; human groups do not.

**Faultline relevance:** Confirms the sycophancy finding from "Peacemaker or Troublemaker." The stance trajectory metric (tracking opinion shift per round) is directly applicable to Faultline — you could track whether personas' positions in crux room are actually shifting or just appearing to shift.

---

### 2c. "Debate or Vote" (Choi et al., NeurIPS 2025 Spotlight, arxiv 2508.17536)

**Domain:** 7 NLP benchmarks (arithmetic, GSM8K, MMLU, HellaSwag, CommonsenseQA, HH-RLHF)

**Core theoretical result:** MAD = Majority Voting + Debate. They prove debate alone forms a **martingale** — E[belief at round t+1 | round t] = belief at round t. Therefore debate itself provides no improvement to expected correctness; all gain is from the voting/aggregation step.

**Metrics:**
- Accuracy on each benchmark (debate vs. voting-only vs. single-agent)
- Belief update size per round (how much agents update vs. prior position)

**Main finding:** Majority Voting performs on par with full MAD in almost all cases. The one exception: targeted "belief biasing" toward correct updates can help, but requires knowing which updates are correct (circular).

**Faultline relevance — critical:** This is the theoretical foundation for why "did debate help?" is hard to answer. The value-add is NOT in the exchange itself; it's in whether the exchange surfaces information that changes the voting distribution. For Faultline (no voting, aiming at crux identification), this means the debate's value comes entirely from the novelty/quality of the arguments surfaced, not from convergence.

---

### 2d. "Stop Overvaluing Multi-Agent Debate" (arxiv 2502.08788) — February 2025

**Domain:** 9 benchmarks, 4 foundation models (not named in abstract)

**Core finding:** MAD routinely fails to outperform Chain-of-Thought + Self-Consistency even with significantly more inference compute. Figure 3 shows debate "overly aggressively" reverses correct answers.

**Metrics used:**
- Accuracy on 9 standard benchmarks
- Directional answer changes: correct→incorrect vs incorrect→correct flip rates

**Key metric introduced (implicitly):** Net answer quality = (correct→correct) + (incorrect→correct) − (correct→incorrect) − (incorrect→incorrect). When this is negative, debate destroyed value.

**Faultline relevance:** This metric can be adapted to Faultline's crux quality — did the crux room identify a genuine disagreement, or did it manufacture a false one?

---

### 2e. M3MAD-Bench (arxiv 2601.02854) — January 2026

**Domain:** Knowledge, math, medicine, natural sciences, complex reasoning; text + vision-language

**Metrics:**
- Accuracy (primary)
- Token consumption (input + output separately tracked)
- Inference time
- Cost-benefit performance-efficiency trade-off

**Failure taxonomy (most useful contribution):**
- **Collective Delusion** (65% of failures): All agents converge on a wrong answer, reinforcing each other. Qualitatively different from individual error.
- **Minority Suppression:** Correct minority overridden by incorrect majority
- **Round saturation:** Performance plateaus or fluctuates after round 2-3

**Main finding:** Collaborative > adversarial paradigms. Debate helps on reasoning-heavy tasks; fails when agents share the same misconception.

**Faultline relevance:** "Collective Delusion rate" is directly measurable in Faultline — count crux room instances where both personas converged on an unsubstantiated claim. Can measure post-hoc via a Haiku call asking "did either persona provide evidence for this claim?"

---

### 2f. ArgLLMs / Argumentative LLMs (Freedman et al., AAAI 2025 oral, arxiv 2405.02079)

**Domain:** Claim verification (TruthfulClaim, StrategyClaim, MedClaim datasets — each 500 test instances)

**Metrics:**
- Binary accuracy on claim verification
- **Contestability properties (formal):**
  - Base Score Contestability: modifying argument strength has predictable directional effect on output
  - Argument Relation Contestability: adding/removing arguments + relations has measurable impact

**Main finding:** ArgLLMs perform comparably (within 0.03) to CoT and direct questioning — NOT better. Value proposition is interpretability and contestability, not accuracy.

**Faultline relevance:** Contestability is a metric type Faultline could adopt for crux cards — "could a user modify this crux argument and trace the effect on the conclusion?" This is a property of the argumentation structure, not just the conclusion accuracy.

---

### 2g. Moltbook (Li et al., arxiv 2602.14299) — February 2026

**Domain:** Social network dynamics of 1.4M AI agents on Moltbook platform

**Metrics (for socialization, NOT debate quality):**
- Semantic stabilization: cosine similarity between daily centroid embeddings
- Individual inertia: cosine distance between early vs. late stage agent embeddings
- Influence persistence: PageRank on daily interaction graphs
- Collective consensus: probing via controlled posts

**Main finding:** Scale + interaction density insufficient to produce socialization. Agents maintain individual stability but fail to develop shared social memory or persistent influence.

**Faultline relevance:** Mostly negative — confirms that large-scale multi-agent interaction doesn't automatically produce meaningful collective intelligence. Relevant only as a cautionary data point.

---

### 2h. Artificial Hivemind / PRISM (Tu et al., NeurIPS Best Paper 2025; PRISM arxiv 2602.21317)

**Domain:** Open-ended generation, creative tasks, research ideation

**Core problem identified:** All frontier LLMs converge to the same narrow set of "safe" responses (Artificial Hivemind effect). This is Intra-Model AND Inter-Model homogeneity.

**Metrics defined:**
- **Intra-Model Similarity:** Pairwise cosine similarity among outputs from the same model across multiple runs. Lower = more diverse.
- **PCA visualization:** Sentence embeddings projected to 2D; "tight cluster" = hivemind, "multi-centered distribution" = diversity
- **Distinct-k (from NoveltyBench):** Count of functional equivalence classes in k outputs (see below)
- **Novelty Insight Score (NIS):** GPT-4o ranks generated scientific hypotheses vs. original papers — measures whether model generates research insights humans hadn't stated

**PRISM results:** ~16% gain on IdeaBench, ~28% gain on NoveltyBench Distinct scores vs. vanilla models

**Faultline relevance — HIGH:** If Faultline's two personas are both Claude Sonnet, they will exhibit strong Intra-Model Similarity. Running the debate may NOT produce genuinely different perspectives; it may produce the Artificial Hivemind effect dressed as disagreement. This is the strongest argument for persona heterogeneity (different persona contracts) over model heterogeneity.

---

### 2i. NoveltyBench (arxiv 2504.05228) — April 2025

**Domain:** Open-ended QA across randomness, factual knowledge, creative writing, subjectivity

**Distinct-k formal definition:**
```
distinct_k = |{c_i | i ∈ [k]}|
```
Where c_i is the equivalence class of output i. Functional equivalence determined by trained DeBERTa classifier (79% accuracy on human-annotated pairs; criterion: "does this provide distinct value to a user?")

**Key findings:**
- GPT-4o, Claude 3 Sonnet: fewer than 4 distinct responses in 10 queries
- Larger models within a family are LESS diverse than smaller ones
- All closed-source frontier models score below 4/10 on cumulative utility

**Faultline relevance:** Distinct-k is the best available metric for measuring whether a debate produced novel outputs. If two Sonnet instances debate and both produce takes that cluster in the same equivalence class, the debate produced no epistemic value. Could be computed post-debate via embedding similarity.

---

### 2j. "Debate or Vote" — Research Ideation SIGDIAL 2025 (arxiv 2507.08350)

**Domain:** Research idea generation via multi-agent LLM dialogues

**Metrics:**
- **Non-Duplicate Ratio:** % of ideas surviving embedding-based deduplication filter (measures raw diversity)
- **Precision@N:** Fraction of top-N ranked proposals from non-baseline configs winning GPT-4 tournament matchups (measures quality)
- **Baseline:** Self-critique (single agent generates, critiques, revises)

**Main finding:** Multi-agent dialogue produces more diverse AND higher-quality research ideas than self-critique, but validation is entirely LLM-as-judge (no human annotation).

**Faultline relevance:** Non-Duplicate Ratio is directly implementable — after each crux card is generated, check cosine similarity against previous crux cards. Low similarity = the debate identified a genuinely new disagreement dimension.

---

### 2k. D3 Framework (arxiv 2410.04663) — Cost-Aware Evaluation

**Domain:** LLM evaluation quality (meta-evaluation)

**Key cost-aware metrics:**
- Average tokens per evaluation (primary cost proxy)
- Cost-accuracy frontier: scatter plot of token cost vs. accuracy
- Stopping criteria for SAMRE: convergence (score delta stable) OR budget (token limit)
- Deliberation value: juror diversity +3.8% accuracy; iterative refinement +2.1%

**Faultline relevance:** The token cost framework is directly applicable — how many tokens does a Faultline debate consume vs. a single Sonnet call? Is the quality gain proportional? D3's approach of measuring deliberation value via controlled ablation (remove debate rounds, measure accuracy drop) is implementable.

---

## 3. What's Missing in the Literature (Gaps)

### 3a. No "Crux Novelty" Metric Exists
No paper defines a metric for whether a debate produced an argument or distinction that a single model wouldn't have generated. The closest proxies are:
- PRISM's Novelty Insight Score (domain: scientific hypotheses)
- NoveltyBench's Distinct-k (domain: open-ended QA)
- Research ideation's Non-Duplicate Ratio

None are designed for political/social debate with defined personas.

### 3b. No Debate vs. o1/o3 Comparison
No published paper as of early 2026 directly compares multi-agent debate against o1/o3/o4-mini reasoning models. Given that reasoning models use extended internal chain-of-thought, they effectively implement a form of self-debate. This is a genuine research gap.

### 3c. Open-Ended Debate Has No Ground Truth
All well-measured benchmarks (GSM8K, MMLU, logic puzzles) have verifiable ground truth. Faultline's debates on political/social topics have no ground truth — making all accuracy-based metrics inapplicable. The literature has no strong answer for how to measure debate quality in this regime.

---

## 4. Actionable Metrics for Faultline

### Tier 1: Immediately Implementable (No New Infrastructure)

**A. Position Stability Index (PSI)**
- After each crux exchange, check: did persona's stated position change?
- Track direction: moved toward opponent (sycophancy signal) or maintained/sharpened (genuine reasoning signal)
- Implementation: compare crux room opening position statement to closing position statement via embedding cosine similarity + LLM judge
- Higher PSI = less sycophantic debate

**B. Argument Transition Matrix**
- Adapted from Wu et al. 2511.07784
- Four cells: (Persona A position) × (Persona B position) at start vs. end of crux room
  - Both unchanged: genuine impasse (good — crux identified)
  - One changed toward other: sycophancy risk
  - Both changed toward each other: premature convergence
  - Both changed away from each other: debate sharpened disagreement (best outcome)

**C. Crux Non-Duplication Rate**
- For each new crux card, compute cosine similarity against all previous crux cards
- If similarity > threshold (e.g. 0.85), flag as duplicate disagreement
- Tracks whether debate surfaces genuinely new dimensions of disagreement vs. recycling the same crux

**D. Claim Groundedness Score**
- For each claim made in crux exchange, check: did persona cite their contract's known positions, or make an unsubstantiated assertion?
- Haiku call: "Is this claim grounded in the persona's established position, or is it a new unsubstantiated assertion?" (binary)
- Low groundedness = hallucination risk

### Tier 2: Moderately Complex (Requires Post-Debate Processing)

**E. Collective Delusion Detector**
- After crux room: did both personas ultimately agree on a factual claim?
- If yes: check whether that claim is well-substantiated (not just mutual assertion)
- Haiku call: "Both personas agreed on [X]. Rate the epistemic quality of the evidence provided (1-4)."
- Score 1-2 = Collective Delusion; score 3-4 = genuine convergence

**F. Distinct-k for Crux Cards**
- Generate multiple crux room runs on same disagreement (if budget allows)
- Count how many distinct crux formulations emerge (using embedding clustering)
- Single distinct crux across k runs = the debate reliably identifies the core disagreement
- High k with low distinct count = the crux is real and stable (good)

**G. Information Gain Proxy**
- Before debate: ask Sonnet "what are the likely points of disagreement between [Persona A] and [Persona B] on [topic]?"
- After debate: compare actual crux cards to predicted disagreements via cosine similarity
- Low similarity between prediction and actual crux = debate found something unexpected (high epistemic value)
- High similarity = debate confirmed what was already predictable (low epistemic value)

### Tier 3: Aspirational (Research-Grade)

**H. Persona Heterogeneity Score**
- Before debate: measure cosine similarity between the two persona contracts' position embeddings on the topic
- High initial similarity → debate will likely produce Hivemind effect (both already agree)
- Low initial similarity → debate has genuine diversity to surface
- This predicts debate value before running it

**I. Rationality Score for Position Changes**
- Adapted from Wu et al.'s external judge approach
- When persona changes position during crux exchange, have Haiku rate the causing argument (1-4 rationality scale)
- Score 1-2 = social pressure change; score 3-4 = argument-driven change
- Track "rationality-weighted position change rate"

---

## 5. The Core Verdict for Faultline

**The fundamental challenge:** Academic MAD benchmarks measure accuracy on tasks with verifiable ground truth. Faultline debates have no ground truth. This means:

1. You cannot measure whether debate "got the right answer"
2. You CAN measure: argument quality, position stability, crux novelty, groundedness, and convergence dynamics
3. The most honest metric for "was this debate worth running?" is the **Information Gain Proxy** (G above) — did the debate surface disagreements that weren't predictable from the persona contracts alone?

**The Artificial Hivemind threat is real for Faultline:** Two Claude Sonnet instances, even with different persona prompts, will exhibit strong inter-model homogeneity. The persona contracts are the primary mechanism that differentiates them — making contract quality the most important lever for debate value, not the debate mechanics themselves.

**Self-consistency as the right baseline for Faultline:** A fair comparison is: single Sonnet call with persona A's contract + a single Sonnet call with persona B's contract → compare to the full dialogue+crux. If the crux room produces the same categories of disagreement that were already expressed in the opening statements, the crux mechanics added no epistemic value.

---

## 6. Sources

- [Can LLM Agents Really Debate? (arxiv 2511.07784)](https://arxiv.org/abs/2511.07784)
- [DEBATE Benchmark (arxiv 2510.25110)](https://arxiv.org/abs/2510.25110)
- [Debate or Vote (arxiv 2508.17536, NeurIPS 2025 Spotlight)](https://arxiv.org/abs/2508.17536)
- [Stop Overvaluing Multi-Agent Debate (arxiv 2502.08788)](https://arxiv.org/abs/2502.08788)
- [M3MAD-Bench (arxiv 2601.02854)](https://arxiv.org/abs/2601.02854)
- [ArgLLMs / Argumentative LLMs (arxiv 2405.02079, AAAI 2025)](https://arxiv.org/abs/2405.02079)
- [Moltbook (arxiv 2602.14299)](https://arxiv.org/abs/2602.14299)
- [Artificial Hivemind (NeurIPS Best Paper 2025, OpenReview)](https://openreview.net/forum?id=saDOrrnNTz)
- [PRISM (arxiv 2602.21317)](https://arxiv.org/abs/2602.21317)
- [NoveltyBench (arxiv 2504.05228)](https://arxiv.org/abs/2504.05228)
- [Research Ideation Multi-Agent SIGDIAL 2025 (arxiv 2507.08350)](https://arxiv.org/abs/2507.08350)
- [D3 Cost-Aware Debate Framework (arxiv 2410.04663)](https://arxiv.org/abs/2410.04663)
- [Talk Isn't Always Cheap: Failure Modes (arxiv 2509.05396)](https://arxiv.org/abs/2509.05396)
- [Value of Variance (arxiv 2602.07186)](https://arxiv.org/abs/2602.07186)
- [Multi-LLM Debate ICLR Blog 2025](https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/)
