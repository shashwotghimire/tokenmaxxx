import { test, expect } from "bun:test";
import { addLiveUsage } from "./liveUsage";
test("live usage accumulates every received delta, including updates batched in one render", () => {
  const first = { agent: "claude-code", model: "test", timestamp: 1, inputTokens: 100, outputTokens: 50, cacheReadTokens: 1000, cacheWriteTokens: 0, reasoningTokens: 0, cost: 1 };
  const second = { ...first, inputTokens: 0, cacheReadTokens: 0, outputTokens: 30, cost: 0.2 };
  const totals = [first, second].reduce(addLiveUsage, null);
  expect(totals!.inputTokens + totals!.outputTokens + totals!.cacheReadTokens).toBe(1180);
  expect(totals!.cost).toBe(1.2);
});
