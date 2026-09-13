import type { UsageEvent } from "./hooks/useWebSocket";

export function addLiveUsage(acc: UsageEvent | null, e: UsageEvent): UsageEvent {
  if (!acc) return { ...e };
  return {
    ...acc,
    inputTokens: acc.inputTokens + e.inputTokens,
    outputTokens: acc.outputTokens + e.outputTokens,
    cacheWriteTokens: acc.cacheWriteTokens + e.cacheWriteTokens,
    cacheReadTokens: acc.cacheReadTokens + e.cacheReadTokens,
    reasoningTokens: acc.reasoningTokens + e.reasoningTokens,
    cost: acc.cost + e.cost,
  };
}

