import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { FileTailer } from "./tailer";
import { AGENTS, type SessionInfo, type UsageEvent, type UsageSource } from "./types";
import { costForEvent } from "../pricing";
import { normalizeModel } from "../../shared/models";
import { projectLabel } from "../../shared/privacy";

const stateDir = () => process.env.TOKENMAXXX_CODEX_STATE_DIR || path.join(homedir(), ".codex");

function listRollouts(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRollouts(full, out);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

type Usage = { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number };

/** Codex token_count records contain a per-turn delta and a cumulative total.
 * The delta is authoritative for event time and model; the cumulative value is
 * useful only as a fallback for older rollouts without last_token_usage.
 */
export class RolloutTracker {
  private model = "unknown";
  private sessionId: string;
  private cwd: string | undefined;
  private previous: Required<Usage> = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  private ordinal = 0;
  private counters = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0 };
  private first: number | null = null;
  private latest: number | null = null;

  constructor(private readonly file: string) {
    this.sessionId = path.basename(file, ".jsonl");
  }

  processLine(line: string): UsageEvent | null {
    let record: any;
    try { record = JSON.parse(line); } catch { return null; }
    if (record.type === "session_meta") {
      if (record.payload?.id) this.sessionId = String(record.payload.id);
      if (record.payload?.cwd) this.cwd = String(record.payload.cwd);
    }
    if (record.type === "turn_context" && record.payload?.model) this.model = String(record.payload.model);
    if (record.type !== "event_msg" || record.payload?.type !== "token_count") return null;
    const info = record.payload.info;
    if (!info) return null;
    const total = info.total_token_usage as Usage | undefined;
    const last = info.last_token_usage as Usage | undefined;
    if (!total && !last) return null;
    const keys = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"] as const;
    if (total && keys.some(key => Number(total[key] ?? 0) < this.previous[key])) {
      for (const key of keys) this.previous[key] = Math.max(0, Number(total[key]) || 0);
      return null;
    }
    const usage = {} as Required<Usage>;
    for (const key of keys) {
      const current = Number(total?.[key]);
      const previous = this.previous[key];
      // Prefer the cumulative difference: repeated token_count messages can
      // carry the same last_token_usage and must not be counted twice.
      usage[key] = total && Number.isFinite(current)
        ? Math.max(0, current - previous)
        : Math.max(0, Number(last?.[key]) || 0);
      if (total && Number.isFinite(current)) this.previous[key] = current;
    }
    if (!keys.some(key => usage[key] > 0)) return null;
    const timestamp = Date.parse(record.timestamp);
    if (!Number.isFinite(timestamp)) return null;
    const input = usage.input_tokens;
    const cached = Math.min(input, usage.cached_input_tokens);
    const normalized = normalizeModel(this.model);
    const event: UsageEvent = {
      agent: AGENTS.CODEX, model: normalized.model, rawModel: normalized.rawModel,
      timestamp, inputTokens: input - cached, outputTokens: usage.output_tokens,
      cacheReadTokens: cached, cacheWriteTokens: 0,
      // Reasoning tokens are included in output_tokens by Codex. Keep the
      // display's total additive by not counting them a second time.
      reasoningTokens: 0,
      sessionId: this.sessionId, project: this.cwd ? projectLabel(this.cwd) : undefined,
      sourceEventId: `rollout:${this.sessionId}:${++this.ordinal}`,
    };
    this.counters.inputTokens += event.inputTokens;
    this.counters.outputTokens += event.outputTokens;
    this.counters.cacheReadTokens += event.cacheReadTokens;
    this.counters.cost += costForEvent(event) ?? 0;
    this.first ??= timestamp;
    this.latest = timestamp;
    return event;
  }

  snapshot(): SessionInfo {
    const c = this.counters;
    return {
      agent: AGENTS.CODEX, sessionId: this.sessionId, title: null,
      model: normalizeModel(this.model).model, cwd: this.cwd ?? null, gitBranch: null,
      tokens: c.inputTokens + c.outputTokens + c.cacheReadTokens,
      cost: c.cost, ...c, timeCreated: this.first, timeUpdated: this.latest,
    };
  }
}

export function createCodexSource(): UsageSource {
  return {
    id: AGENTS.CODEX,
    watch(onEvent, onSession) {
      const root = path.join(stateDir(), "sessions");
      if (!existsSync(root)) {
        console.warn(`[codex] rollout directory not found: ${root}`);
        return;
      }
      const tailers = new Map<string, FileTailer>();
      const trackers = new Map<string, RolloutTracker>();
      const tick = () => {
        try {
          for (const file of listRollouts(root)) {
            if (!tailers.has(file)) {
              tailers.set(file, new FileTailer(file));
              trackers.set(file, new RolloutTracker(file));
            }
          }
          for (const [file, tailer] of tailers) {
            const tracker = trackers.get(file)!;
            let changed = false;
            for (const line of tailer.readNewLines()) {
              const event = tracker.processLine(line);
              if (event) { onEvent(event); changed = true; }
            }
            if (changed) onSession?.(tracker.snapshot());
          }
        } catch (error) { console.warn("[codex] failed to read rollouts:", error); }
      };
      tick();
      setInterval(tick, 3_000);
    },
  };
}
