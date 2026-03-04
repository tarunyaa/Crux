// ─── Worldview Synthesis Types ─────────────────────────────────
// Stage 1.5: Cross-corpus worldview extraction from raw belief graphs.
// Sits between raw belief extraction (Stage 1) and QBAF generation (Stage 2).

export interface BeliefCluster {
  id: string
  theme: string                   // short label: "HBM demand trajectory"
  nodeIds: string[]               // belief node IDs in this cluster
  edgeIds: string[]               // edges within/between cluster nodes
  sourceChunks: string[]          // all corpus chunks grounding this cluster
  representativeClaims: string[]  // top 3-5 claims by confidence
  claimCount: number              // total edges in cluster
}

export interface WorldviewPosition {
  id: string
  claim: string                   // specific, falsifiable: "HBM demand is structural"
  confidence: number              // 0-1, how strongly the persona holds this
  type: 'thesis' | 'concern' | 'assumption' | 'value_judgment'
  groundingClusters: string[]     // cluster IDs this is derived from
  implicitAssumptions: string[]   // what must be true for this position to hold
}

export interface PersonaWorldview {
  personaId: string
  personaName: string
  positions: WorldviewPosition[]
  clusters: BeliefCluster[]
  synthesizedAt: string
}

export interface AssumptionConflict {
  id: string
  assumptionA: string             // persona A's implicit assumption
  assumptionB: string             // persona B's opposing assumption
  personaA: string
  personaB: string
  conflictType: 'empirical' | 'causal' | 'temporal' | 'value' | 'boundary'
  settlingQuestion: string        // what evidence would resolve this?
  relevance: number               // 0-1, how central to each persona's thesis
}
