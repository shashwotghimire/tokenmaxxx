import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_DB_PATH = path.join(homedir(), ".local", "share", "tokenmaxxx", "usage.db");
const LEGACY_DB_PATH = path.join(homedir(), ".local", "share", "tokscale-web", "usage.db");

export function getDbPath(): string {
  return process.env.TOKENMAXXX_DB_PATH || DEFAULT_DB_PATH;
}

let _db: Database | null = null;

export function resetDb(): void {
  _db = null;
}

export function getDb(): Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  const envOverride = process.env.TOKENMAXXX_DB_PATH;
  mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!envOverride && !existsSync(dbPath) && existsSync(LEGACY_DB_PATH)) {
    copyFileSync(LEGACY_DB_PATH, dbPath);
  }
  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec("PRAGMA synchronous = NORMAL;");
  migrate(_db);
  return _db;
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      model TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage_events(agent);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_events(model);

    CREATE TABLE IF NOT EXISTS sessions (
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      title TEXT,
      model TEXT,
      cwd TEXT,
      git_branch TEXT,
      tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      time_created INTEGER,
      time_updated INTEGER,
      PRIMARY KEY (agent, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(time_updated);
  `);
  const columns = db.query("PRAGMA table_info(usage_events)").all() as { name: string }[];
  const names = new Set(columns.map((c) => c.name));
  const add = (name: string, sql: string) => { if (!names.has(name)) db.exec(`ALTER TABLE usage_events ADD COLUMN ${sql}`); };
  add("source_event_id", "source_event_id TEXT");
  add("raw_model", "raw_model TEXT");
  add("session_id", "session_id TEXT");
  add("project", "project TEXT");
  add("measurement_status", "measurement_status TEXT NOT NULL DEFAULT 'complete'");
  add("cost_status", "cost_status TEXT NOT NULL DEFAULT 'unknown'");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_source_event ON usage_events(agent, source_event_id) WHERE source_event_id IS NOT NULL");
}
