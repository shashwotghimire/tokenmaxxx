/** Claude emits multiple content blocks for one API response. UUID identifies a
 * log record, not a billable response. Request ID disambiguates API retries. */
export function claudeUsageId(json: any): string | undefined {
  if (json.message?.id) return `response:${JSON.stringify([json.message.id, json.requestId ?? null])}`;
  return json.uuid ? String(json.uuid) : undefined;
}

export const tokenFields = ["inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens", "reasoningTokens"] as const;
type Tokens = Record<(typeof tokenFields)[number], number>;

/** Repeated/streaming snapshots are cumulative within the same response. */
export function mergeUsage<T extends Tokens>(previous: T | undefined, next: T): T {
  if (!previous) return next;
  const merged = { ...previous };
  for (const key of tokenFields) merged[key] = Math.max(previous[key], next[key]);
  return merged;
}

export function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
