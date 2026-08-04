import { test, expect, beforeAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-agg-"));
process.env.TOKENMAXXX_DB_PATH = path.join(dir, "test.db");

const {
  handleEvent,
  getSummary,
  getDaily,
  getHourly,
  getModelBreakdown,
  getAgentBreakdown,
  getContributionGraph,
  getStats,
  computeStreaks,
} = await import("./aggregator");
import type { UsageEvent } from "./sources/types";

const day = 86_400_000;
const todayStart = (() => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
})();

const ev = (over: Partial<UsageEvent> & { offset?: number }): UsageEvent => {
  const offset = over.offset ?? 0;
  const rest = { ...over };
  delete (rest as any).offset;
  return {
    agent: "opencode",
    model: "claude-sonnet-4-6",
    timestamp: todayStart + offset,
    inputTokens: 100,
    outputTokens: 50,
    cacheWriteTokens: 10,
    cacheReadTokens: 20,
    reasoningTokens: 0,
    ...rest,
  };
};

beforeAll(() => {
  handleEvent(ev({ agent: "opencode", model: "claude-sonnet-4-6", inputTokens: 1000, offset: 1000 }));
  handleEvent(ev({ agent: "claude-code", model: "claude-opus-4-6", inputTokens: 2000, offset: 2000 }));
  // a day yesterday
  handleEvent(ev({ agent: "codex", model: "gpt-5.5", inputTokens: 4000, offset: -day }));
});

test("summary returns today's totals", () => {
  const s = getSummary();
  expect(s.today.inputTokens).toBe(3000);
  expect(s.today.outputTokens).toBe(100);
  expect(s.today.cacheReadTokens).toBe(40);
});

test("daily groups by day", () => {
  const d = getDaily({ days: 7 });
  expect(d).toHaveLength(2);
  const today = d.find((r) => r.date === new Date(todayStart).toISOString().slice(0, 10));
  // date is formatted with localtime so compare the last 2 entries
  expect(d[d.length - 1]!.totals.inputTokens).toBe(3000);
  expect(d[0]!.totals.inputTokens).toBe(4000);
});

test("hourly bucketing for today", () => {
  const h = getHourly({ since: todayStart, until: todayStart + day });
  expect(h.length).toBeGreaterThan(0);
  const totalInput = h.reduce((sum, r) => sum + r.totals.inputTokens, 0);
  expect(totalInput).toBe(3000);
});

test("model breakdown groups by model", () => {
  const m = getModelBreakdown({});
  const map = new Map(m.map((r) => [r.model, r.totals.inputTokens]));
  expect(map.get("claude-sonnet-4-6")).toBe(1000);
  expect(map.get("claude-opus-4-6")).toBe(2000);
  expect(map.get("gpt-5.5")).toBe(4000);
});

test("agent breakdown groups by agent", () => {
  const a = getAgentBreakdown({});
  const map = new Map(a.map((r) => [r.agent, r.totals.inputTokens]));
  expect(map.get("opencode")).toBe(1000);
  expect(map.get("claude-code")).toBe(2000);
  expect(map.get("codex")).toBe(4000);
});

test("contribution graph returns per-day totals", () => {
  const c = getContributionGraph({ days: 30 });
  expect(c).toHaveLength(2);
});

test("agent filter narrows results", () => {
  const s = getSummary({ agent: "opencode" });
  expect(s.allTime.inputTokens).toBe(1000);
});

test("stats computes streaks, top model, top agent", () => {
  const s = getStats({});
  expect(s.topModel).toBe("claude-opus-4-6");
  expect(s.topAgent).toBe("claude-code");
  expect(s.totals.inputTokens).toBe(7000);
});

test("computeStreaks handles empty, current, and longest", () => {
  expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });

  const d = new Date();
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const today = fmt(d);
  const y1 = fmt(new Date(d.getTime() - day));
  const y2 = fmt(new Date(d.getTime() - 2 * day));

  // today + yesterday → current streak 2
  expect(computeStreaks([y1, today])).toEqual({ current: 2, longest: 2 });
  // activity 2 and 3 days ago, none today/yesterday → current 0, longest 2
  const y3 = fmt(new Date(d.getTime() - 3 * day));
  expect(computeStreaks([y2, y3])).toEqual({ current: 0, longest: 2 });
  // only today → current 1
  expect(computeStreaks([today])).toEqual({ current: 1, longest: 1 });
});
