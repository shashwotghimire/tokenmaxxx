const keys = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"] as const;
type Usage = Partial<Record<typeof keys[number], number>>;
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

/** Cumulative counts deduplicate repeated notifications; last usage supports older logs. */
export class CodexUsageTracker {
  private previous = Object.fromEntries(keys.map(key => [key, 0])) as Record<typeof keys[number], number>;

  read(info: { total_token_usage?: Usage; last_token_usage?: Usage } | null | undefined) {
    const total = info?.total_token_usage;
    const last = info?.last_token_usage;
    if (!total && !last) return null;
    // Optional fields absent from older records must not reset the other counters.
    const reset = !!total && keys.some(key => total[key] !== undefined && count(total[key]) < this.previous[key]);
    const delta = {} as typeof this.previous;
    for (const key of keys) {
      delta[key] = total?.[key] !== undefined
        ? reset ? count(last?.[key]) : Math.max(0, count(total[key]) - this.previous[key])
        : count(last?.[key]);
      if (total?.[key] !== undefined) this.previous[key] = count(total[key]);
      else this.previous[key] += delta[key];
    }
    if (!keys.some(key => delta[key] > 0)) return null;
    const cached = Math.min(delta.input_tokens, delta.cached_input_tokens);
    const reasoning = Math.min(delta.output_tokens, delta.reasoning_output_tokens);
    // Codex includes cache reads in input and reasoning in output. Expose disjoint buckets.
    return {
      inputTokens: delta.input_tokens - cached,
      cacheReadTokens: cached,
      outputTokens: delta.output_tokens - reasoning,
      reasoningTokens: reasoning,
      cacheWriteTokens: 0,
    };
  }
}
