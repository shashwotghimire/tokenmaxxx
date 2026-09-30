import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RolloutTracker, codexStateDir, listRollouts, rolloutRoots } from "./codex";

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

test("resolves the Codex home from env vars", () => {
  const saved = { state: process.env.TOKENMAXXX_CODEX_STATE_DIR, home: process.env.CODEX_HOME };
  try {
    delete process.env.TOKENMAXXX_CODEX_STATE_DIR;
    process.env.CODEX_HOME = "/custom/codex";
    expect(codexStateDir()).toBe("/custom/codex");
    process.env.TOKENMAXXX_CODEX_STATE_DIR = "/override";
    expect(codexStateDir()).toBe("/override");
  } finally {
    if (saved.state === undefined) delete process.env.TOKENMAXXX_CODEX_STATE_DIR; else process.env.TOKENMAXXX_CODEX_STATE_DIR = saved.state;
    if (saved.home === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = saved.home;
  }
});

test("lists active and archived rollouts, tolerating missing roots", () => {
  const home = mkdtempSync(path.join(tmpdir(), "codex-"));
  mkdirSync(path.join(home, "sessions", "2026", "09", "30"), { recursive: true });
  mkdirSync(path.join(home, "archived_sessions"), { recursive: true });
  writeFileSync(path.join(home, "sessions", "2026", "09", "30", "rollout-a.jsonl"), "");
  writeFileSync(path.join(home, "archived_sessions", "rollout-b.jsonl"), "");
  writeFileSync(path.join(home, "sessions", "notes.txt"), "");
  const files = rolloutRoots(home).flatMap(root => listRollouts(root)).map(f => path.basename(f)).sort();
  expect(files).toEqual(["rollout-a.jsonl", "rollout-b.jsonl"]);
  expect(listRollouts(path.join(home, "missing"))).toEqual([]);
});
