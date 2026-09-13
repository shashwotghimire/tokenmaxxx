import { test, expect } from "bun:test";
import { CodexTracker } from "./codex";
export function tracker() {
  const t = new CodexTracker();
  t.process({ type: "session_meta", payload: { id: "synthetic-thread", cwd: "/synthetic/project" } });
  t.process({ type: "turn_context", payload: { model: "gpt-5.5" } });
  return t;
}
export function snapshot(input: number, output: number, cached = 0, reasoning = 0, timestamp = "2026-09-13T10:00:00Z") {
  return { type: "event_msg", timestamp, payload: { type: "token_count", info: {
    total_token_usage: { input_tokens: input, output_tokens: output, cached_input_tokens: cached, reasoning_output_tokens: reasoning, total_tokens: input + output },
    last_token_usage: { input_tokens: input, output_tokens: output },
  } } };
}
test("Codex categories total 1200, not 1900 when cache/reasoning are subsets", () => {
  const e = tracker().process(snapshot(1000, 200, 600, 100))!;
  expect(e.inputTokens).toBe(400); expect(e.cacheReadTokens).toBe(600);
  expect(e.outputTokens).toBe(100); expect(e.reasoningTokens).toBe(100);
  expect(e.inputTokens + e.cacheReadTokens + e.outputTokens + e.reasoningTokens).toBe(1200);
});
test("cumulative updates emit only new usage and repeated quota snapshots emit nothing", () => {
  const t = tracker(); t.process(snapshot(1000, 200, 600, 100));
  expect(t.process(snapshot(1000, 200, 600, 100, "2026-09-13T10:01:00Z"))).toBeNull();
  const e = t.process(snapshot(1500, 300, 900, 150, "2026-09-13T10:02:00Z"))!;
  expect(e.inputTokens + e.cacheReadTokens + e.outputTokens + e.reasoningTokens).toBe(600);
});
test("replaying a rollout produces the same event IDs", () => {
  expect(tracker().process(snapshot(1000, 200))!.sourceEventId).toBe(tracker().process(snapshot(1000, 200))!.sourceEventId);
});
test("ignores null info and synthetic context-window totals", () => {
  const t = tracker();
  expect(t.process({ type: "event_msg", payload: { type: "token_count", info: null } })).toBeNull();
  const j = snapshot(0, 0); j.payload.info.total_token_usage.total_tokens = 200000;
  expect(t.process(j)).toBeNull();
});
test("counter reset establishes a baseline without adding the session again", () => {
  const t = tracker(); t.process(snapshot(1000, 200));
  expect(t.process(snapshot(500, 100))).toBeNull();
  expect(t.process(snapshot(600, 120))!.inputTokens).toBe(100);
});
