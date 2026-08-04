import { test, expect, beforeAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-forecast-"));
process.env.TOKENMAXXX_DB_PATH = path.join(dir, "test.db");

const { getDb, resetDb } = await import("./db");
const { buildForecast } = await import("./forecast");

// bun runs all test files in one process and the db.ts singleton is shared,
// so pin this file to its own temp DB regardless of which file ran first.
resetDb();

function insertDay(timestamp: number, totalTokens: number, cost: number) {
  getDb()
    .query(
      `INSERT INTO usage_events
        (agent, model, timestamp, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, reasoning_tokens, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("claude-code", "test-model", timestamp, totalTokens, 0, 0, 0, 0, cost);
}

function dayMs(offsetDays: number): number {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return base.getTime() - offsetDays * 86_400_000 + 12 * 3_600_000;
}

function weekdayOf(offsetDays: number): number {
  return new Date(dayMs(offsetDays)).getDay();
}

// Balanced weekday effect (Sun..Sat) — no strong drift, so it doesn't alias with the trend.
const SEASONAL = [40, 60, 120, 200, 180, 90, 70];

// True generator: usage grows ~100 tok/day as time moves toward the present.
// offsetDays = 0 is today, negative values are future days.
function trueTotal(offsetDays: number): number {
  return 1000 + 100 * (41 - offsetDays) + (SEASONAL[weekdayOf(offsetDays)] ?? 0);
}

beforeAll(() => {
  // Start from an empty table (other test files share this process/DB).
  getDb().query(`DELETE FROM usage_events`).run();
  // 42 days of data: linear trend 100 tok/day + weekday seasonality.
  for (let i = 0; i < 42; i++) {
    const total = trueTotal(i);
    insertDay(dayMs(i), total, total * 0.001);
  }
});

test("no data returns hasData=false", () => {
  const r = buildForecast({ agent: "codex" });
  expect(r.hasData).toBe(false);
  expect(r.forecast).toHaveLength(0);
});

test("forecasts a known linear trend + seasonality", () => {
  const r = buildForecast({ horizon: 7, windowDays: 42 });
  expect(r.hasData).toBe(true);
  expect(r.forecast).toHaveLength(7);
  // Fit should recover the ~100/day slope.
  expect(Math.abs(r.fit!.trendPerDay - 100)).toBeLessThan(40);
  // Each predicted day should land near the true value (within tolerance).
  for (let i = 0; i < 7; i++) {
    const expected = trueTotal(-(i + 1)); // next days (future => negative offset)
    const got = r.forecast[i]?.totalTokens ?? 0;
    expect(Math.abs(got - expected)).toBeLessThan(400);
  }
});

test("cumulative matches the sum of forecast points", () => {
  const r = buildForecast({ horizon: 7, windowDays: 42 });
  const sum = r.forecast.reduce((a, p) => a + p.totalTokens, 0);
  expect(r.cumulative.tokens).toBe(sum);
  expect(r.cumulative.low).toBeLessThanOrEqual(r.cumulative.tokens);
  expect(r.cumulative.high).toBeGreaterThanOrEqual(r.cumulative.tokens);
});

test("prediction interval brackets the point estimate", () => {
  const r = buildForecast({ horizon: 7, windowDays: 42 });
  for (const p of r.forecast) {
    expect(p.low).toBeLessThanOrEqual(p.totalTokens);
    expect(p.high).toBeGreaterThanOrEqual(p.totalTokens);
  }
});

test("forecast bucket shares sum to the total", () => {
  const r = buildForecast({ horizon: 3, windowDays: 42 });
  for (const p of r.forecast) {
    const sum =
      p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheWriteTokens + p.reasoningTokens;
    expect(Math.abs(sum - p.totalTokens)).toBeLessThan(5);
  }
});

test("horizon is clamped to 1..30", () => {
  expect(buildForecast({ horizon: 0 }).forecast).toHaveLength(1);
  expect(buildForecast({ horizon: 99 }).forecast).toHaveLength(30);
});

test("constant daily usage gives a flat forecast", () => {
  const db = getDb();
  db.query(`DELETE FROM usage_events`).run();
  for (let i = 0; i < 14; i++) insertDay(dayMs(i), 5000, 5);
  const r = buildForecast({ horizon: 5, windowDays: 14 });
  expect(r.hasData).toBe(true);
  for (const p of r.forecast) {
    expect(Math.abs(p.totalTokens - 5000)).toBeLessThan(400);
  }
  // Restore data for other tests.
  db.query(`DELETE FROM usage_events`).run();
});
