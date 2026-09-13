import { getDb } from "./db";
import { getAllEvents, getSessions, type QueryOptions } from "./aggregator";
import { projectLabel } from "../shared/privacy";
import { dateKey, shiftDate, todayRange, validTimeZone } from "../shared/time";
import { pricingMetadata } from "./pricing";

const total = (e: ReturnType<typeof getAllEvents>[number]) => e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens + e.reasoningTokens;

export function getProjects(opts: QueryOptions) {
  const events = getAllEvents({ ...opts, limit: 1_000_000 });
  const sessionProjects = new Map(getSessions({ limit: 100_000 }).map((s) => [s.sessionId, projectLabel(s.cwd)]));
  const map = new Map<string, { project: string; tokens: number; cost: number; events: number }>();
  for (const e of events) { const key = e.project ?? (e.sessionId ? sessionProjects.get(e.sessionId) : undefined) ?? "Unknown project"; const row = map.get(key) ?? { project: key, tokens: 0, cost: 0, events: 0 }; row.tokens += total(e); row.cost += e.cost; row.events++; map.set(key, row); }
  return [...map.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
}
export function getProjectTrends(opts: QueryOptions) {
  const end = opts.until ?? Date.now(); const start = opts.since ?? end - 7 * 86_400_000; const duration = end - start;
  const current = getProjects({ ...opts, since: start, until: end }); const prior = new Map(getProjects({ ...opts, since: start - duration, until: start }).map((p) => [p.project, p]));
  return current.map((p) => ({ ...p, priorCost: prior.get(p.project)?.cost ?? 0, costChange: prior.get(p.project)?.cost ? (p.cost - prior.get(p.project)!.cost) / prior.get(p.project)!.cost : null }));
}

export function getCacheAnalytics(opts: QueryOptions) {
  const events = getAllEvents({ ...opts, limit: 1_000_000 });
  const input = events.reduce((n, e) => n + e.inputTokens, 0);
  const read = events.reduce((n, e) => n + e.cacheReadTokens, 0);
  const write = events.reduce((n, e) => n + e.cacheWriteTokens, 0);
  const measurable = input + read > 0;
  const hotspots = new Map<string, number>();
  for (const e of events) if (e.cacheReadTokens > 0) hotspots.set(e.project ?? e.model, (hotspots.get(e.project ?? e.model) ?? 0) + e.cacheReadTokens);
  return { measurable, denominator: "input + cache-read tokens", hitRate: measurable ? read / (input + read) : null, inputTokens: input, cacheReadTokens: read, cacheWriteTokens: write, estimatedSavings: null, savingsNote: "Unavailable without a verified uncached price comparison.", hotspots: [...hotspots].map(([label, tokens]) => ({ label, tokens })).sort((a, b) => b.tokens - a.tokens).slice(0, 10) };
}

export function getComparison(opts: QueryOptions) {
  const tz = validTimeZone(opts.timeZone); const now = Date.now(); const end = opts.until ?? now;
  const start = opts.since ?? todayRange(tz, now).since; const duration = Math.max(1, end - start);
  const current = getAllEvents({ ...opts, since: start, until: end, limit: 1_000_000 });
  const prior = getAllEvents({ ...opts, since: start - duration, until: start, limit: 1_000_000 });
  const summarize = (rows: typeof current) => ({ tokens: rows.reduce((n, e) => n + total(e), 0), cost: rows.reduce((n, e) => n + e.cost, 0), events: rows.length });
  const a = summarize(current), b = summarize(prior);
  return { current: a, prior: b, change: { tokens: b.tokens ? (a.tokens - b.tokens) / b.tokens : null, cost: b.cost ? (a.cost - b.cost) / b.cost : null }, currentPeriodIncomplete: end >= now, range: { since: start, until: end, priorSince: start - duration, priorUntil: start, timeZone: tz }, contributors: getProjects({ ...opts, since: start, until: end }).slice(0, 5) };
}

export function getDiagnostics() {
  const db = getDb();
  const one = (sql: string) => Number((db.query(sql).get() as { n: number }).n);
  return {
    generatedAt: Date.now(),
    duplicateImportsPrevented: one("SELECT COUNT(*) n FROM usage_events WHERE source_event_id IS NOT NULL"),
    missingModel: one("SELECT COUNT(*) n FROM usage_events WHERE model = 'unknown'"),
    unknownPricing: one("SELECT COUNT(*) n FROM usage_events WHERE cost_status = 'unknown'"),
    partialMeasurements: one("SELECT COUNT(*) n FROM usage_events WHERE measurement_status = 'partial'"),
    parseErrors: null,
    note: "Parse errors are logged but historical counts are unavailable for data ingested before this version.",
    pricing: pricingMetadata(),
  };
}

export function getSessionDetail(agent: string, sessionId: string) {
  const session = getSessions({ agent, limit: 100_000 }).find((s) => s.sessionId === sessionId);
  if (!session) return null;
  const timeline = getAllEvents({ agent, sessionId, limit: 10_000 }).sort((a, b) => a.timestamp - b.timestamp);
  return { session, timeline, modelChanges: [...new Set(timeline.map((e) => e.model))], expensiveEvents: [...timeline].sort((a, b) => b.cost - a.cost).slice(0, 10), coverage: session.measurementNote ?? (timeline.length ? "Per-event timeline available." : "Only session totals are available from this source.") };
}
