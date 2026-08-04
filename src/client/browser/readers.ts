import initSqlJs from "sql.js";
import { costForEvent } from "./pricing";
import type { AgentId, SessionInfo, UsageEvent } from "./types";

export const WASM_URL = "/assets/sql-wasm.wasm";

type RawEvent = Omit<UsageEvent, "cost">;

let sqlReady: Promise<Awaited<ReturnType<typeof initSqlJs>>> | null = null;
function sql(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  sqlReady ??= initSqlJs(typeof window === "undefined" ? {} : { locateFile: () => WASM_URL });
  return sqlReady;
}

export function usageEventFromJson(json: any): RawEvent | null {
  if (json.type !== "assistant") return null;
  const msg = json.message;
  const usage = msg?.usage;
  if (!usage) return null;
  const ts = Date.parse(json.timestamp);
  if (Number.isNaN(ts)) return null;
  return {
    agent: "claude-code" as AgentId,
    model: String(msg.model ?? "unknown"),
    timestamp: ts,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    reasoningTokens: 0,
  };
}

function sessionSignature(s: Omit<SessionInfo, "agent" | "sessionId">): string {
  return JSON.stringify([s.title, s.model, s.cwd, s.gitBranch, s.tokens, s.cost, s.timeCreated, s.timeUpdated]);
}

/** Parse one Claude Code .jsonl file: returns usage events and a session summary. */
export function parseClaudeFile(name: string, text: string): { events: UsageEvent[]; session: SessionInfo } {
  const events: UsageEvent[] = [];
  const state: Omit<SessionInfo, "agent" | "sessionId"> = {
    title: null,
    model: null,
    cwd: null,
    gitBranch: null,
    tokens: 0,
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    timeCreated: null,
    timeUpdated: null,
  };
  let sessionId = name.replace(/\.jsonl$/i, "");

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let json: any;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    if (json.sessionId) sessionId = String(json.sessionId);
    else if (json.session_id) sessionId = String(json.session_id);
    if (json.type === "ai-title" && json.aiTitle) state.title = String(json.aiTitle);
    if (json.message?.model) state.model = String(json.message.model);
    if (json.cwd) state.cwd = String(json.cwd);
    if (json.gitBranch) state.gitBranch = String(json.gitBranch);
    const ts = Date.parse(json.timestamp);
    if (!Number.isNaN(ts)) {
      if (state.timeCreated === null || ts < state.timeCreated) state.timeCreated = ts;
      if (state.timeUpdated === null || ts > state.timeUpdated) state.timeUpdated = ts;
    }
    const ev = usageEventFromJson(json);
    if (ev) {
      const cost = costForEvent(ev);
      events.push({ ...ev, cost });
      state.tokens += ev.inputTokens + ev.outputTokens + ev.cacheReadTokens + ev.cacheWriteTokens + ev.reasoningTokens;
      state.cost += cost;
      state.inputTokens += ev.inputTokens;
      state.outputTokens += ev.outputTokens;
      state.cacheReadTokens += ev.cacheReadTokens;
      state.cacheWriteTokens += ev.cacheWriteTokens;
      state.reasoningTokens += ev.reasoningTokens;
    }
  }

  return { events, session: { agent: "claude-code" as AgentId, sessionId, ...state } };
}

interface MsgRow {
  data: string;
}

export function parseMessageData(raw: string): RawEvent | null {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data.role !== "assistant") return null;
  const tokens = data.tokens;
  if (!tokens) return null;
  const total = tokens.total ?? 0;
  if (total <= 0) return null;
  const ts = data.time?.created;
  if (typeof ts !== "number" || Number.isNaN(ts)) return null;
  return {
    agent: "opencode" as AgentId,
    model: String(data.modelID ?? "unknown"),
    timestamp: ts,
    inputTokens: tokens.input ?? 0,
    outputTokens: tokens.output ?? 0,
    cacheWriteTokens: tokens.cache?.write ?? 0,
    cacheReadTokens: tokens.cache?.read ?? 0,
    reasoningTokens: tokens.reasoning ?? 0,
  };
}

