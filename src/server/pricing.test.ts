import { test, expect } from "bun:test";
import { costForEvent, getPricingTable } from "./pricing";
import type { UsageEvent } from "./sources/types";

const base = (over: Partial<UsageEvent>): UsageEvent => ({
  agent: "opencode",
  model: "claude-sonnet-4-6",
  timestamp: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  reasoningTokens: 0,
  ...over,
});

test("calculates cost for a known model", () => {
  // sonnet: $3/M input, $15/M output, $3.75/M cache write, $0.30/M cache read
  const cost = costForEvent(
    base({ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000 })
  );
  expect(cost).toBeCloseTo(3 + 15 + 3.75 + 0.3, 6);
});

test("hand-computed example: 100 input + 50 output", () => {
  // 100/1M * 3 + 50/1M * 15 = 0.0003 + 0.00075 = 0.00105
  const cost = costForEvent(base({ inputTokens: 100, outputTokens: 50 }));
  expect(cost).toBeCloseTo(0.00105, 8);
});

test("uses the default entry for unknown models", () => {
  const cost = costForEvent(base({ model: "totally-unknown-model", inputTokens: 1_000_000 }));
  const defaultPrice = getPricingTable().default!;
  expect(cost).toBeCloseTo(defaultPrice.input, 8);
});

test("zero usage has zero cost", () => {
  expect(costForEvent(base({}))).toBe(0);
});
