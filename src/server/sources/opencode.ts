import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  AGENTS,
  sessionSignature,
  type SessionInfo,
  type UsageEvent,
  type UsageSource,
} from "./types";

const DEFAULT_DB = path.join(homedir(), ".local", "share", "opencode", "opencode.db");

interface MessageRow {
  rowid: number;
  time_created: number;
  data: string;
}

export interface SessionRow {
  id: string;
  title: string | null;
  model: string | null;
  agent: string | null;
  directory: string | null;
  path: string | null;
  cost: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_reasoning: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
  time_created: number | null;
  time_updated: number | null;
}

function dbPath(): string {
  return process.env.TOKENMAXXX_OPENCODE_DB || DEFAULT_DB;
}

export function parseMessageData(raw: string): UsageEvent | null {
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
    agent: AGENTS.OPENCODE,
    model: String(data.modelID ?? "unknown"),
    timestamp: ts,
    inputTokens: tokens.input ?? 0,
    outputTokens: tokens.output ?? 0,
    cacheWriteTokens: tokens.cache?.write ?? 0,
    cacheReadTokens: tokens.cache?.read ?? 0,
    reasoningTokens: tokens.reasoning ?? 0,
  };
}

/** Extract the model id from the session table's JSON model column. */
function modelId(model: string | null): string | null {
  if (!model) return null;
  try {
    const parsed = JSON.parse(model);
    return String(parsed.id ?? parsed.model ?? model);
  } catch {
    return model;
  }
}

export function sessionFromRow(row: SessionRow): SessionInfo {
  const input = row.tokens_input ?? 0;
  const output = row.tokens_output ?? 0;
  const reasoning = row.tokens_reasoning ?? 0;
  const cacheRead = row.tokens_cache_read ?? 0;
  const cacheWrite = row.tokens_cache_write ?? 0;
  return {
    agent: AGENTS.OPENCODE,
    sessionId: row.id,
    title: row.title ?? null,
    model: modelId(row.model),
    cwd: row.directory ?? row.path ?? null,
    gitBranch: null,
    tokens: input + output + reasoning + cacheRead + cacheWrite,
    cost: row.cost ?? 0,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reasoningTokens: reasoning,
    timeCreated: row.time_created ?? null,
    timeUpdated: row.time_updated ?? null,
  };
}

export function createOpencodeSource(): UsageSource {
  return {
    id: AGENTS.OPENCODE,
    watch(onEvent, onSession) {
      const dbFile = dbPath();
      if (!existsSync(dbFile)) {
        console.warn(`[opencode] database not found: ${dbFile}. Use TOKENMAXXX_OPENCODE_DB to point at it.`);
        return;
      }

      let lastRowId = 0;
      let db: Database | null = null;
      const lastSessionSignatures = new Map<string, string>();

      const open = (): Database | null => {
        try {
          return new Database(dbFile, { readonly: true });
        } catch (e) {
          console.warn(`[opencode] failed to open ${dbFile}:`, e);
          return null;
        }
      };

      const tickSessions = () => {
        if (!db || !onSession) return;
        try {
          const rows = db
            .query(
              `SELECT id, title, model, agent, directory, path, cost,
                      tokens_input, tokens_output, tokens_reasoning,
                      tokens_cache_read, tokens_cache_write,
                      time_created, time_updated
               FROM session`
            )
            .all() as SessionRow[];
          for (const row of rows) {
            if (!row.id) continue;
            const session = sessionFromRow(row);
            const sig = sessionSignature(session);
            if (lastSessionSignatures.get(row.id) === sig) continue;
            lastSessionSignatures.set(row.id, sig);
            onSession(session);
          }
        } catch (e) {
          console.warn(`[opencode] failed to poll sessions from ${dbFile}:`, e);
        }
      };

      const tick = () => {
        if (!db) db = open();
        if (!db) return;
        try {
          const rows = db
            .query(
              `SELECT rowid, time_created, data FROM message
               WHERE rowid > ? ORDER BY rowid ASC`
            )
            .all(lastRowId) as MessageRow[];
          for (const row of rows) {
            if (row.rowid > lastRowId) lastRowId = row.rowid;
            const event = parseMessageData(row.data);
            if (event) onEvent(event);
          }
          tickSessions();
        } catch (e) {
          console.warn(`[opencode] failed to poll ${dbFile}:`, e);
          // DB may have been recreated (e.g. opencode update); re-open fresh.
          try {
            db.close();
          } catch {}
          db = null;
        }
      };

      tick();
      setInterval(tick, 1_000);
    },
  };
}
