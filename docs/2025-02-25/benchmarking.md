# Faultline Benchmarking & Evaluation

How debate quality is measured in Faultline — what's implemented, what's planned, and where the code lives.

---

## Evaluation Framework (Three Levels)

Defined in `docs/crux_overview.md` § 8. Three tiers of metrics measuring whether debates do useful epistemic work:

### Society Level — Does the debate compress disagreement?

| Metric | Formula | Status |
|--------|---------|--------|
| **Disagreement Entropy (H)** | `−Σ p_i · ln(p_i)` over disagreement type distribution | ✅ Implemented |
| **Crux Compression Rate (CCR)** | `resolved_cruxes / total_cruxes` (target ≥ 50%) | ✅ Implemented |
| **Argument Graph Diameter** | Reduction in structural complexity | ❌ Not implemented |

### Agent Level — Do agents update beliefs meaningfully?

| Metric | Description | Status |
|--------|-------------|--------|
| **Structural Drift** | How much an agent's belief set changes over a session | ❌ Placeholder |
| **Directional Coherence** | Whether belief updates align along shared crux axes | ❌ Placeholder |
| **Attack Influence Delta** | Causality between argumentative defeats and revisions | ❌ Placeholder |

### Collective Level — Do patterns emerge across sessions?

| Metric | Description | Status |
|--------|-------------|--------|
| **Argument Survival Centrality** | Do influential claims stabilize across sessions? | ❌ Needs multi-session storage |
| **Crux Recurrence Rate (CRR)** | Do independent debates converge on similar crux sets? | ❌ Needs multi-session aggregation |
| **Shared Memory Convergence** | Do agents independently articulate similar disagreement summaries? | ❌ Needs multi-session comparison |

---

## Implemented Metrics

### Disagreement Entropy (H)

Calculated in `components/dialogue/ThreeColumnLayout.tsx` (lines ~457–462):

```typescript
const entropy = cruxCards.length > 0
  ? -[...typeCounts.values()].reduce((sum, count) => {
      const p = count / cruxCards.length
      return sum + p * Math.log(p)
    }, 0)
  : 0
```

- Computed over the distribution of disagreement types (`horizon`, `evidence`, `values`, `definition`, `claim`, `premise`) across crux cards
- Lower entropy = debate concentrated disagreement onto fewer root causes
- Higher entropy = disagreement scattered across many types
- Displayed in the "Debate Results" panel

### Crux Compression Rate (CCR)

Also in `ThreeColumnLayout.tsx` (line ~464):

```typescript
const ccr = cruxCards.length > 0 ? resolvedCount / cruxCards.length : 0
```

- Ratio of resolved crux cards to total crux cards
- Target: ≥ 50%
- Displayed alongside H in results panel

### Additional Session Metrics (UI)

The results panel also shows:
- **Resolution %** — `resolved_count / total_cruxes`
- **Most Active Persona** — Highest message count
- **Dominant Root Cause** — Most common disagreement type
- **Deepest Clash** — Crux room with most exchanges
- **Position Matrix** — Each persona's stance (YES/NO/NUANCED) per crux card
- **Fault Lines Summary** — Clashing pairs, disagreement types, resolved/unresolved status

### Placeholder Metrics in UI

Two additional metrics appear in the results panel as placeholders:
- **IQS (Insight Quality Score)** — "Needs expert raters"
- **CRR (Crux Recurrence Rate)** — "Needs multi-session"

---

## Quality Gates in the Pipeline

### Disagreement Detection

`lib/dialogue/disagreement-detector.ts` uses a candidate registry with hysteresis to avoid false positives:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Consecutive windows required | ≥ 2 | Must persist across ~6 messages |
| Confidence threshold | ≥ 0.8 | Haiku must be 80%+ confident |
| Cooldown per persona pair | 5 min | Prevents crux room spam |
| Detection window | Last 10 messages | Scope of each scan |
| Scan frequency | Every 3 messages | How often orchestrator checks |

Detection criteria (Haiku, temp 0.2):
- Two personas taking clearly opposing positions on the same claim
- At least 2 back-and-forth exchanges (not passing comments)
- Both committed to positions (not questions)
- Returns `{ hasDisagreement, personas, topic, shortLabel, confidence }`

### Crux Room Quality Gate

`lib/crux/orchestrator.ts` checks every 2 full exchanges whether the core disagreement has been surfaced (Haiku call, temp 0.2). If `cruxSurfaced: true`, the room terminates early. Safety cap: 20 turns max.

### Message Quality Control

`lib/dialogue/agent.ts` enforces:
- Hard-banned phrases: "Great point", "I agree that", hedging, bullet lists
- Max 200 tokens per turn
- Returns `null` on refusal or ban violation (turn skipped)

---

## Types Supporting Metrics

### ConvergenceState (`lib/types/index.ts`)

```typescript
export interface ConvergenceState {
  entropy: number
  confidenceWeightedDistance: number
  unresolvedCruxCount: number
  converged: boolean
  diverged: boolean
  eventCount: number
  maxEvents: number
}
```

### CruxCard (`lib/crux/types.ts`)

Each card tracks:
- `disagreementType`: `'horizon' | 'evidence' | 'values' | 'definition' | 'claim' | 'premise'`
- `resolved`: boolean
- `resolution`: optional string describing the resolution path
- `diagnosis`: root cause classification (Sonnet, temp 0.3)

---

## Where Metrics Are Computed vs Stored

| What | Where | Persisted? |
|------|-------|------------|
| H and CCR | `ThreeColumnLayout.tsx` (frontend, post-debate) | No — frontend state only |
| Disagreement confidence | `disagreement-detector.ts` (backend, during debate) | No — emitted via SSE then discarded |
| Crux card data | `card-generator.ts` → SSE → frontend state | No — SSE events not saved to DB |
| Convergence state | `hydrateDebateState.ts` (frontend, from SSE) | No — frontend state only |

**Key gap**: No benchmark results are persisted to the database. All metrics are computed ephemerally during or after a debate session and exist only in frontend state.

---

## No Dedicated Benchmark Runner

There is no `npm run bench` or standalone evaluation script. The metrics are:
1. **Calculated** at dialogue completion in the frontend
2. **Displayed** in the "Debate Results" panel
3. **Not persisted** anywhere

To systematically benchmark, you would need to build:
- A script that runs debates programmatically and collects SSE events
- Storage for benchmark results across sessions
- Cross-session aggregation for CRR, Argument Survival Centrality, etc.

---

## Key Files Reference

| File | Role |
|------|------|
| `docs/crux_overview.md` § 8 | Benchmark framework design (three-level evaluation) |
| `components/dialogue/ThreeColumnLayout.tsx` | H, CCR calculation + results panel display |
| `lib/dialogue/disagreement-detector.ts` | Detection confidence, candidate registry, spawn thresholds |
| `lib/crux/orchestrator.ts` | Crux room exit checks (quality gate) |
| `lib/crux/card-generator.ts` | CruxCard generation with diagnosis + resolution |
| `lib/crux/types.ts` | CruxCard, DisagreementCandidate interfaces |
| `lib/types/index.ts` | ConvergenceState interface |
| `lib/hooks/hydrateDebateState.ts` | SSE → frontend state hydration |
| `lib/dialogue/agent.ts` | Message quality control (phrase bans, token limits) |
