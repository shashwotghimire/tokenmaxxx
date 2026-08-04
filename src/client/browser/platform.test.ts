import { test, expect } from "bun:test";
import { defaultPaths } from "./platform";

test("defaultPaths: macOS/Linux use tilde paths", () => {
  const p = defaultPaths("macOS");
  expect(p.claude).toBe("~/.claude/projects");
  expect(p.opencode).toBe("~/.local/share/opencode/opencode.db");
  expect(p.codex).toBe("~/.codex/state_*.sqlite");
  expect(defaultPaths("Linux")).toEqual(p);
});

test("defaultPaths: Windows uses %USERPROFILE%", () => {
  const p = defaultPaths("Windows");
  expect(p.claude).toBe("%USERPROFILE%\\.claude\\projects");
  expect(p.opencode).toBe("%USERPROFILE%\\.local\\share\\opencode\\opencode.db");
  expect(p.codex).toBe("%USERPROFILE%\\.codex\\state_*.sqlite");
});