/** Read an opencode.db file: returns usage events (from `message`) and sessions (from `session`). */
export async function readOpencodeDb(file: File): Promise<{ events: UsageEvent[]; sessions: SessionInfo[] }> {
  const SQL = await sql();
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  const events: UsageEvent[] = [];
  const sessions: SessionInfo[] = [];

  const msgs = db.exec("SELECT data FROM message ORDER BY rowid ASC") as unknown as {
    columns: string[];
    values: unknown[][];
  }[];
  for (const row of msgs[0]?.values ?? []) {
    const ev = parseMessageData(String(row[0]));
    if (ev) events.push({ ...ev, cost: costForEvent(ev) });
  }

  const sess = db.exec(
    `SELECT id, title, model, agent, directory, path, cost,
            tokens_input, tokens_output, tokens_reasoning,
            tokens_cache_read, tokens_cache_write, time_created, time_updated
     FROM session`
  ) as unknown as { columns: string[]; values: unknown[][] }[];
  for (const row of sess[0]?.values ?? []) {
    const s = rowToSession("opencode" as AgentId, row);
    if (s) sessions.push(s);
  }

  db.close();
  return { events, sessions };
}

/** Read a Codex state_*.sqlite file: events are per-thread token deltas (attributed to input). */
export async function readCodexDb(file: File): Promise<{ events: UsageEvent[]; sessions: SessionInfo[] }> {
  const SQL = await sql();
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  const events: UsageEvent[] = [];
  const sessions: SessionInfo[] = [];

  const rows = db.exec(
    `SELECT id, model, tokens_used, updated_at_ms, created_at_ms, title, cwd FROM threads WHERE tokens_used > 0`
  ) as unknown as { columns: string[]; values: unknown[][] }[];

  const lastTokens = new Map<string, number>();
  for (const row of rows[0]?.values ?? []) {
    const id = String(row[0] ?? "");
    const total = Number(row[2] ?? 0);
    const prev = lastTokens.get(id) ?? 0;
    lastTokens.set(id, total);
    const delta = total - prev;
    if (delta <= 0) continue;
    const ts = Number(row[3] ?? row[4] ?? Date.now());
    const raw: RawEvent = {
      agent: "codex" as AgentId,
      model: String(row[1] ?? "unknown"),
      timestamp: ts,
      inputTokens: delta,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
    };
    events.push({ ...raw, cost: costForEvent(raw) });

    sessions.push({
      agent: "codex" as AgentId,
      sessionId: id,
      title: row[5] ? String(row[5]) : null,
      model: row[1] ? String(row[1]) : null,
      cwd: row[6] ? String(row[6]) : null,
      gitBranch: null,
      tokens: total,
      cost: costForEvent(raw),
      inputTokens: total,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      timeCreated: row[4] ? Number(row[4]) : null,
      timeUpdated: row[3] ? Number(row[3]) : null,
    });
  }

  db.close();
  return { events, sessions };
}

function rowToSession(agent: AgentId, row: unknown[]): SessionInfo | null {
  const id = String(row[0] ?? "");
  if (!id) return null;
  const input = Number(row[7] ?? 0);
  const output = Number(row[8] ?? 0);
  const reasoning = Number(row[9] ?? 0);
  const cacheRead = Number(row[10] ?? 0);
  const cacheWrite = Number(row[11] ?? 0);
  const model = row[2] ? String(row[2]) : null;
  let parsedModel: string | null = model;
  if (model) {
    try {
      const m = JSON.parse(model);
      parsedModel = String(m.id ?? m.model ?? model);
    } catch {
      /* keep raw */
    }
  }
  return {
    agent,
    sessionId: id,
    title: row[1] ? String(row[1]) : null,
    model: parsedModel,
    cwd: row[4] ? String(row[4]) : (row[5] ? String(row[5]) : null),
    gitBranch: null,
    tokens: input + output + reasoning + cacheRead + cacheWrite,
    cost: Number(row[6] ?? 0),
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reasoningTokens: reasoning,
    timeCreated: row[12] ? Number(row[12]) : null,
    timeUpdated: row[13] ? Number(row[13]) : null,
  };
}

/** Recursively list files inside a directory handle. */
export async function walkDir(handle: FileSystemDirectoryHandle): Promise<File[]> {
  const out: File[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind === "file") {
      if (entry.name.endsWith(".jsonl")) out.push(await entry.getFile());
    } else if (entry.kind === "directory") {
      out.push(...(await walkDir(entry)));
    }
  }
  return out;
}
