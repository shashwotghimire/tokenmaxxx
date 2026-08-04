import { test, expect } from "bun:test";
import { parseMessageData } from "./opencode";

const valid = {
  role: "assistant",
  agent: "build",
  modelID: "deepseek-v4-flash-free",
  providerID: "opencode",
  time: { created: 1785820693427, completed: 1785820698534 },
  tokens: {
    total: 31387,
    input: 922,
    output: 458,
    reasoning: 55,
    cache: { write: 0, read: 29952 },
  },
  cost: 0,
};

test("parses a well-formed assistant message", () => {
  const e = parseMessageData(JSON.stringify(valid));
  expect(e).not.toBeNull();
  expect(e!.agent).toBe("opencode");
  expect(e!.model).toBe("deepseek-v4-flash-free");
  expect(e!.timestamp).toBe(1785820693427);
  expect(e!.inputTokens).toBe(922);
  expect(e!.outputTokens).toBe(458);
  expect(e!.cacheWriteTokens).toBe(0);
  expect(e!.cacheReadTokens).toBe(29952);
  expect(e!.reasoningTokens).toBe(55);
});

test("skips user messages", () => {
  const user = { ...valid, role: "user" };
  expect(parseMessageData(JSON.stringify(user))).toBeNull();
});

test("skips messages with zero total tokens (stream-start)", () => {
  const zero = { ...valid, tokens: { total: 0, input: 0, output: 0, cache: { read: 0, write: 0 } } };
  expect(parseMessageData(JSON.stringify(zero))).toBeNull();
});

test("skips malformed JSON", () => {
  expect(parseMessageData("{nope")).toBeNull();
});

test("skips messages without a tokens object", () => {
  expect(parseMessageData(JSON.stringify({ role: "assistant", time: { created: 1 } }))).toBeNull();
});

test("skips messages without a created timestamp", () => {
  const noTime = { ...valid, time: { completed: 2 } };
  expect(parseMessageData(JSON.stringify(noTime))).toBeNull();
});

test("defaults missing token buckets to 0", () => {
  const partial = { ...valid, tokens: { total: 100, input: 100 } };
  const e = parseMessageData(JSON.stringify(partial));
  expect(e!.outputTokens).toBe(0);
  expect(e!.reasoningTokens).toBe(0);
});
