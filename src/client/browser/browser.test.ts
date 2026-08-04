import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { parseClaudeFile, parseMessageData, readCodexDb, readOpencodeDb } from "./readers";
import { computeStreaks, fmtLocalDate, aggregateDaily, aggregateModels, aggregateStats } from "./aggregate";
import { buildForecastFromEvents } from "./forecast";
import { setBrowserData, disconnect, maybeBrowserApi } from "./store";
import type { UsageEvent } from "./types";

const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-browser-"));

afterEach(() => {
  disconnect();
});

describe("parseClaudeFile", () => {
  const text = [
    JSON.stringify({ type: "assistant", timestamp: "2026-08-01T10:00:00Z", sessionId: "s1", cwd: "/repo", gitBranch: "main", message: { model: "claude-opus-4", usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 } } }),
    JSON.stringify({ type: "ai-title", aiTitle: "Fix bug" }),
    JSON.stringify({ type: "user", timestamp: "2026-08-01T10:01:00Z", message: "hello" }),
  ].join("\n");

  test("parses assistant usage events and session summary", () => {
    const { events, session } = parseClaudeFile("20260801_s1.jsonl", text);
    expect(events).toHaveLength(1);
    expect(events[0]!.agent).toBe("claude-code");
    expect(events[0]!.model).toBe("claude-opus-4");
    expect(events[0]!.inputTokens).toBe(100);
    expect(events[0]!.outputTokens).toBe(50);
    expect(events[0]!.cacheReadTokens).toBe(10);
    expect(events[0]!.cost).toBeGreaterThan(0);
    expect(session.sessionId).toBe("s1");
    expect(session.title).toBe("Fix bug");
    expect(session.cwd).toBe("/repo");
    expect(session.gitBranch).toBe("main");
    expect(session.tokens).toBe(160);
  });
});

describe("parseMessageData (opencode)", () => {
  test("parses assistant tokens", () => {
    const ev = parseMessageData(
      JSON.stringify({ role: "assistant", modelID: "gpt-5", time: { created: 1780000000000 }, tokens: { input: 10, output: 5, cache: { read: 2 }, reasoning: 3, total: 20 } })
    );
    expect(ev).not.toBeNull();
    expect(ev!.agent).toBe("opencode");
    expect(ev!.inputTokens).toBe(10);
    expect(ev!.reasoningTokens).toBe(3);
  });

  test("ignores non-assistant or tokenless messages", () => {
    expect(parseMessageData(JSON.stringify({ role: "user" }))).toBeNull();
    expect(parseMessageData(JSON.stringify({ role: "assistant", tokens: { total: 0 } }))).toBeNull();
  });
});

