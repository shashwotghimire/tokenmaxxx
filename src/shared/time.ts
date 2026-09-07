export const DEFAULT_TIMEZONE = "UTC";
export function validTimeZone(value?: string | null): string {
  const candidate = value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  try { new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0); return candidate; } catch { return DEFAULT_TIMEZONE; }
}
export function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: validTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(timestamp);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}
export function dateKey(timestamp: number, timeZone: string): string { const p = zonedParts(timestamp, timeZone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; }
export function hourKey(timestamp: number, timeZone: string): string { return `${dateKey(timestamp, timeZone)} ${String(zonedParts(timestamp, timeZone).hour).padStart(2, "0")}:00`; }
export function zonedDateTimeToEpoch(date: string, timeZone: string, hour = 0): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!m) return undefined;
  const target = { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour };
  let guess = Date.UTC(target.year, target.month - 1, target.day, hour);
  for (let i = 0; i < 4; i++) { const p = zonedParts(guess, timeZone); const delta = Date.UTC(target.year, target.month - 1, target.day, target.hour) - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second); if (!delta) break; guess += delta; }
  return Number.isFinite(guess) ? guess : undefined;
}
export function shiftDate(date: string, days: number): string { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function dayRange(date: string, timeZone: string) { const since = zonedDateTimeToEpoch(date, timeZone); const until = zonedDateTimeToEpoch(shiftDate(date, 1), timeZone); return since === undefined || until === undefined ? undefined : { since, until }; }
export function todayRange(timeZone: string, now = Date.now()) { return dayRange(dateKey(now, timeZone), timeZone)!; }
