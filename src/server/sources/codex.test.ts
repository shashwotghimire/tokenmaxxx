import { test, expect } from "bun:test";
import { RolloutTracker } from "./codex";

const line = (type: string, payload: unknown) => JSON.stringify({ type, payload, timestamp: "2026-09-25T12:00:00Z" });

test("splits Codex usage without double counting", () => {
  const tracker = new RolloutTracker("/tmp/session.jsonl");
  tracker.processLine(line("session_meta", { id: "s1", cwd: "/project" }));
  tracker.processLine(line("turn_context", { model: "gpt-5.6-sol" }));
  const record = (input: number, cached: number, output: number) => line("event_msg", {
    type: "token_count", info: { total_token_usage: {
      input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 2,
    } },
  });
  const first = tracker.processLine(record(100, 70, 20))!;
  expect([first.inputTokens, first.cacheReadTokens, first.outputTokens, first.reasoningTokens]).toEqual([30, 70, 20, 0]);
  expect(first.model).toBe("gpt-5.6-sol");
  expect(tracker.processLine(record(100, 70, 20))).toBeNull();
  const second = tracker.processLine(record(140, 90, 25))!;
  expect([second.inputTokens, second.cacheReadTokens, second.outputTokens]).toEqual([20, 20, 5]);
  expect(tracker.snapshot().tokens).toBe(165);
});
