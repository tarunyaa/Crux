# Research Analyst Memory

## Project Context
- Paper: "Crux: AI Agent Personas Debate to Reveal Disagreement Maps"
- Paper lives at: `C:\Users\tarun\code\Faultline\Faultline\paper\`
- Sections in: `C:\Users\tarun\code\Faultline\Faultline\paper\sections\`
- References: `C:\Users\tarun\code\Faultline\Faultline\paper\references.bib`
- Source notes: `C:\Users\tarun\code\Faultline\Faultline\paper\source_notes.md`

## LaTeX Conventions (from main.tex)
- System name macro: `\cruxname{}` (NOT `\crux`) — renders as \textsc{Crux}
- Open question macro: `\openq{text}` — renders in MidnightBlue italic bold
- Hypothesis macro: `\hyp{text}` — renders in OliveGreen italic bold
- Todo macro: `\todo{text}` — renders in BrickRed bold
- Citation style: natbib round parentheses; use `\citet{}` for inline, `\citep{}` for parenthetical
- Table style: booktabs (`\toprule`, `\midrule`, `\bottomrule`) + `tabularx` available

## Verified Citation Keys (references.bib is fully populated by Search Specialist)
- `freemad` — Cui et al. 2025, arXiv:2509.11035
- `debate_benchmark` — Chuang et al. 2025, arXiv:2510.25110, NeurIPS SEA workshop
- `llm_agents_really_debate` — Wu et al. 2025, arXiv:2511.07784
- `premise_left_unsaid` — Ku et al. 2025, ArgMining 2025 (ACL), pp. 58-73
- `merage` — Chen & Tan 2025/26, ICSI 2025, LNCS vol. 16011, Springer
- `rdebater` — Li et al. 2025/26, arXiv:2512.24684, AAMAS 2026
- `exact` — Yu et al. 2024/25, arXiv:2410.02052, ICLR 2025
- `kimura_humanlike` — UNVERIFIED (surnames only: Kimura, Fukuda, Tahara, Se; ~2025, Zenodo)
- `moltbook` — Li et al. 2026, arXiv:2602.14299

## Key Findings for Future Research
- FREE-MAD establishes anti-conformity as a design primitive; agents drift toward consensus by default
- DEBATE benchmark (2510.25110) shows LLM agents over-converge vs humans across 107 topics
- Moltbook (2602.14299) is the primary evaluation framework inspiration: agents show high inertia at scale
- R-Debater (2512.24684) uses ORCHID dataset; published at AAMAS 2026
- ExACT is ICLR 2025, Microsoft Research; uses MAD as internal state evaluator inside MCTS
- Kimura et al. paper is hard to find — covered by TechXplore Feb 2026; Zenodo DOI reportedly 10.5281/zenodo.17586536

## Additional Citation Keys (references_additional.bib — verified by Search Specialist)
- `llm_argmining_survey` — arXiv:2506.16383, anonymous preprint (authors UNVERIFIED)
- `scalable_delphi_2025` — Lorenz & Fritz, arXiv:2602.08889
- `silicon_crowd_2024` — Schoenegger et al., Science Advances 2024, arXiv:2402.19379
- `degroot_1974` — DeGroot, JASA 1974, doi:10.1080/01621459.1974.10480137
- `friedkin_johnsen_1990` — Friedkin & Johnsen, J. Math. Sociology 1990
- `opinion_dynamics_llm_2024` — Chuang et al., NAACL 2024 Findings, arXiv:2311.09618
- `echo_chambers_llm_2024` — Wang et al., COLING 2025, arXiv:2409.19338
- `memgpt_2023` — Packer et al., arXiv:2310.08560
- `generative_agents_2023` — Park et al., UIST 2023, arXiv:2304.03442
- `persona_survey_2024` — Chen et al., TMLR 2024, arXiv:2404.18231
- `mixture_of_agents_2024` — Wang et al., arXiv:2406.04692
- `mad_factuality_2024` — Du et al., ICML 2024, arXiv:2305.14325
- `liang_mad_2024` — Liang et al., EMNLP 2024, arXiv:2305.19118
- `irving_debate_2018` — Irving, Christiano, Amodei, arXiv:1805.00899
- `constitutional_ai_2022` — Bai et al., arXiv:2212.08073
- `llm_judge_2023` — Zheng et al., arXiv:2306.05685
- `partisan_crowds_2023` — Chuang et al., arXiv:2311.09665

## Section 10 Key Findings (for future reference)
- Q-numbers for addendum begin at Q30 (09_open_questions.tex implicitly ends at Q29)
- Five top architectural inflection points: (1) external belief state, (2) defeat-memory propagation graph, (3) citation verification layer, (4) anti-conformity at dialogue layer, (5) Phase-5 faithfulness verifier
- Crux room is structurally an "inverted Delphi" — this framing is a useful positioning differentiator
- Sycophancy (B2) and performative debate (B1) are the two highest-severity failure modes
- Bounded confidence models (Deffuant/HK) predict non-engagement as rational behavior between distant personas
- arXiv:2602.12583 (opinion dynamics + LLM dialog, 2026) formalises LLM dialogue as DeGroot update

## New Citation Keys (from HumanLM + RL-Epistemics research session)
- `humanlm` — Wu et al. 2026, Stanford; title "HUMANLM: Simulating Users with State Alignment Beats Response Imitation"; humanlm.stanford.edu; arXiv ID NOT YET CONFIRMED (paper is ~2026, not indexed)
- `userlm_r1` — arXiv:2601.09215, Jan 2026; "UserLM-R1: Modeling Human Reasoning in User Language Models with Multi-Reward Reinforcement Learning"
- `humanlm_personas_rl` — arXiv:2511.00222, NeurIPS 2025; "Consistently Simulating Human Personas with Multi-Turn Reinforcement Learning"; Abdulhai, Cheng, et al. — reduces persona inconsistency by 55%+ via RL reward signals
- `her_roleplay` — arXiv:2601.21459, Jan 2026; "HER: Human-like Reasoning and Reinforcement Learning for LLM Role-playing"; dual-layer thinking (first-person character vs third-person LLM)
- `deepseekmath_grpo` — arXiv:2402.03300, DeepSeek 2024; original GRPO paper; GRPO removes critic/value model, estimates baseline from group scores (64 samples per question)
- `deepseek_r1` — arXiv:2501.12948, Jan 2025; DeepSeek-R1; GRPO with accuracy + format rewards; AIME 2024 pass@1 from 15.6% to 71%
- `smart_sycophancy` — arXiv:2509.16742, EMNLP 2025; "SMART: Sycophancy Mitigation Through RL with Uncertainty-Aware Adaptive Reasoning Trajectories"; UA-MCTS + progress-based RL
- `j1_judge` — arXiv:2505.10320, 2025; "J1: Incentivizing Thinking in LLM-as-a-Judge via Reinforcement Learning"; GRPO on judgment tasks; beats o1-mini/o3/DeepSeek-R1-671B on some benchmarks
- `coconut_latent` — arXiv:2412.06769, Facebook Research / Meta; "Training Large Language Models to Reason in a Continuous Latent Space"; continuous thought tokens fed back as embeddings; outperforms CoT on logical planning
- `arg_sycophancy_emnlp` — ACL Anthology 2025.findings-emnlp.1241; "Echoes of Agreement: Argument Driven Sycophancy in Large Language models"; sycophancy scales with argument strength
- `scalable_oversight_neurips2024` — arXiv:2407.04622, NeurIPS 2024; "On scalable oversight with weak LLMs judging strong LLMs"; debate vs consultancy vs direct QA

## HumanLM Technical Details (confirmed from source notes + web)
- Training step 1: GRPO applied; LLM compares batch of generated latent states per dimension vs ground-truth response; assigns alignment scores; policy pushed toward latent states that predict observed response
- Training step 2: Given aligned latent state, model generates reasoning trace integrating latent state + context, then synthesises final response
- Latent state dimensions in user-sim context: stance, emotion, communication style (NOT epistemic dimensions — this is the adaptation gap for Crux)
- Key insight: "state alignment beats response imitation" — surface-matching fails to capture underlying epistemic state

## GRPO Technical Details (confirmed from DeepSeekMath paper)
- GRPO vs PPO: eliminates critic/value model; baseline estimated from group scores of G sampled outputs
- Advantage for output i: A_i = (r_i - mean(r)) / std(r) where r is reward over the group
- KL penalty between policy and reference model included in loss
- Hyperparams from DeepSeekMath: lr=1e-6, KL coeff=0.04, 64 outputs sampled per question, max_len=1024

## Multi-Agent Memory Architecture Research (surveyed Feb 2026)
- Five canonical patterns: (1) raw transcript / chat-history array, (2) blackboard shared state, (3) memory stream + importance retrieval (Generative Agents), (4) structured KG (Zep/AriGraph), (5) memory blocks with virtual paging (MemGPT/Letta)
- Zep (arXiv:2501.13956): temporal KG, bi-temporal edges, hybrid BM25+embedding+graph retrieval; outperforms MemGPT on Deep Memory Retrieval benchmark (94.8% vs 93.4%)
- A-MEM (arXiv:2502.12110, NeurIPS 2025): Zettelkasten-style linked memory nodes with auto-linking on insert
- AriGraph (arXiv:2407.04363, IJCAI 2025): semantic+episodic KG for partially observable environments
- CoALA (arXiv:2309.02427, TMLR 2024): canonical taxonomy — working, episodic, semantic, procedural memory
- MetaGPT shared message pool: publish-subscribe with agent subscription filters (avoids info overload)
- Generative Agents retrieval scoring: recency (exponential decay) + LLM-assigned importance (1-10) + cosine similarity
- Key debate-memory gap: existing frameworks track conversation history, NOT structured belief/position state per agent — Crux's ContestedClaim + PositionShift types partially address this
- Claude Code memory hierarchy: managed policy > project CLAUDE.md > .claude/rules/*.md > user CLAUDE.md > CLAUDE.local.md > auto memory; MEMORY.md first 200 lines loaded into system prompt
- Faultline current approach: raw DialogueMessage[] array passed as context text to each agent turn (no retrieval, no compression) — scales poorly past ~40 messages

## Latent Belief States Research (March 2026 session)
- True latent-space debate (Coconut arXiv:2412.06769, LatentMAS arXiv:2511.20639) requires HF model weight access — INCOMPATIBLE with Claude API
- ECON (arXiv:2506.08292, ICML 2025): LLMs stay black-box API; belief states in separate trainable BeliefNetwork (DQN Q-values + QMIX + BeliefEncoder); 11.2% improvement math tasks; BNE may converge to sycophancy in opinion debate
- CoBel-World (arXiv:2509.21981): PDDL-inspired symbolic belief world; Bayesian collaboration protocol; fully API-compatible; 64-79% comms reduction; zero fine-tuning
- API-compatible "latent belief space" = proposition confidence vectors c(P_i) ∈ [0,1] per persona; debate trajectory in R^n; crux = argmax |c_A(P) - c_B(P)|
- No clean universal scaling law for multi-agent debate exists. Best framing: debate scales with agent diversity and topic difficulty, not raw count
- MacNet (arXiv:2406.07155, ICLR 2025): logistic scaling with 1000+ agents; irregular topologies win
- Law of Multi-Model Collaboration (arXiv:2512.23340): power law over total parameters; diversity is primary driver
- MAD as Test-Time Scaling (arXiv:2505.22960): conditional — harder tasks + weaker models benefit most
- DEBATE benchmark (arXiv:2510.25110): LLMs over-converge vs humans — anti-conformity is required

## Generative Agents Deep Dive (Park et al. 2023) — Key Technical Facts
- Citation key: `generative_agents_2023` — Park et al., UIST 2023, arXiv:2304.03442
- Codebase: github.com/joonspk-research/generative_agents (public)
- Memory node type: `ConceptNode` — fields: node_id, node_count, type_count, type (event/thought/chat), depth, created, expiration, last_accessed, s/p/o triple, description, embedding_key, poignancy (1-10 int), keywords, filling
- Three memory sequences: seq_event, seq_thought, seq_chat (maintained separately)
- Retrieval formula (paper): score = α_recency·recency + α_importance·importance + α_relevance·relevance (paper says all α=1)
- Retrieval formula (CODE): score = recency_w·recency·gw[0] + relevance_w·relevance·gw[1] + importance_w·importance·gw[2] where gw=[0.5, 3, 2] — relevance most heavily weighted in practice
- recency_decay in code = 0.99 (paper says 0.995 — DISCREPANCY between paper and code)
- importance_trigger_max = 150 (reflection fires when importance sum accumulates to 150)
- Retrieval returns top 30 nodes by default (n_count=30 in new_retrieve)
- Reflection: generates 3 focal questions from last importance_ele_n memories, retrieves with those as queries, generates 5 insights with evidence citations like "insight (because of 1, 5, 3)"
- Contradiction handling: NONE. The memory stream is append-only. Old contradicted memories remain and may get retrieved. No consistency checking exists.
- Agent perception of others: SPO triple stored as (AgentName, is_doing, action_description); chats stored as separate chat nodes; relationship summary generated on-demand via LLM from retrieved keyword-indexed memories
- Context assembly for agent chat: 50 memories retrieved about target agent, narrowed to 15; relationship summary generated; agent's current status + retrieved ideas assembled into prompt
- Agent identity fields: name, age, innate (fixed traits), learned (acquired knowledge), currently (dynamic status updated daily), lifestyle, living_area
- Genagents (2024 follow-up, arXiv:2411.10109): same authors, 1000 real people simulation; memory node adds pointer_id for source links; importance stored as float not int
- Key architectural gap for Crux: Generative Agents has NO explicit belief state, NO contradiction detection, NO structured position tracking — memory is flat append-only log

## Blackboard Architecture for Debate (researched Feb 2026)
- Classical blackboard: 3 components — data structure (hierarchical levels of hypothesis nodes), knowledge sources (condition+action pairs, no direct inter-KS communication), scheduler (evaluates all KS triggers, selects highest-priority KSI)
- Hearsay-II hypothesis schema: {level, content, time_span, credibility, status, created_by, supported_by, supports}
- BB1 (Hayes-Roth 1985): meta-level control via separate control blackboard; scheduling strategy is itself a blackboard problem
- LbMAS (arXiv:2510.01285): split β (primary requests) / βr (responses isolated) — prevents cascading corruption; voluntary agent participation
- 2507.01701: five meta-agents (Planner, Expert, Critic, Conflict-Resolver, Decider, Cleaner); public space + private bilateral spaces; ablation: removing Control Unit = +270% tokens; soft-deletion worse than hard deletion
- MetaGPT message pool is NOT a blackboard — append-only filtered event log with pre-registered subscriptions; no opportunistic observation
- Dung AF as debate blackboard: {arguments, attacks, positions, labelling}; labelling (IN/OUT/UNDEC) computed by orchestrator, never self-reported by agents
- Faultline's DebateContext = orchestrator-held partial blackboard; agents only get string serialization; never observe board state directly
- Key design principle: agents write content (DialogueMessage), orchestrator writes structure (argument nodes, position_per_persona) — eliminates gaming vector
- Compaction stack: (1) replace raw round messages with RoundSummary in agent context, (2) deduplicate repeated claims, (3) prune resolved claims from active context, (4) persona-targeted context assembly
- Crux room = private bilateral space in blackboard terminology — correctly implemented in Faultline

## Belief Graph / Structured Argumentation Citation Keys (Feb 2026 session)
- `arigraph` — Anokhin et al. 2024/25, arXiv:2407.04363, IJCAI 2025; semantic+episodic KG world model for LLM agents; markedly outperforms memory baselines on text games
- `rog_iclr2024` — Luo, Li, Haffari, Pan 2024, arXiv:2310.01061, ICLR 2024; "Reasoning on Graphs: Faithful and Interpretable LLM Reasoning"; planning-retrieval-reasoning via KG relation paths
- `mindmap_acl2024` — Wen, Wang, Sun 2024, arXiv:2308.09729, ACL 2024; "MindMap: Knowledge Graph Prompting Sparks Graph of Thoughts in LLMs"; KG → elicits mind map of ontology-grounded reasoning
- `zep_2025` — Rasmussen et al. 2025, arXiv:2501.13956; temporal KG architecture for agent memory; bi-temporal edges; 94.8% vs 93.4% on Deep Memory Retrieval benchmark
- `cobel_world` — Wang et al. 2025, arXiv:2509.21981; "CoBel-World: Collaborative Belief Reasoning with LLMs"; symbolic belief world + Bayesian-style belief updates; 64-79% comms cost reduction
- `econ_bayes_icml2025` — Yi et al. 2025, ICML 2025, arXiv:2506.08292; "From Debate to Equilibrium: Belief-Driven Multi-Agent LLM Reasoning via Bayesian Nash Equilibrium"; 11.2% avg improvement over 6 benchmarks
- `argrag_2025` — Zhu et al. 2025, arXiv:2508.20131; "ArgRAG: Explainable RAG using Quantitative Bipolar Argumentation"; QBAF replaces black-box neural inference; strong on PubHealth, RAGuard
- `arg_explanation_agents_2025` — Cakar & Kristensson 2025, IAAI-26, arXiv:2510.03442; "The Argument is the Explanation: Structured Argumentation for Trust in Agents"; Bipolar ABA; 94.44 macro F1; hallucination detection via fact-claim contradiction
- `llm_aspic_ecai2025` — Fang, Li, Chen, Liao 2025, ECAI 2025; "LLM-ASPIC+: A Neuro-Symbolic Framework for Defeasible Reasoning"; 87.1% on BoardGameQA-2; MineQA dataset
- `belief_graph_reasoning_zones` — Nikooroo & Engel 2025, arXiv:2510.10042; "Belief Graphs with Reasoning Zones"; directed signed weighted graph; contradiction-tolerant reasoning zones via parity-based coloring
- `graph_belief_model` — Nikooroo 2025, arXiv:2508.03465; "Toward a Graph-Theoretic Model of Belief"; nodes=beliefs, edges=support/contradiction; separates credibility from confidence
- `grounding_llm_kg_2025` — Amayuelas et al. 2025, arXiv:2502.13247; "Grounding LLM Reasoning with Knowledge Graphs"; CoT/ToT/GoT on GRBench; 26.5%+ improvement over CoT
- `arg_conflict_resolution_2024` — Li, Fang et al. 2024, arXiv:2412.16725; "Enhancing Conflict Resolution in LMs via Abstract Argumentation"; fine-tune on Dung AF explanations; self-explanation > CoT > QA training
- `dialogue_arg_explanation_2025` — Ho & Schlobach 2025, arXiv:2502.11291; "Dialogue-based Explanations for Logical Reasoning using Structured Argumentation"; dialectical proof trees for inconsistent KBs
- `dung_1995` — Dung 1995, Artificial Intelligence 77:321-357; foundational abstract argumentation framework; AF = (A, R) directed graph; grounded/preferred/stable semantics
- `aspic_plus` — Modgil & Prakken 2014, Argument & Computation 5(1):31-62; "The ASPIC+ Framework for Structured Argumentation"; structured arguments with strict/defeasible rules over Dung AFs
- `thinking_with_kg_2024` — Wu & Tsioutsiouliklis 2024, arXiv:2412.10654; "Thinking with Knowledge Graphs: Enhancing LLM Reasoning Through Structured Data"; KG represented as programming language; fine-tuned LLMs on KG structures

## Benchmark Research Session (March 1, 2026) — Key Findings
- Moltbook formal metrics: Birth Rate `R_birth^(n)(t) = |ℬ_t^(n)| / |𝒜_t^(n)|`; Individual drift `D_a = 1 - cos(𝐜_a^(early), 𝐜_a^(late))`; Interaction influence `Δ_interact = S(𝒲_post, 𝐯*) - S(𝒲_pre, 𝐯*)`; dataset ~290K posts, ~1.8M comments, ~39K agents
- DEBATE benchmark (arXiv:2510.25110): ΔSD = `SD_final - SD_init` over 6-point Likert stances; humans ΔSD≈0, LLMs strongly negative (over-convergence proven)
- NoveltyBench (arXiv:2504.05228): `distinct_k = |{c_i | i ∈ [k]}|`; frontier models: <4 distinct outputs per 10 queries; larger models = less diverse
- RECAP/GenMinds (arXiv:2506.06958): POSITION PAPER ONLY — no code, no data, no computable formulas; do not implement; useful only as vocabulary
- LaMP (arXiv:2304.11406): tests stylistic personalization, NOT epistemic reasoning — low priority for Faultline core claims
- ToM benchmarks: deferred until belief graph + belief state tracking is implemented
- Proposed benchmark suite: Tier 1 = ΔSD + homogenization score + CCR + H; Tier 2 = CRR + argument centrality + drift magnitude; Tier 3 = interaction influence + traceability + counterfactual
- Scaling law framing: crux rooms should achieve high CCR without sacrificing ΔSD (diversity-resolution frontier)
- Full analysis: `docs/research_benchmarks.md`

## Belief Graph + Argumentation Research Session (March 1, 2026)
- `argllms_aaai2025` — Freedman, Dejl, Gorur, Yin, Rago, Toni; AAAI 2025; arXiv:2405.02079; "Argumentative LLMs for Explainable and Contestable Claim Verification"; QBAF + DF-QuAD pipeline; public code: github.com/CLArg-group/argumentative-llms
- `genminds` — Li et al., MIT Media Lab, NeurIPS 2025 position paper; arXiv:2506.06958; "Simulating Society Requires Simulating Thought"; NO CODE, NO DATA — manifesto only; CBN schema usable, do-calculus unimplementable
- `prism_pluralistic` — arXiv:2602.21317, Feb 2026; "Shared Nature, Unique Nurture: PRISM for Pluralistic Reasoning"; on-the-fly epistemic graphs via stochastic seeds + cognitive operators; designed for diversity NOT persona fidelity
- `causalrag` — Wang et al., ACL Findings 2025; arXiv:2503.19878; "CausalRAG: Integrating Causal Graphs into Retrieval-Augmented Generation"; validates text→causal graph extraction for retrieval
- `kggen` — arXiv:2502.09956; "KGGen: Extracting Knowledge Graphs from Plain Text"; entity clustering reduces sparsity in LLM-extracted KGs

## Key Architectural Conclusions (Belief Graphs)
- GenMinds is unimplementable: no code, no RECAP data, no CPDs for do-calculus; take the schema only
- PRISM's stochastic seeds break persona consistency — adaptation needed: replace random seeds with belief graph nodes
- ArgLLMs QBAF pipeline maps directly to Faultline crux card extraction — best actionable paper in this domain
- LLM-ASPIC+ too brittle for open-ended debate text (rule extraction fails); good for structured domains
- Offline corpus belief graph extraction is the right MVP path: ~$0.20/persona, runs once, clearly scoped
- QBAF cycle problem (A attacks B attacks A): Belief Graphs with Reasoning Zones (2510.10042) addresses via parity-based coloring
- text→graph extraction is validated (CausalRAG, KGGen); graph→text→graph UPDATE loop is NOT validated by any paper — Faultline must build its own update logic
- Dung AF too coarse for crux extraction: labels IN/OUT/UNDEC but doesn't explain WHY; QBAF is better fit

## QBAF + ArgLLM Technical Keys (March 1, 2026 session)
- `argllms_aaai2025` — already in memory (AAAI 2025, arXiv:2405.02079)
- `argora` — arXiv:2601.21533, Jan 2026; "ARGORA: Orchestrated Argumentation for Causally Grounded LLM Reasoning"; uses counterfactual edge-impact Δ_edge(x;m) = σ(m) - σ^⊖x(m); parallel expert trees, NO merge
- `marge_2025` — arXiv:2508.02584, 2025; "MArgE: Meshing Argumentative Evidence from Multiple LLMs"; semantic merge via sentence-transformer cosine ρ=0.85; 77.4% MedClaim accuracy
- `argrag_2025` — already in memory (arXiv:2508.20131); uses QE semantics (handles cycles); ArgRAG outperforms all RAG baselines PubHealth 0.838-0.898
- `ce_qarg_kr2024` — arXiv:2407.08497, KR 2024; "CE-QArg: Counterfactual Explanations for QBAF"; polarity analysis (path parity) + priority (1/min_path_length) + iterative ε-step update; cost = L_p(τ, τ*)
- `qbaf_change_explanations` — arXiv:2509.18215; "Change in QBAF: Sufficient, Necessary, Counterfactual Explanations"; strength inconsistency = change in partial order over strengths
- `contestability_qarg` — arXiv:2507.11323; "Contestability in Quantitative Argumentation"; framework for stakeholder challenges to QBAF verdicts
- `dynamic_collective_arg_2024` — IJAR vol.173 (2024), ScienceDirect; revision+contraction operators for collective AFs; satisfies AGM postulates
- `mpaq_acl2025` — ACL 2025 Long Paper; "A Multi-persona Framework for Argument Quality Assessment"; coarse-to-fine scoring; outperforms on IBM-Rank-30k and IBM-ArgQ-5.3k
- `perspectivist_aq_naacl2025` — NAACL 2025 Long, ACL Anthology 2025.naacl-long.382; "Towards a Perspectivist Turn in Argument Quality Assessment"; non-aggregated annotations for diversity

## QBAF Technical Details (confirmed formulas)
- DF-QuAD aggregation: F(v₁,...,vₙ) = 1 - ∏(1-vᵢ) for n≥1, else 0
- DF-QuAD combination: if vₐ>vₛ → σ=v₀-v₀|vₛ-vₐ|; if vₐ<vₛ → σ=v₀+(1-v₀)|vₛ-vₐ|; if equal → σ=v₀
- QE update: σ(a) ← β(a) + (1-β(a))·h(E(a)) - β(a)·h(-E(a)) where E(a)=Σσ(supporters)-Σσ(attackers), h(x)=max(x,0)²/(1+max(x,0)²)
- CE-QArg: polarity via path-parity DFS; priority=1/min_path_length; step ε≈0.01; perturbation h≈0.001
- Crux localization: crux_score(α) = |τ_A(α)·Δ_edge_A(α;root) - τ_B(α)·Δ_edge_B(α;root)|
- ArgLLMs 4 variants: depth×{1,2} × base_score×{neutral(0.5),estimated}; depth=2+estimated = best
- MArgE pipeline: K BAFs → semantic merge (cosine>0.85) → score nodes → DF-QuAD → verdict
- ARGORA does NOT merge QBAFs — maintains parallel expert trees, uses orchestrator judgment

## High-Authority Sources for This Domain
- arXiv cs.AI / cs.CL / cs.MA for preprints
- ACL Anthology (aclanthology.org) for NLP/argument mining papers
- Semantic Scholar for author/venue verification
- TechXplore for recent paper news coverage
- OpenReview for conference submission status
- Science Advances / Nature Scientific Reports for interdisciplinary AI-social-science papers
- letta.com/blog for MemGPT/Letta architecture details
- getzep.com/content/files/... for Zep KG paper PDF
