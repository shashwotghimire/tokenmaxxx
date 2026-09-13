import { expect, test } from "bun:test";
import { budgetAlertKey, budgetState } from "./budget";
test("budget rules clamp remaining and identify a crossing", () => {
  expect(budgetState(8, 10)).toEqual({ configured: true, remaining: 2, exceeded: false, ratio: .8 });
  expect(budgetState(12, 10)).toEqual({ configured: true, remaining: 0, exceeded: true, ratio: 1.2 });
});
test("unset budgets are distinct from zero remaining", () => { expect(budgetState(5, 0).remaining).toBeNull(); });
test("deduplication keys include period, date, and allowance", () => { expect(budgetAlertKey("2026-09-05", 10)).toBe("tokenmaxxx:budget-alert:daily:2026-09-05:10.00"); });
