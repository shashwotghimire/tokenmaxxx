import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, resetDb } from "./db";

test("drops legacy input-only Codex estimates on open", () => {
  const saved = process.env.TOKENMAXXX_DB_PATH;
  const file = path.join(mkdtempSync(path.join(tmpdir(), "tokenmaxxx-db-")), "usage.db");
  try {
    process.env.TOKENMAXXX_DB_PATH = file;
    resetDb();
    const db = getDb();
    const insert = db.query("INSERT INTO usage_events (agent, model, timestamp, input_tokens, source_event_id, session_id) VALUES (?, 'gpt-5.5', 1, 10, ?, ?)");
    insert.run("codex", "legacy:100", "legacy");
    insert.run("codex", null, null);
    insert.run("codex", "rollout:real:1", "real");
    insert.run("opencode", null, null);
    const session = db.query("INSERT INTO sessions (agent, session_id) VALUES ('codex', ?)");
    session.run("legacy");
    session.run("real");
    db.close();

    resetDb();
    const reopened = getDb();
    expect(reopened.query("SELECT agent, source_event_id FROM usage_events ORDER BY id").all()).toEqual([
      { agent: "codex", source_event_id: "rollout:real:1" },
      { agent: "opencode", source_event_id: null },
    ]);
    expect(reopened.query("SELECT session_id FROM sessions").all()).toEqual([{ session_id: "real" }]);
    reopened.close();
  } finally {
    resetDb();
    if (saved === undefined) delete process.env.TOKENMAXXX_DB_PATH; else process.env.TOKENMAXXX_DB_PATH = saved;
  }
});
