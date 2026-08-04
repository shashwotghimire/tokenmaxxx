export const AGENTS = {
  CLAUDE_CODE: "claude-code",
  OPENCODE: "opencode",
  CODEX: "codex",
} as const;

export type AgentId = (typeof AGENTS)[keyof typeof AGENTS];

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
}

export interface StoredEvent extends UsageEvent {
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

export interface UsageSource {
  id: AgentId;
  /** Backfill existing data immediately, then stream new events as they arrive. */
  watch(onEvent: (event: UsageEvent) => void, onSession?: (session: SessionInfo) => void): void;
}

export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

/** Compact signature of a session's current state, for change detection. */
export function sessionSignature(s: SessionInfo): string {
  return JSON.stringify([
    s.sessionId,
    s.title,
    s.model,
    s.cwd,
    s.gitBranch,
    s.tokens,
    s.cost,
    s.inputTokens,
    s.outputTokens,
    s.cacheReadTokens,
    s.cacheWriteTokens,
    s.reasoningTokens,
    s.timeCreated,
    s.timeUpdated,
  ]);
}
