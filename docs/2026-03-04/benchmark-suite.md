# CIG Benchmark Suite

The Crux Identification & Grounding (CIG) benchmark measures whether structured disagreement extraction improves assumption discovery. It runs the same task through 4 conditions and compares outputs. **No ground-truth scoring** — the human decides which assumptions are most useful.

## Conditions

| Condition | Method | Description |
|-----------|--------|-------------|
| `single` | One model adopts all roles, synthesizes crux | Single prompt, role-voiced analysis |
| `cot` | Same as single with chain-of-thought prompting | Deeper reasoning, same structure |
| `dialogue` | **Real dialogue system** (`runDialogue()`) with synthetic personas | Full panel debate with disagreement detection and crux rooms |
| `belief-graph` | QBAF extraction → structural diff → belief revision → community graph → structural crux | Graph-based structural analysis |

### Dialogue Condition (v2)

The dialogue condition now runs the **real dialogue system** (`lib/dialogue/orchestrator.ts`), not a fake parallel-generate pipeline. It:
1. Builds synthetic personas from task roles via `buildSyntheticPersona()`
2. Passes them to `runDialogue()` using `preloadedPersonas` (bypasses file-based loading)
3. Collects real SSE events: opening statements, aspect-round takes, disagreement detection, crux rooms
4. Extracts assumptions from crux cards + closing messages

## What the benchmark measures automatically

- **Assumption count** per condition
- **DFS (Decision Flip Score)** on first 5 extracted assumptions — self-consistency check (does flipping the assumption change the conclusion?)
- **Token usage** (input + output) per condition
- **Tokens per assumption** — cost normalization
- **Overlap analysis** — shared assumptions across conditions, unique-to-each, pairwise counts (approximate token matching at 60% threshold)
- **Structural metrics** (when `VOYAGE_API_KEY` available):
  - Semantic spread: per-round cosine distance between personas (convergence slope)
  - Crux grounding: cosine similarity of crux card embedding to source messages
  - Stance diversity: opening vs closing embedding distance delta

## What the benchmark leaves to humans

- Which condition's assumptions are most insightful
- Whether unique assumptions are genuinely novel or just differently worded
- Quality of crux hinge questions
- Overall usefulness for decision-making

The UI supports a **blind mode** toggle that hides condition names (shows "Condition A/B/C/D") for unbiased comparison.

## Running

```bash
cd faultline

# All tasks, all conditions
npm run cig-v2

# Single task
npm run cig-v2 -- --task hbm-pricing

# Single task + condition
npm run cig-v2 -- --task hbm-pricing --condition single
```

## Output files

- `data/benchmarks/cig-results/{taskId}-v2.json` — full structured result per task
- `data/benchmarks/{taskId}-comparison.md` — human-readable comparison table
- `data/benchmarks/cig-results/_summary-v2.json` — aggregate stats across tasks

## UI

- `/benchmarks` — list of all benchmark results
- `/benchmarks/{taskId}` — detail view with metrics table, side-by-side assumptions (with blind toggle), crux cards, overlap analysis

## Tasks

5 tasks defined in `data/benchmarks/cig-tasks.json`:

| ID | Topic | Category |
|----|-------|----------|
| `hbm-pricing` | HBM pricing sustainability through 2028 | semiconductor |
| `btc-treasury` | Bitcoin as corporate treasury reserve | crypto |
| `ai-scaling-laws` | Transformer scaling law continuation | ai |
| `energy-transition` | US grid capacity for AI data centers by 2030 | climate-energy |
| `ai-job-displacement` | AI automation of 30%+ white-collar work in 5 years | ai-economics |

Each task defines 4 expert roles. No ground-truth assumptions — the human evaluates output quality.

## Architecture

```
lib/benchmark/
  cig-conditions.ts  — condition runners (single, cot, dialogue, belief-graph)
  cig-scoring.ts     — DFS scoring only (self-consistency, no ground truth)
  types.ts           — type definitions (ConditionResultV2, StructuralMetrics, etc.)
  overlap.ts         — assumption overlap analysis (pure token matching, no LLM)
  metrics.ts         — embedding-based structural metrics (semantic spread, crux grounding, stance diversity)

scripts/
  run-cig-benchmark-v2.ts  — benchmark runner

app/benchmarks/
  page.tsx           — list page
  [taskId]/page.tsx  — detail page with metrics, comparison table, crux cards, overlap

components/benchmark/
  ComparisonTable.tsx — responsive side-by-side assumptions table with blind toggle
```
