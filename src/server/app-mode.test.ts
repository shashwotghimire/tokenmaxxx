import { describe, expect, test } from "bun:test";
import { selectRootRoute } from "./app-mode";

describe("app entry mode", () => {
  const routes = { landing: "landing", dashboard: "dashboard" } as const;

  test("opens the dashboard at root when the dashboard is enabled", () => {
    expect(selectRootRoute(true, routes)).toBe("dashboard");
  });

  test("keeps the hosted landing page at root when the dashboard is disabled", () => {
    expect(selectRootRoute(false, routes)).toBe("landing");
  });
});
