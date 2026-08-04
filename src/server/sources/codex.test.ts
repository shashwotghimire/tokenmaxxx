import { test, expect } from "bun:test";
import { computeDeltas, type ThreadRow } from "./codex";

const row = (id: string, tokens: number, updated = 1000): ThreadRow => ({
  id,
  model: "gpt-5.5",
  tokens_used: tokens,
  updated_at_ms: updated,
  created_at_ms: 100,
  title: null,
  cwd: null,
});

test("emits the full total for a new thread", () => {
  const { events, next } = computeDeltas([row("t1", 500)], new Map());
  expect(events).toHaveLength(1);
  expect(events[0]!.inputTokens).toBe(500);
  expect(events[0]!.agent).toBe("codex");
  expect(events[0]!.model).toBe("gpt-5.5");
  expect(events[0]!.timestamp).toBe(1000);
  expect(next.get("t1")).toBe(500);
});

test("emits only the delta when a thread grows", () => {
  const prev = new Map([["t1", 500]]);
  const { events, next } = computeDeltas([row("t1", 700)], prev);
  expect(events).toHaveLength(1);
  expect(events[0]!.inputTokens).toBe(200);
  expect(next.get("t1")).toBe(700);
});

test("emits nothing when tokens are unchanged", () => {
  const prev = new Map([["t1", 700]]);
  const { events } = computeDeltas([row("t1", 700)], prev);
  expect(events).toHaveLength(0);
});

test("skips threads with zero tokens", () => {
  const { events } = computeDeltas([row("t0", 0)], new Map());
  expect(events).toHaveLength(0);
});

test("falls back to created_at when updated_at is missing", () => {
  const r = { ...row("t1", 100), updated_at_ms: null };
  const { events } = computeDeltas([r], new Map());
  expect(events[0]!.timestamp).toBe(100);
});

test("uses 0 buckets for output/cache/reasoning", () => {
  const { events } = computeDeltas([row("t1", 100)], new Map());
  expect(events[0]!.outputTokens).toBe(0);
  expect(events[0]!.cacheWriteTokens).toBe(0);
  expect(events[0]!.cacheReadTokens).toBe(0);
  expect(events[0]!.reasoningTokens).toBe(0);
});
