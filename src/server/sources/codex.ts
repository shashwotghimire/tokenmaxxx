import { normalizeModel } from "../../shared/models";
import { projectLabel } from "../../shared/privacy";
import { watchJsonFiles, defaultLogRoots, emptySession } from "./jsonFiles";
import type { UsageEvent, UsageSource } from "./types";

const fields = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens"] as const;
type Counters = Record<(typeof fields)[number], number>;
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Replay the rollout from the beginning on each launch; stable snapshot IDs
 * make replays idempotent in the aggregate DB. Never sum cumulative snapshots. */
export class CodexTracker {
  private sessionId = "";
  private model = "unknown";
  private cwd: string | undefined;
  private created: number | null = null;
  private previous: Counters | undefined;

  session() {
    return this.sessionId ? { ...emptySession("codex", this.sessionId), model: this.model,
      cwd: this.cwd ?? null, timeCreated: this.created, timeUpdated: this.created } : null;
  }

  process(json: any): UsageEvent | null {
    const payload = json.payload;
    if (json.type === "session_meta") {
      this.sessionId = String(payload?.id ?? "");
      this.cwd = payload?.cwd;
      const created = Date.parse(payload?.timestamp ?? json.timestamp);
      this.created = Number.isFinite(created) ? created : null;
      return null;
    }
    if (json.type === "turn_context") {
      this.model = normalizeModel(payload?.model).model;
      this.cwd = payload?.cwd ?? this.cwd;
      return null;
    }
    if (json.type !== "event_msg" || payload?.type !== "token_count" || !this.sessionId) return null;
    const usage = payload.info?.total_token_usage;
    const timestamp = Date.parse(json.timestamp);
    if (!usage || !Number.isFinite(timestamp)) return null;
    // Some quota/context events contain only total_tokens, not measured usage.
    if (!count(usage.input_tokens) && !count(usage.output_tokens)) return null;
    const next = Object.fromEntries(fields.map((key) => [key, count(usage[key])])) as Counters;
    if (this.previous && (next.input_tokens < this.previous.input_tokens || next.output_tokens < this.previous.output_tokens)) {
      // A counter reset is a new baseline, not another full-session spend.
      this.previous = next;
      return null;
    }
    const delta = Object.fromEntries(fields.map((key) => [key, Math.max(0, next[key] - (this.previous?.[key] ?? 0))])) as Counters;
    this.previous = next;
    if (!delta.input_tokens && !delta.output_tokens) return null;
    const cacheRead = Math.min(delta.cached_input_tokens, delta.input_tokens);
    const cacheWrite = Math.min(delta.cache_write_input_tokens, delta.input_tokens - cacheRead);
    const reasoning = Math.min(delta.reasoning_output_tokens, delta.output_tokens);
    return {
      agent: "codex", model: this.model, timestamp,
      inputTokens: delta.input_tokens - cacheRead - cacheWrite,
      outputTokens: delta.output_tokens - reasoning,
      cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, reasoningTokens: reasoning,
      sourceEventId: `rollout:${this.sessionId}:${timestamp}:${JSON.stringify(next)}`,
      sessionId: this.sessionId, project: this.cwd ? projectLabel(this.cwd) : undefined,
      measurementStatus: typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number" ? "complete" : "partial",
    };
  }
}

export function createCodexSource(): UsageSource {
  return {
    id: "codex",
    watch(onEvent, onSession) {
      return watchJsonFiles(defaultLogRoots("codex"), () => {
        const tracker = new CodexTracker();
        return (json) => {
          const event = tracker.process(json);
          if (event) onEvent(event);
          if (onSession && (event || json.type === "session_meta" || json.type === "turn_context")) {
            const session = tracker.session(); if (session) onSession(session);
          }
        };
      });
    },
  };
}
