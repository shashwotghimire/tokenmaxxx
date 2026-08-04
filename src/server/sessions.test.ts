import { test, expect, beforeAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-sess-"));
process.env.TOKENMAXXX_DB_PATH = path.join(dir, "test.db");

const { handleSession, getSessions } = await import("./aggregator");
import { SessionTracker, parseLine } from "./sources/claudeCode";
import { sessionFromRow as opencodeSession, type SessionRow as OpenCodeRow } from "./sources/opencode";
import { sessionFromRow as codexSession, type ThreadRow } from "./sources/codex";
import type { SessionInfo } from "./sources/types";

const session = (over: Partial<SessionInfo>): SessionInfo => ({
  agent: "opencode",
  sessionId: "ses_1",
  title: "My session",
  model: "gpt-5.5",
  cwd: "/tmp",
  gitBranch: null,
  tokens: 1000,
  cost: 0.5,
  inputTokens: 800,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  timeCreated: 1000,
  timeUpdated: 2000,
  ...over,
});

beforeAll(() => {
  handleSession(session({}));
  handleSession(session({ sessionId: "ses_2", agent: "codex", title: null, model: null, tokens: 500, cost: 0.25, timeUpdated: 1500 }));
});

test("getSessions returns stored sessions ordered by updated desc", () => {
  const list = getSessions({});
  expect(list).toHaveLength(2);
  expect(list[0]!.sessionId).toBe("ses_1");
  expect(list[0]!.title).toBe("My session");
});

test("upsert updates existing session instead of duplicating", () => {
  handleSession(session({ tokens: 2000, cost: 1.0, timeUpdated: 3000 }));
  const list = getSessions({});
  expect(list).toHaveLength(2);
  expect(list[0]!.tokens).toBe(2000);
  expect(list[0]!.cost).toBe(1.0);
  expect(list[0]!.timeUpdated).toBe(3000);
});

test("agent filter narrows sessions", () => {
  const list = getSessions({ agent: "codex" });
  expect(list).toHaveLength(1);
  expect(list[0]!.sessionId).toBe("ses_2");
});

test("keeps the older created time across upserts", () => {
  handleSession(session({ timeCreated: 900 }));
  const list = getSessions({});
  expect(list[0]!.timeCreated).toBe(900);
});

test("claude SessionTracker accumulates usage and metadata per file", () => {
  const tracker = new SessionTracker("/tmp/fake-project/session-uuid.jsonl");
  tracker.processLine(
    JSON.stringify({ type: "assistant", timestamp: "2026-08-04T06:00:00.000Z", cwd: "/proj", gitBranch: "main", message: { model: "claude-sonnet-4-6", usage: { input_tokens: 100, cache_creation_input_tokens: 10, cache_read_input_tokens: 20, output_tokens: 30 } } })
  );
  tracker.processLine(JSON.stringify({ type: "ai-title", aiTitle: "Fix the bug", timestamp: "2026-08-04T06:01:00.000Z" }));
  tracker.processLine(
    JSON.stringify({ type: "assistant", timestamp: "2026-08-04T06:02:00.000Z", message: { model: "claude-sonnet-4-6", usage: { input_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 } } })
  );

  const snap = tracker.snapshot();
  expect(snap.sessionId).toBe("session-uuid");
  expect(snap.title).toBe("Fix the bug");
  expect(snap.model).toBe("claude-sonnet-4-6");
  expect(snap.cwd).toBe("/proj");
  expect(snap.gitBranch).toBe("main");
  expect(snap.inputTokens).toBe(150);
  expect(snap.outputTokens).toBe(35);
  expect(snap.cacheWriteTokens).toBe(10);
  expect(snap.cacheReadTokens).toBe(20);
  expect(snap.timeCreated).toBe(Date.parse("2026-08-04T06:00:00.000Z"));
  expect(snap.timeUpdated).toBe(Date.parse("2026-08-04T06:02:00.000Z"));
});

test("claude parseLine still returns usage events", () => {
  const e = parseLine(JSON.stringify({ type: "assistant", timestamp: "2026-08-04T06:00:00.000Z", message: { model: "m", usage: { input_tokens: 1, output_tokens: 2 } } }));
  expect(e).not.toBeNull();
  expect(e!.inputTokens).toBe(1);
});

test("opencode sessionFromRow maps the session table row", () => {
  const row: OpenCodeRow = {
    id: "ses_1",
    title: "Build it",
    model: '{"id":"deepseek-v4-flash-free","providerID":"opencode","variant":"medium"}',
    agent: "build",
    directory: "/proj",
    path: null,
    cost: 1.25,
    tokens_input: 100,
    tokens_output: 40,
    tokens_reasoning: 10,
    tokens_cache_read: 500,
    tokens_cache_write: 0,
    time_created: 1000,
    time_updated: 2000,
  };
  const s = opencodeSession(row);
  expect(s.agent).toBe("opencode");
  expect(s.model).toBe("deepseek-v4-flash-free");
  expect(s.cwd).toBe("/proj");
  expect(s.tokens).toBe(650);
  expect(s.cost).toBe(1.25);
  expect(s.reasoningTokens).toBe(10);
});

test("codex sessionFromRow attributes totals as input", () => {
  const row: ThreadRow = {
    id: "t1",
    model: "gpt-5.5",
    tokens_used: 4000,
    updated_at_ms: 2000,
    created_at_ms: 1000,
    title: "Do the thing",
    cwd: "/proj",
  };
  const s = codexSession(row);
  expect(s.agent).toBe("codex");
  expect(s.title).toBe("Do the thing");
  expect(s.cwd).toBe("/proj");
  expect(s.tokens).toBe(4000);
  expect(s.inputTokens).toBe(4000);
  expect(s.outputTokens).toBe(0);
  expect(s.timeCreated).toBe(1000);
  expect(s.timeUpdated).toBe(2000);
});
