import { test, expect } from "bun:test";
import { parseLine } from "./claudeCode";

const valid = {
  type: "assistant",
  timestamp: "2026-08-03T09:05:53.848Z",
  message: {
    model: "claude-sonnet-4-6",
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 10524,
      cache_read_input_tokens: 14761,
      output_tokens: 313,
    },
  },
};

test("parses a well-formed assistant line", () => {
  const e = parseLine(JSON.stringify(valid));
  expect(e).not.toBeNull();
  expect(e!.agent).toBe("claude-code");
  expect(e!.model).toBe("claude-sonnet-4-6");
  expect(e!.timestamp).toBe(Date.parse("2026-08-03T09:05:53.848Z"));
  expect(e!.inputTokens).toBe(3);
  expect(e!.outputTokens).toBe(313);
  expect(e!.cacheWriteTokens).toBe(10524);
  expect(e!.cacheReadTokens).toBe(14761);
  expect(e!.reasoningTokens).toBe(0);
});

test("skips malformed JSON", () => {
  expect(parseLine("{not json")).toBeNull();
});

test("skips non-assistant lines", () => {
  const user = { ...valid, type: "user" };
  expect(parseLine(JSON.stringify(user))).toBeNull();
});

test("skips assistant lines without usage", () => {
  const noUsage = { ...valid, message: { model: "x" } };
  expect(parseLine(JSON.stringify(noUsage))).toBeNull();
});

test("defaults missing usage fields to 0", () => {
  const partial = {
    ...valid,
    message: { model: "m", usage: { output_tokens: 5 } },
  };
  const e = parseLine(JSON.stringify(partial));
  expect(e!.inputTokens).toBe(0);
  expect(e!.cacheWriteTokens).toBe(0);
});

test("skips lines with an unparseable timestamp", () => {
  const bad = { ...valid, timestamp: "not-a-date" };
  expect(parseLine(JSON.stringify(bad))).toBeNull();
});
