import { Database } from "bun:sqlite";
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

const DEFAULT_STATE_DIR = path.join(homedir(), ".codex");

export interface ThreadRow {
  id: string;
  model: string | null;
  tokens_used: number | null;
  updated_at_ms: number | null;
  created_at_ms: number | null;
  title: string | null;
  cwd: string | null;
}

function stateDir(): string {
  return process.env.TOKENMAXXX_CODEX_STATE_DIR || DEFAULT_STATE_DIR;
}

/** Find the newest state_*.sqlite in the codex dir (the name changes across releases). */
function findStateDb(dir: string): string | null {
  const explicit = process.env.TOKENMAXXX_CODEX_DB;
  if (explicit) return existsSync(explicit) ? explicit : null;
  if (!existsSync(dir)) return null;
  let best: { name: string; mtime: number } | null = null;
  for (const entry of readdirSync(dir)) {
    const m = entry.match(/^state_\d+\.sqlite$/);
    if (!m) continue;
    const full = path.join(dir, entry);
    const { mtimeMs } = statSync(full);
    if (!best || mtimeMs > best.mtime) best = { name: full, mtime: mtimeMs };
  }
  return best?.name ?? null;
}

export function computeDeltas(
  rows: ThreadRow[],
  previous: Map<string, number>
): { events: UsageEvent[]; next: Map<string, number> } {
  const next = new Map(previous);
  const events: UsageEvent[] = [];
  for (const row of rows) {
    const total = row.tokens_used ?? 0;
    const prev = next.get(row.id) ?? 0;
    if (total <= prev) continue;
    next.set(row.id, total);
    const delta = total - prev;
    const ts = row.updated_at_ms ?? row.created_at_ms ?? Date.now();
    events.push({
      agent: AGENTS.CODEX,
      model: String(row.model ?? "unknown"),
      timestamp: ts,
      // Codex reports a single total per thread with no input/output split,
      // so the whole delta is attributed to input tokens.
      inputTokens: delta,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
    });
  }
  return { events, next };
}

export function sessionFromRow(row: ThreadRow): SessionInfo {
  const tokens = row.tokens_used ?? 0;
  const cost = costForEvent({
    agent: AGENTS.CODEX,
    model: String(row.model ?? "unknown"),
    timestamp: row.updated_at_ms ?? row.created_at_ms ?? 0,
    inputTokens: tokens,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
  });
  return {
    agent: AGENTS.CODEX,
    sessionId: row.id,
    title: row.title ?? null,
    model: row.model ?? null,
    cwd: row.cwd ?? null,
    gitBranch: null,
    tokens,
    cost,
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    timeCreated: row.created_at_ms ?? null,
    timeUpdated: row.updated_at_ms ?? null,
  };
}

export function createCodexSource(): UsageSource {
  return {
    id: AGENTS.CODEX,
    watch(onEvent, onSession) {
      const dir = stateDir();
      const dbFile = findStateDb(dir);
      if (!dbFile) {
        console.warn(
          `[codex] no state database found under ${dir}. Use TOKENMAXXX_CODEX_DB to point at a state_*.sqlite file.`
        );
        return;
      }

      const lastTokens = new Map<string, number>();
      const lastSessionSignatures = new Map<string, string>();
      let db: Database | null = null;

      const open = (): Database | null => {
        try {
          return new Database(dbFile, { readonly: true });
        } catch (e) {
          console.warn(`[codex] failed to open ${dbFile}:`, e);
          return null;
        }
      };

      const tick = () => {
        if (!db) db = open();
        if (!db) return;
        let rows: ThreadRow[];
        try {
          rows = db
            .query(
              `SELECT id, model, tokens_used, updated_at_ms, created_at_ms, title, cwd FROM threads
               WHERE tokens_used > 0`
            )
            .all() as ThreadRow[];
        } catch (e) {
          console.warn(`[codex] failed to poll ${dbFile}:`, e);
          try {
            db.close();
          } catch {}
          db = null;
          return;
        }

        const { events, next } = computeDeltas(rows, lastTokens);
        lastTokens.clear();
        for (const [id, total] of next) lastTokens.set(id, total);
        for (const event of events) onEvent(event);

        if (onSession) {
          for (const row of rows) {
            if (!row.id) continue;
            const session = sessionFromRow(row);
            const sig = sessionSignature(session);
            if (lastSessionSignatures.get(row.id) === sig) continue;
            lastSessionSignatures.set(row.id, sig);
            onSession(session);
          }
        }
      };

      tick();
      setInterval(tick, 3_000);
    },
  };
}
