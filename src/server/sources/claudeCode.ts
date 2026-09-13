import { claudeUsageId, mergeUsage, tokenFields, tokenCount } from "../../shared/usage";
import path from "node:path";
import { costForEvent } from "../pricing";
import {
  AGENTS,
  sessionSignature,
  type SessionInfo,
  type UsageEvent,
  type UsageSource,
} from "./types";
import { watchJsonFiles, defaultLogRoots } from "./jsonFiles";
import { normalizeModel } from "../../shared/models";
import { projectLabel, sanitizeTitle } from "../../shared/privacy";

export function usageEventFromJson(json: any): UsageEvent | null {
  if (json.type !== "assistant") return null;
  const msg = json.message;
  const usage = msg?.usage;
  if (!usage) return null;
  const ts = Date.parse(json.timestamp);
  if (Number.isNaN(ts)) return null;
  const normalized = normalizeModel(msg.model);
  return {
    agent: AGENTS.CLAUDE_CODE,
    model: normalized.model,
    rawModel: normalized.rawModel,
    timestamp: ts,
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
    cacheWriteTokens: tokenCount(usage.cache_creation_input_tokens),
    cacheReadTokens: tokenCount(usage.cache_read_input_tokens),
    reasoningTokens: 0,
    sourceEventId: claudeUsageId(json),
    sessionId: json.sessionId ?? json.session_id,
    project: json.cwd ? projectLabel(json.cwd) : undefined,
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
  private usage = new Map<string, UsageEvent>();

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
    if (json.type === "ai-title" && json.aiTitle) this.state.title = sanitizeTitle(json.aiTitle);
    if (!this.state.title && json.type === "user" && typeof json.message?.content === "string") this.state.title = sanitizeTitle(json.message.content);
    if (json.message?.model) this.state.model = String(json.message.model);
    if (json.cwd) this.state.cwd = String(json.cwd);
    if (json.gitBranch) this.state.gitBranch = String(json.gitBranch);

    const ts = Date.parse(json.timestamp);
    if (!Number.isNaN(ts)) {
      if (this.state.timeCreated === null || ts < this.state.timeCreated) this.state.timeCreated = ts;
      if (this.state.timeUpdated === null || ts > this.state.timeUpdated) this.state.timeUpdated = ts;
    }

    let event = usageEventFromJson(json);
    if (event) {
      event.sessionId ??= this.state.sessionId;
      const previous = event.sourceEventId ? this.usage.get(event.sourceEventId) : undefined;
      event = mergeUsage(previous, event);
      if (event.sourceEventId) this.usage.set(event.sourceEventId, event);
      if (previous) {
        for (const key of tokenFields) this.state[key] -= previous[key];
        this.state.cost -= costForEvent(previous) ?? 0;
      }
      this.state.inputTokens += event.inputTokens;
      this.state.outputTokens += event.outputTokens;
      this.state.cacheWriteTokens += event.cacheWriteTokens;
      this.state.cacheReadTokens += event.cacheReadTokens;
      this.state.reasoningTokens += event.reasoningTokens;
      this.state.cost += costForEvent(event) ?? 0;
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
      return watchJsonFiles(defaultLogRoots("claude-code"), (file) => {
        const tracker = new SessionTracker(file);
        return (json) => {
          const event = tracker.processLine(JSON.stringify(json));
          if (event) onEvent(event);
          if (onSession) tracker.emitIfChanged(onSession);
        };
      });
    },
  };
}
