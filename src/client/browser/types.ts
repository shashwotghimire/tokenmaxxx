export type AgentId = "claude-code" | "opencode" | "codex";

export interface UsageEvent {
  agent: AgentId;
  model: string;
  /** epoch milliseconds */
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cost: number;
}

export interface SessionInfo {
  agent: AgentId;
  sessionId: string;
  title: string | null;
  model: string | null;
  cwd: string | null;
  gitBranch: string | null;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  timeCreated: number | null;
  timeUpdated: number | null;
}

export interface Breakdown {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}
