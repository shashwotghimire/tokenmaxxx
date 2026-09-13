import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const copy = [
  readFileSync(new URL("./landing.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./landing.html", import.meta.url), "utf8"),
].join("\n");

describe("landing-page copy", () => {
  test("states the product and next step in plain language", () => {
    expect(copy).toContain("See what your AI coding tools cost.");
    expect(copy).toContain("Set it up");
    expect(copy).toContain("Your files stay on the machine you choose.");
    expect(copy).not.toContain('href="/dashboard"');
    expect(copy).not.toContain('id: "dashboard"');
  });

  test("does not sell source access, price, or vague product language as features", () => {
    expect(copy).not.toMatch(/open[ -]source/i);
    expect(copy).not.toMatch(/\bfree\b/i);
    expect(copy).not.toMatch(/\btelemetry\b/i);
    expect(copy).not.toMatch(/\bguardrails?\b/i);
    expect(copy).not.toMatch(/\bzero[- ]config\b/i);
    expect(copy).not.toMatch(/\blocal-first\b/i);
  });
});
