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

## High-Authority Sources for This Domain
- arXiv cs.AI / cs.CL / cs.MA for preprints
- ACL Anthology (aclanthology.org) for NLP/argument mining papers
- Semantic Scholar for author/venue verification
- TechXplore for recent paper news coverage
- OpenReview for conference submission status
- Science Advances / Nature Scientific Reports for interdisciplinary AI-social-science papers
