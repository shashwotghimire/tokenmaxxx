import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const appSource = readFileSync(path.join(import.meta.dir, "App.tsx"), "utf8");
const shellCss = readFileSync(path.join(import.meta.dir, "dashboard-shell.css"), "utf8");

describe("dashboard shell", () => {
  test("exposes an accessible tab interface", () => {
    expect(appSource).toContain('role="tablist"');
    expect(appSource).toContain('role="tab"');
    expect(appSource).toContain('aria-selected={tab === t.id}');
    expect(appSource).toContain('role="tabpanel"');
    expect(appSource).toContain('event.key === "ArrowRight"');
    expect(appSource).toContain('event.key === "ArrowLeft"');
  });

  test("keeps Hallmark mobile breakpoints explicit", () => {
    for (const width of [320, 414, 640, 900]) {
      expect(shellCss).toContain(`@media (max-width: ${width}px)`);
    }
    expect(shellCss).toContain("minmax(0, 1fr)");
    expect(shellCss).toContain("overflow-wrap: anywhere");
  });

  test("uses the locked design system tokens", () => {
    expect(shellCss).toContain("var(--color-accent)");
    expect(shellCss).toContain("var(--font-display)");
    expect(shellCss).toContain("var(--font-mono)");
    expect(shellCss).not.toContain("#fff");
    expect(shellCss).not.toContain("#000");
  });
});
