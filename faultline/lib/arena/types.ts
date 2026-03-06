export type DisagreementType =
  | 'horizon'
  | 'evidence'
  | 'values'
  | 'definition'
  | 'claim'
  | 'premise'

export type ArenaMethod = 'direct_crux' | 'cot_crux' | 'multiagent_crux' | 'argora_crux'

export const ARENA_METHOD_LABELS: Record<ArenaMethod, string> = {
  direct_crux: 'Direct Crux',
  cot_crux: 'CoT Crux',
  multiagent_crux: 'Multi-Agent Crux',
  argora_crux: 'ARGORA Crux',
}

export const ARENA_METHOD_MODELS: Record<ArenaMethod, string> = {
  direct_crux: 'gpt-4o-mini',
  cot_crux: 'o3',
  multiagent_crux: 'gpt-4o-mini',
  argora_crux: 'claude-haiku-4-5',
}

export interface CruxCardPosition {
  expert: string
  stance: string
  reasoning: string
  flipCondition: string | null
}

export interface CruxCardOutput {
  question: string
  disagreementType: DisagreementType
  diagnosis: string
  importance: number | null
  positions: CruxCardPosition[]
}

export interface ArenaDebate {
  id: string
  topic: string
  createdAt: Date
  methodsRun: ArenaMethod[]
}

export interface ArenaOutput {
  id: string
  debateId: string
  method: ArenaMethod
  cruxCards: CruxCardOutput[]
  tokenUsage: Record<string, number>
  runtimeMs: number
  model: string
  costUsd: number | null
}

export interface ArenaVote {
  id: string
  debateId: string
  methodA: ArenaMethod
  methodB: ArenaMethod
  winner: 'a' | 'b' | 'tie'
  sessionId: string
  createdAt: Date
}

export interface MethodStats {
  method: ArenaMethod
  wins: number
  losses: number
  ties: number
  total: number
  winRate: number | null
  avgCostUsd: number | null
  avgRuntimeMs: number | null
}

export interface ArenaStats {
  methods: MethodStats[]
  totalDebates: number
  totalVotes: number
}

// SSE events from the arena run endpoint
export type ArenaRunEventType =
  | 'run_start'
  | 'method_start'
  | 'method_complete'
  | 'method_error'
  | 'run_complete'
  | 'error'

export interface ArenaRunEvent {
  type: ArenaRunEventType
  data?: unknown
}
