import { expect, test } from "bun:test";
import { dateKey, dayRange, hourKey } from "./time";
test("Asia/Kathmandu midnight uses +05:45 boundaries", () => {
  const r = dayRange("2026-09-05", "Asia/Kathmandu")!;
  expect(new Date(r.since).toISOString()).toBe("2026-09-04T18:15:00.000Z");
  expect(new Date(r.until).toISOString()).toBe("2026-09-05T18:15:00.000Z");
  expect(dateKey(Date.parse("2026-09-04T18:15:00Z"), "Asia/Kathmandu")).toBe("2026-09-05");
});
test("UTC boundaries are exact", () => { const r = dayRange("2026-09-05", "UTC")!; expect(r.until - r.since).toBe(86_400_000); });
test("DST days are not assumed to be 24 hours", () => {
  expect(dayRange("2026-03-08", "America/New_York")!.until - dayRange("2026-03-08", "America/New_York")!.since).toBe(23 * 3_600_000);
  expect(dayRange("2026-11-01", "America/New_York")!.until - dayRange("2026-11-01", "America/New_York")!.since).toBe(25 * 3_600_000);
});
test("hour keys use the selected timezone", () => { expect(hourKey(Date.parse("2026-09-05T00:15:00Z"), "Asia/Kathmandu")).toBe("2026-09-05 06:00"); });