describe("sqlite readers", () => {
  function sampleOpencodeDb(): string {
    const p = path.join(dir, "opencode.db");
    const db = new Database(p);
    db.exec(`CREATE TABLE message (rowid INTEGER PRIMARY KEY, time_created INTEGER, data TEXT);
             CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, model TEXT, agent TEXT, directory TEXT, path TEXT, cost REAL,
              tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,
              time_created INTEGER, time_updated INTEGER);`);
    db.run("INSERT INTO message (time_created, data) VALUES (1780000000000, ?)", JSON.stringify({ role: "assistant", modelID: "claude-3-7", time: { created: 1780000000000 }, tokens: { input: 100, output: 40, total: 140 } }));
    db.run("INSERT INTO session (id, title, model, tokens_input, tokens_output, cost, time_updated) VALUES ('op1', 'Demo', '{\"id\":\"claude-3-7\"}', 100, 40, 0.01, 1780000000000)");
    db.close();
    return p;
  }

  function sampleCodexDb(): string {
    const p = path.join(dir, "state_123.sqlite");
    const db = new Database(p);
    db.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY, model TEXT, tokens_used INTEGER, updated_at_ms INTEGER, created_at_ms INTEGER, title TEXT, cwd TEXT);`);
    db.run("INSERT INTO threads (id, model, tokens_used, updated_at_ms, created_at_ms, title) VALUES ('t1', 'o4-mini', 500, 1780000000000, 1780000000000, 'Ship it')");
    db.run("INSERT INTO threads (id, model, tokens_used, updated_at_ms, created_at_ms) VALUES ('t2', 'o4-mini', 250, 1780001000000, 1780000000000)");
    db.close();
    return p;
  }

  test("readOpencodeDb returns events and sessions", async () => {
    const file = new File([new Uint8Array(await Bun.file(sampleOpencodeDb()).arrayBuffer())], "opencode.db");
    const { events, sessions } = await readOpencodeDb(file);
    expect(events).toHaveLength(1);
    expect(events[0]!.agent).toBe("opencode");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sessionId).toBe("op1");
    expect(sessions[0]!.model).toBe("claude-3-7");
  });

  test("readCodexDb attributes deltas to input tokens and emits sessions", async () => {
    const file = new File([new Uint8Array(await Bun.file(sampleCodexDb()).arrayBuffer())], "state_123.sqlite");
    const { events, sessions } = await readCodexDb(file);
    expect(events).toHaveLength(2);
    expect(events[0]!.agent).toBe("codex");
    expect(events[0]!.inputTokens).toBe(500);
    expect(events[1]!.inputTokens).toBe(250);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.title).toBe("Ship it");
  });
});

describe("aggregation", () => {
  const base = Date.parse("2026-08-01T12:00:00");
  const evts: UsageEvent[] = [
    { agent: "claude-code", model: "claude-3-7", timestamp: base, inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 10, reasoningTokens: 0, cost: 0.001 },
    { agent: "opencode", model: "gpt-5", timestamp: base + 3600_000, inputTokens: 40, outputTokens: 20, cacheWriteTokens: 5, cacheReadTokens: 0, reasoningTokens: 3, cost: 0.002 },
  ];

  test("aggregateDaily groups by local date", () => {
    const rows = aggregateDaily(evts, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe(fmtLocalDate(base));
    expect(rows[0]!.totals.totalTokens).toBe(228);
  });

  test("aggregateStats computes streaks", () => {
    const stats = aggregateStats(evts, {});
    expect(stats.days).toBe(1);
    expect(stats.topModel).toBe("gpt-5");
  });

  test("aggregateModels attributes each model to its agent", () => {
    const rows = aggregateModels(evts, {});
    const byModel = new Map(rows.map((r) => [r.model, r.agent]));
    expect(byModel.get("claude-3-7")).toBe("claude-code");
    expect(byModel.get("gpt-5")).toBe("opencode");
    expect(rows.map((r) => r.model)).toEqual(["claude-3-7", "gpt-5"]);
  });

  test("computeStreaks handles gaps", () => {
    const today = fmtLocalDate(Date.now());
    const y = fmtLocalDate(Date.now() - 86_400_000);
    const two = fmtLocalDate(Date.now() - 2 * 86_400_000);
    expect(computeStreaks([two, today])).toEqual({ current: 1, longest: 1 });
    expect(computeStreaks([y, today])).toEqual({ current: 2, longest: 2 });
  });
});

describe("forecast", () => {
  test("buildForecastFromEvents returns horizon points", () => {
    const day = 86_400_000;
    const evts: UsageEvent[] = [];
    for (let i = 0; i < 42; i++) {
      evts.push({ agent: "claude-code", model: "m", timestamp: Date.now() - (41 - i) * day, inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, cost: 0.01 });
    }
    const r = buildForecastFromEvents(evts, undefined, { horizon: 7, windowDays: 42 });
    expect(r.hasData).toBe(true);
    expect(r.forecast).toHaveLength(7);
    for (const p of r.forecast) {
      expect(p.totalTokens).toBeGreaterThan(0);
      expect(p.low).toBeLessThanOrEqual(p.high);
    }
  });
});

describe("browser api routing", () => {
  test("serves summary from local events when connected", () => {
    setBrowserData({
      events: [{ agent: "claude-code", model: "m", timestamp: Date.parse("2026-08-01T12:00:00"), inputTokens: 100, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, cost: 0.001 }],
      sessions: [],
      sources: ["claude"],
    });
    const summary = maybeBrowserApi("/api/summary") as any;
    expect(summary.allTime.totalTokens).toBe(100);
    const models = maybeBrowserApi("/api/models") as any;
    expect(models[0].model).toBe("m");
    const stats = maybeBrowserApi("/api/stats") as any;
    expect(stats.days).toBe(1);
  });

  test("returns null in server mode", () => {
    expect(maybeBrowserApi("/api/summary")).toBeNull();
  });
});
