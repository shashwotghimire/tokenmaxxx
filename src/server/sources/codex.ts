import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { FileTailer } from "./tailer";
import { AGENTS, type SessionInfo, type UsageEvent, type UsageSource } from "./types";
import { costForEvent } from "../pricing";
import { normalizeModel } from "../../shared/models";
import { projectLabel } from "../../shared/privacy";

export const codexStateDir = () =>
  process.env.TOKENMAXXX_CODEX_STATE_DIR || process.env.CODEX_HOME || path.join(homedir(), ".codex");

export const rolloutRoots = (dir = codexStateDir()) => [path.join(dir, "sessions"), path.join(dir, "archived_sessions")];

const COMPRESSED_SUFFIX = ".zst";
const isRollout = (name: string) => name.endsWith(".jsonl") || name.endsWith(`.jsonl${COMPRESSED_SUFFIX}`);

/** Lists plain `.jsonl` and Codex-compressed `.jsonl.zst` rollouts, preferring
 * the plain file when both representations exist. */
export function listRollouts(dir: string, out: string[] = []): string[] {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  const files = new Set(entries.filter(e => e.isFile()).map(e => e.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRollouts(full, out);
    else if (entry.isFile() && isRollout(entry.name)) {
      if (entry.name.endsWith(COMPRESSED_SUFFIX) && files.has(entry.name.slice(0, -COMPRESSED_SUFFIX.length))) continue;
      out.push(full);
    }
  }
  return out;
}

/** Reads a compressed rollout in full whenever it changes. Codex only
 * compresses cold rollouts and decompresses them before appending again. */
class CompressedRolloutReader {
  private version = "";
  constructor(private readonly filePath: string) {}

  /** Returns every line if the file changed since the last call, else null. */
  readIfChanged(): string[] | null {
    const stat = statSync(this.filePath);
    const version = `${stat.size}:${stat.mtimeMs}`;
    if (version === this.version) return null;
    const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(this.filePath)));
    this.version = version;
    return text.split("\n");
  }
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
    this.sessionId = path.basename(file).replace(/\.jsonl(\.zst)?$/, "");
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
      const roots = rolloutRoots();
      if (!roots.some(existsSync)) {
        console.warn(`[codex] rollout directory not found: ${roots[0]}. Waiting for it to appear; set CODEX_HOME or TOKENMAXXX_CODEX_STATE_DIR to point elsewhere.`);
      }
      const tailers = new Map<string, FileTailer>();
      const compressed = new Map<string, CompressedRolloutReader>();
      const trackers = new Map<string, RolloutTracker>();
      const failing = new Set<string>();
      const tick = () => {
        const files = new Set(roots.flatMap(root => listRollouts(root)));
        for (const file of [...trackers.keys()]) {
          if (files.has(file)) continue;
          tailers.delete(file);
          compressed.delete(file);
          trackers.delete(file);
        }
        for (const file of files) {
          if (trackers.has(file)) continue;
          if (file.endsWith(COMPRESSED_SUFFIX)) compressed.set(file, new CompressedRolloutReader(file));
          else tailers.set(file, new FileTailer(file));
          trackers.set(file, new RolloutTracker(file));
        }
        for (const file of files) {
          let changed = false;
          try {
            const reader = compressed.get(file);
            let lines: string[];
            if (reader) {
              const all = reader.readIfChanged();
              if (!all) continue;
              // Re-parse from the start; stable event ids dedupe stored events.
              trackers.set(file, new RolloutTracker(file));
              lines = all;
            } else {
              lines = tailers.get(file)!.readNewLines();
            }
            const tracker = trackers.get(file)!;
            for (const line of lines) {
              const event = tracker.processLine(line);
              if (event) { onEvent(event); changed = true; }
            }
            failing.delete(file);
          } catch (error) {
            if (!failing.has(file)) console.warn(`[codex] failed to read ${file}:`, error);
            failing.add(file);
          }
          if (changed) onSession?.(trackers.get(file)!.snapshot());
        }
      };
      tick();
      setInterval(tick, 3_000);
    },
  };
}
