import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { FileTailer } from "./tailer";
import { AGENTS, type SessionInfo, type UsageEvent, type UsageSource } from "./types";
import { costForEvent } from "../pricing";
import { CodexUsageTracker } from "../../shared/codexUsage";
import { normalizeModel } from "../../shared/models";
import { projectLabel } from "../../shared/privacy";

export const codexStateDir = () =>
  process.env.TOKENMAXXX_CODEX_STATE_DIR || process.env.CODEX_HOME || path.join(homedir(), ".codex");

export const rolloutRoots = (dir = codexStateDir()) => [path.join(dir, "sessions"), path.join(dir, "archived_sessions")];

export function listRollouts(dir: string, out: string[] = []): string[] {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRollouts(full, out);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

export class RolloutTracker {
  private model = "unknown";
  private sessionId: string;
  private cwd: string | undefined;
  private usage = new CodexUsageTracker();
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
    const timestamp = Date.parse(record.timestamp);
    if (!Number.isFinite(timestamp)) return null;
    const usage = this.usage.read(record.payload.info);
    if (!usage) return null;
    const normalized = normalizeModel(this.model);
    const event: UsageEvent = {
      agent: AGENTS.CODEX, model: normalized.model, rawModel: normalized.rawModel,
      timestamp, ...usage,
      sessionId: this.sessionId, project: this.cwd ? projectLabel(this.cwd) : undefined,
      sourceEventId: `rollout:v2:${this.sessionId}:${++this.ordinal}`,
    };
    this.counters.inputTokens += event.inputTokens;
    this.counters.outputTokens += event.outputTokens;
    this.counters.cacheReadTokens += event.cacheReadTokens;
    this.counters.reasoningTokens += event.reasoningTokens;
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
      tokens: c.inputTokens + c.outputTokens + c.cacheReadTokens + c.reasoningTokens,
      cost: c.cost, ...c, timeCreated: this.first, timeUpdated: this.latest,
    };
  }
}

export function createCodexSource(): UsageSource {
  return {
    id: AGENTS.CODEX,
    watch(onEvent, onSession) {
      const roots = rolloutRoots();
      if (!roots.some(existsSync)) {
        console.warn(`[codex] rollout directory not found: ${roots[0]}. Waiting for it to appear; set CODEX_HOME or TOKENMAXXX_CODEX_STATE_DIR to point elsewhere.`);
      }
      const tailers = new Map<string, FileTailer>();
      const trackers = new Map<string, RolloutTracker>();
      const failing = new Set<string>();
      const tick = () => {
        for (const file of roots.flatMap(root => listRollouts(root))) {
          if (!tailers.has(file)) {
            tailers.set(file, new FileTailer(file));
            trackers.set(file, new RolloutTracker(file));
          }
        }
        for (const [file, tailer] of tailers) {
          const tracker = trackers.get(file)!;
          let changed = false;
          try {
            for (const line of tailer.readNewLines()) {
              const event = tracker.processLine(line);
              if (event) { onEvent(event); changed = true; }
            }
            failing.delete(file);
          } catch (error) {
            if (!failing.has(file)) console.warn(`[codex] failed to read ${file}:`, error);
            failing.add(file);
          }
          if (changed) onSession?.(tracker.snapshot());
        }
      };
      tick();
      setInterval(tick, 3_000);
    },
  };
}
