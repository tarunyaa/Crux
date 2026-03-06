// Types mirroring ARGORA's output structures

export interface ArgumentEvent {
  type: ArgumentEventType;
  data?: unknown;
}

export type ArgumentEventType =
  | 'argument_start'
  | 'experts_generated'
  | 'progress_argument_posted'
  | 'main_arguments_generated'
  | 'level1_complete'
  | 'level2_complete'
  | 'level3_complete'
  | 'base_scores_assigned'
  | 'qbaf_evaluated'
  | 'counterfactual_complete'
  | 'consensus_generated'
  | 'report_generated'
  | 'argument_complete'
  | 'baselines_started'
  | 'baseline_running'
  | 'baseline_result'
  | 'baselines_complete'
  | 'status'
  | 'progress_task_extracted'
  | 'progress_experts_selected'
  | 'progress_main_arguments_ready'
  | 'progress_first_level_complete'
  | 'progress_graph_debate_complete'
  | 'progress_scoring_complete'
  | 'progress_counterfactual_complete'
  | 'error';

export interface TaskInfo {
  main_task: string;
  key_elements: string[];
}

export interface ExpertsGeneratedData {
  experts: string[];
  task: TaskInfo;
}

export interface MainArgument {
  statement: string;
  experts?: string[] | Record<string, unknown>;
  expert?: string;
}

export interface MainArgumentsData {
  main_arguments: MainArgument[];
}

export interface GraphStats {
  nodes: number;
  edges: number;
}

export interface LevelCompleteData {
  first_level?: Record<string, unknown>;
  graph_count?: number;
  graph_stats?: Record<string, GraphStats>;
  included_in_graphs?: boolean;
}

export interface BaseScore {
  node: string;
  task_relevance: number | null;
  evidence_support: number | null;
  logical_soundness: number | null;
  base_score: number | null;
}

export interface BaseScoresData {
  scores: BaseScore[];
}

export interface QBAFStrength {
  statement: string;
  initial_score: number | null;
  final_score: number | null;
  expert: string | null;
}

export interface QBAFHierarchyNode {
  node_id: number;
  statement: string;
  expert: string;
  type: string;
  initial_score: number | null;
  final_score: number | null;
  relation?: string;
  supplementary_args?: QBAFHierarchyNode[];
}

export interface QBAFEvaluatedData {
  strengths: QBAFStrength[];
  hierarchy?: QBAFHierarchyNode[];
}

export interface EdgeImpact {
  child_id: string;
  delta: number;
  edge_type: string;
  statement?: string;
}

export interface DecisiveChain {
  start_node_id: string;
  delta_chain: number;
  chain_nodes: string[];
  chain_statements: string[];
  edge_types: string[];
}

export interface CounterfactualData {
  [statement: string]: {
    baseline_root: number;
    edge_impacts: Record<string, number>;
    most_influential_direct_child?: EdgeImpact;
    most_decisive_chain?: DecisiveChain;
    most_influential_node?: EdgeImpact;
  };
}

export interface ConsensusData {
  consensus_text: string;
  graph_consensus_summary: string;
  winner: string;
  winner_score: number | null;
  override_decision: string;
  original_decision: string;
  details: Record<string, unknown>;
  agnostic_consensus: Record<string, unknown>;
}

export interface WinnerCriticalIntervention {
  edge_id?: string;
  node_id?: string;
  statement?: string;
  cost?: number;
  flips_winner_to?: string;
}

export interface ReportData {
  available: boolean;
  reason?: string;
  winner_critical_interventions?: Record<string, unknown>;
  argument_count?: number;
}

export interface ArgumentCompleteData {
  topic: string;
  experts: string[];
  task: TaskInfo;
  main_arguments: MainArgument[];
  qbaf_strengths: QBAFStrength[];
  counterfactual: CounterfactualData;
  consensus: ConsensusData;
  report: ReportData;
  token_usage: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

// Baseline comparison types

export type BaselineMethod = 'direct_1x' | 'direct_cot_1x' | 'argora_cot_1x';

export interface BaselineResult {
  method: BaselineMethod;
  label: string;
  answer: string | null;
  reasoning: string | null;
  mainTask?: string; // only for argora_cot_1x
  tokenUsage?: Record<string, number>;
  error?: string;
}

export interface BaselineComparisonData {
  topic: string;
  baselines: BaselineResult[];
}

export interface StreamingArg {
  id: number;
  statement: string;
  expert: string;
  type: 'main_argument' | 'supporting_argument' | 'attacking_argument';
  parent_id: number | null;
}

export interface ArgumentMessage {
  id: string;
  expertName: string;
  expertIndex: number;
  content: string;
  type: 'main_argument' | 'support' | 'attack';
  parentId?: string;
  depth: number;
  scores?: {
    initial: number | null;
    final: number | null;
  };
}

export interface PositionInfo {
  label: string;       // "Position A"
  shortName: string;   // "DRAM Bull"
  description: string; // "DRAM stocks will outperform due to..."
}

export interface ArgumentState {
  phase: 'idle' | 'starting' | 'experts' | 'arguments' | 'building' | 'scoring' | 'evaluating' | 'analyzing' | 'baselines' | 'complete' | 'error';
  topic: string;
  experts: string[];
  task: TaskInfo | null;
  mainArguments: MainArgument[];
  levelInfo: LevelCompleteData | null;
  baseScores: BaseScore[];
  qbafStrengths: QBAFStrength[];
  qbafHierarchy: QBAFHierarchyNode[];
  counterfactual: CounterfactualData | null;
  consensus: ConsensusData | null;
  report: ReportData | null;
  fullResult: ArgumentCompleteData | null;
  baselineResults: BaselineResult[];
  framedTopic: string | null;
  positions: PositionInfo[];
  streamingArgs: StreamingArg[];
  error: string | null;
}

export function createInitialState(): ArgumentState {
  return {
    phase: 'idle',
    topic: '',
    experts: [],
    task: null,
    mainArguments: [],
    levelInfo: null,
    baseScores: [],
    qbafStrengths: [],
    qbafHierarchy: [],
    counterfactual: null,
    consensus: null,
    report: null,
    fullResult: null,
    baselineResults: [],
    framedTopic: null,
    positions: [],
    streamingArgs: [],
    error: null,
  };
}
