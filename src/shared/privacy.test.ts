import { expect, test } from "bun:test";
import { projectLabel, redactSecrets, sanitizeTitle } from "./privacy";
test("redacts cookies, bearer tokens, and API keys", () => {
  const s = redactSecrets("cookie=sessionId=secretvalue123456 Authorization: Bearer abc.def.ghi sk-abcdefghijklmnopqrstuvwxyz");
  expect(s).not.toContain("secretvalue"); expect(s).not.toContain("abc.def"); expect(s).not.toContain("abcdefghijklmnopqrstuvwxyz");
});
test("titles strip wrappers, markdown links, markup and truncate", () => {
  const s = sanitizeTitle("<handoff> [skill](skill://private) BEGIN MESSAGE " + "x".repeat(200));
  expect(s).not.toContain("<"); expect(s).not.toContain("skill://"); expect(s.length).toBeLessThanOrEqual(96);
});
test("empty titles get a safe fallback and paths become project labels", () => {
  expect(sanitizeTitle("")).toBe("Untitled session"); expect(projectLabel("/Users/person/private/tokenmaxxx")).toBe("tokenmaxxx");
});
