import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { costForEvent } from "../pricing";
import {
  AGENTS,
  sessionSignature,
  type SessionInfo,
  type UsageEvent,
  type UsageSource,
} from "./types";
import { FileTailer } from "./tailer";

const DEFAULT_ROOT = path.join(homedir(), ".claude", "projects");

function rootDir(): string {
  return process.env.TOKENMAXXX_CLAUDE_PATH || DEFAULT_ROOT;
}

function listJsonlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsonlFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

export function usageEventFromJson(json: any): UsageEvent | null {
  if (json.type !== "assistant") return null;
  const msg = json.message;
  const usage = msg?.usage;
  if (!usage) return null;
  const ts = Date.parse(json.timestamp);
  if (Number.isNaN(ts)) return null;
  return {
    agent: AGENTS.CLAUDE_CODE,
    model: String(msg.model ?? "unknown"),
    timestamp: ts,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    reasoningTokens: 0,
  };
}

export function parseLine(line: string): UsageEvent | null {
  let json: any;
  try {
    json = JSON.parse(line);
  } catch {
    console.warn("[claude-code] skipping malformed JSON line");
    return null;
  }
  return usageEventFromJson(json);
}

interface SessionState {
  sessionId: string;
  title: string | null;
  model: string | null;
  cwd: string | null;
  gitBranch: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cost: number;
  timeCreated: number | null;
  timeUpdated: number | null;
}

const ZERO_STATE: Omit<SessionState, "sessionId"> = {
  title: null,
  model: null,
  cwd: null,
  gitBranch: null,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  reasoningTokens: 0,
  cost: 0,
  timeCreated: null,
  timeUpdated: null,
};

/** Accumulates session metadata + usage totals for one Claude Code log file. */
export class SessionTracker {
  private state: SessionState;
  private lastSig = "";

  constructor(private readonly filePath: string) {
    this.state = { sessionId: path.basename(filePath, ".jsonl"), ...ZERO_STATE };
  }

  /** Process one raw JSONL line. Returns the usage event if the line carries one. */
  processLine(line: string): UsageEvent | null {
    let json: any;
    try {
      json = JSON.parse(line);
    } catch {
      console.warn(`[claude-code] skipping malformed JSON line in ${this.filePath}`);
      return null;
    }

    if (json.sessionId) this.state.sessionId = String(json.sessionId);
    else if (json.session_id) this.state.sessionId = String(json.session_id);
    if (json.type === "ai-title" && json.aiTitle) this.state.title = String(json.aiTitle);
    if (json.message?.model) this.state.model = String(json.message.model);
    if (json.cwd) this.state.cwd = String(json.cwd);
    if (json.gitBranch) this.state.gitBranch = String(json.gitBranch);

    const ts = Date.parse(json.timestamp);
    if (!Number.isNaN(ts)) {
      if (this.state.timeCreated === null || ts < this.state.timeCreated) this.state.timeCreated = ts;
      if (this.state.timeUpdated === null || ts > this.state.timeUpdated) this.state.timeUpdated = ts;
    }

    const event = usageEventFromJson(json);
    if (event) {
      this.state.inputTokens += event.inputTokens;
      this.state.outputTokens += event.outputTokens;
      this.state.cacheWriteTokens += event.cacheWriteTokens;
      this.state.cacheReadTokens += event.cacheReadTokens;
      this.state.reasoningTokens += event.reasoningTokens;
      this.state.cost += costForEvent(event);
      return event;
    }
    return null;
  }

  snapshot(): SessionInfo {
    const s = this.state;
    return {
      agent: AGENTS.CLAUDE_CODE,
      sessionId: s.sessionId,
      title: s.title,
      model: s.model,
      cwd: s.cwd,
      gitBranch: s.gitBranch,
      tokens:
        s.inputTokens + s.outputTokens + s.cacheWriteTokens + s.cacheReadTokens + s.reasoningTokens,
      cost: s.cost,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens,
      cacheWriteTokens: s.cacheWriteTokens,
      reasoningTokens: s.reasoningTokens,
      timeCreated: s.timeCreated,
      timeUpdated: s.timeUpdated,
    };
  }

  /** Emit the session if its state changed since the last emission. */
  emitIfChanged(onSession: (s: SessionInfo) => void): void {
    const snapshot = this.snapshot();
    const sig = sessionSignature(snapshot);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    onSession(snapshot);
  }
}

export function createClaudeCodeSource(): UsageSource {
  return {
    id: AGENTS.CLAUDE_CODE,
    watch(onEvent, onSession) {
      const root = rootDir();
      if (!existsSync(root)) {
        console.warn(`[claude-code] log directory not found: ${root}. Use TOKENMAXXX_CLAUDE_PATH to point at it.`);
        return;
      }

      const tailers = new Map<string, FileTailer>();
      const trackers = new Map<string, SessionTracker>();
      const seen = new Set<string>();

      const scan = () => {
        let files;
        try {
          files = listJsonlFiles(root);
        } catch (e) {
          console.warn(`[claude-code] failed to scan ${root}:`, e);
          return;
        }
        for (const f of files) {
          if (seen.has(f)) continue;
          seen.add(f);
          try {
            statSync(f); // ensure readable
          } catch {
            continue;
          }
          tailers.set(f, new FileTailer(f));
          trackers.set(f, new SessionTracker(f));
        }
      };

      const tick = () => {
        for (const [file, tailer] of tailers) {
          const tracker = trackers.get(file);
          if (!tracker) continue;
          try {
            const lines = tailer.readNewLines();
            for (const line of lines) {
              if (!line.trim()) continue;
              const event = tracker.processLine(line);
              if (event) onEvent(event);
            }
            if (onSession) tracker.emitIfChanged(onSession);
          } catch (e) {
            console.warn(`[claude-code] failed to tail ${file}:`, e);
          }
        }
      };

      scan();
      setInterval(scan, 5_000);
      setInterval(tick, 1_000);
    },
  };
}
