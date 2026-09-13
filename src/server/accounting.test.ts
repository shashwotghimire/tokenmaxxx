import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, resetDb, migrateJsonAccounting } from "./db";
import { handleEvent, getAllEvents, getSessions } from "./aggregator";
import { SessionTracker } from "./sources/claudeCode";
import { CodexTracker } from "./sources/codex";
import { parseMessageData } from "./sources/opencode";

beforeEach(() => { resetDb(); process.env.TOKENMAXXX_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "accounting-")), "test.db"); });
const claude = (uuid: string, output = 50, id = "message-1") => JSON.stringify({ type: "assistant", uuid, sessionId: "session-1", requestId: "request-1", timestamp: "2026-09-13T10:00:00Z", message: { id, model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: output, cache_read_input_tokens: 1000 } } });

test("Claude blocks with different UUIDs count once; larger final usage replaces partial usage", () => {
  const t = new SessionTracker("synthetic.jsonl");
  for (const line of [claude("a"), claude("b"), claude("c", 80), claude("d", 20)]) handleEvent(t.processLine(line)!);
  expect(getAllEvents({})).toHaveLength(1);
  expect(getAllEvents({})[0]!.outputTokens).toBe(80);
  expect(t.snapshot().tokens).toBe(1180);
  expect(getSessions({})[0]!.tokens).toBe(1180);
  const replay = new SessionTracker("copy.jsonl");
  expect(handleEvent(replay.processLine(claude("a"))!).changed).toBe(false);
  expect(getSessions({})[0]!.tokens).toBe(1180);
  handleEvent(t.processLine(claude("e", 50, "message-2"))!);
  expect(getAllEvents({})).toHaveLength(2);
});

test("Codex replay and appended usage remain 1800 after reopening the dashboard DB", () => {
  const meta = { type: "session_meta", payload: { id: "thread" } };
  const snap = (input: number, output: number, timestamp: string) => ({ type: "event_msg", timestamp, payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output } } } });
  const a = snap(1000, 200, "2026-09-13T10:00:00Z"), b = snap(1500, 300, "2026-09-13T10:01:00Z");
  const first = new CodexTracker(); first.process(meta); handleEvent(first.process(a)!);
  resetDb();
  const restarted = new CodexTracker(); restarted.process(meta);
  expect(handleEvent(restarted.process(a)!).changed).toBe(false);
  handleEvent(restarted.process(b)!);
  expect(getSessions({})[0]!.tokens).toBe(1800);
  expect(getAllEvents({})).toHaveLength(2);
});

test("OpenCode JSON without tokens.total is measured and updates don't accumulate snapshots", () => {
  const message = (output: number) => parseMessageData(JSON.stringify({ id: "m", sessionID: "s", role: "assistant", modelID: "gpt-5.5", time: { created: 1000 }, tokens: { input: 100, output, reasoning: 10, cache: { read: 200 } } }))!;
  handleEvent(message(20)); handleEvent(message(50)); handleEvent(message(20));
  expect(getAllEvents({})).toHaveLength(1);
  expect(getSessions({})[0]!.tokens).toBe(360);
});

test("one-time rebuild archives legacy aggregates and cannot erase corrected data on restart", () => {
  const db = getDb();
  db.exec("DELETE FROM accounting_versions; DROP TABLE usage_events_before_json_accounting; DROP TABLE sessions_before_json_accounting");
  handleEvent(new SessionTracker("x.jsonl").processLine(claude("a"))!);
  migrateJsonAccounting(db);
  expect(getAllEvents({})).toHaveLength(0);
  expect((db.query("SELECT COUNT(*) n FROM usage_events_before_json_accounting").get() as any).n).toBe(1);
  handleEvent(new SessionTracker("x.jsonl").processLine(claude("a"))!);
  migrateJsonAccounting(db);
  expect(getAllEvents({})).toHaveLength(1);
});

test("live updates contain only the new tokens when a response grows", () => {
  const t = new SessionTracker("synthetic.jsonl");
  const first = handleEvent(t.processLine(claude("a", 50))!);
  const update = handleEvent(t.processLine(claude("b", 80))!);
  expect(first.inputTokens + first.outputTokens + first.cacheReadTokens).toBe(1150);
  expect(update.delta!.inputTokens).toBe(0);
  expect(update.delta!.cacheReadTokens).toBe(0);
  expect(update.delta!.outputTokens).toBe(30);
  expect(update.delta!.cost).toBeCloseTo(30 * 15 / 1_000_000, 10);
});
