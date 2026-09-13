import { computeStreaks, aggregateSummary, aggregateDaily, aggregateHourly, aggregateModels, aggregateAgents, aggregateContributions, aggregateStats, fmtLocalDate, sortSessions, toBreakdown, filterEvents } from "./aggregate";
import { buildForecastFromEvents } from "./forecast";
import type { SessionInfo, UsageEvent } from "./types";
import { AGENTS } from "../../server/sources/types";
import { dayRange, validTimeZone } from "../../shared/time";

let mode: "server" | "browser" = "server";
let events: UsageEvent[] = [];
let sessions: SessionInfo[] = [];
let sources: string[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function getVersion(): number {
  return version;
}

export function isBrowserMode(): boolean {
  return mode === "browser";
}

export function getSourceCount(): number {
  return sources.length;
}

export function getEventCount(): number {
  return events.length;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  version++;
  for (const fn of listeners) fn();
}

export function disconnect() {
  mode = "server";
  events = [];
  sessions = [];
  sources = [];
  notify();
}

export function setBrowserData(next: { events: UsageEvent[]; sessions: SessionInfo[]; sources: string[] }) {
  events = next.events;
  sessions = next.sessions;
  sources = next.sources;
  mode = "browser";
  notify();
}

/** Replace the loaded events (after a rescan) without leaving browser mode. */
export function updateBrowserEvents(next: { events: UsageEvent[]; sessions: SessionInfo[]; sources: string[] }) {
  events = next.events;
  sessions = next.sessions;
  sources = next.sources;
  notify();
}

function parseOpts(url: URL): { agent?: string; model?: string; project?: string; timeZone?: string; since?: number; until?: number; days?: number; horizon?: number; limit?: number; scenario?: "baseline" | "workdays" | "quiet" | "busy" } {
  const agent = url.searchParams.get("agent") ?? undefined;
  const timeZone = validTimeZone(url.searchParams.get("tz"));
  const sinceRaw = url.searchParams.get("since"); const untilRaw = url.searchParams.get("until");
  const since = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? dayRange(sinceRaw, timeZone)?.since : maybeNum(sinceRaw);
  const until = untilRaw && /^\d{4}-\d{2}-\d{2}$/.test(untilRaw) ? dayRange(untilRaw, timeZone)?.until : maybeNum(untilRaw);
  const days = maybeNum(url.searchParams.get("days"));
  const horizon = maybeNum(url.searchParams.get("horizon"));
  const limit = maybeNum(url.searchParams.get("limit"));
  const scenarioRaw = url.searchParams.get("scenario"); const scenario = scenarioRaw === "workdays" || scenarioRaw === "quiet" || scenarioRaw === "busy" ? scenarioRaw : "baseline";
  return { agent, model: url.searchParams.get("model") ?? undefined, project: url.searchParams.get("project") ?? undefined, timeZone, since, until, days, horizon, limit, scenario };
}

function maybeNum(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Serve a browser-mode API response for the given URL, or null to fall back to the server. */
export function maybeBrowserApi(url: string): unknown | null {
  if (mode !== "browser") return null;
  let u: URL;
  try {
    u = new URL(url, typeof location !== "undefined" ? location.origin : "http://localhost");
  } catch {
    return null;
  }
  const opts = parseOpts(u);

  switch (u.pathname) {
    case "/api/summary":
      return aggregateSummary(events, opts);
    case "/api/daily":
      return aggregateDaily(events, opts);
    case "/api/hourly":
      return aggregateHourly(events, opts);
    case "/api/models":
      return aggregateModels(events, opts);
    case "/api/agents":
      return aggregateAgents(events, opts);
    case "/api/contributions":
      return aggregateContributions(events, opts);
    case "/api/stats":
      return aggregateStats(events, opts);
    case "/api/sessions":
      return sortSessions(sessions, opts.limit ?? 500);
    case "/api/export/events":
      return filterEvents(events, opts).slice(0, opts.limit ?? 100_000);
    case "/api/export/sessions":
      return sortSessions(sessions, opts.limit ?? 100_000);
    case "/api/forecast": {
      const overall = buildForecastFromEvents(events, undefined, { horizon: opts.horizon, scenario: opts.scenario });
      const agents: Record<string, ReturnType<typeof buildForecastFromEvents>> = {};
      for (const id of Object.values(AGENTS)) {
        agents[id] = buildForecastFromEvents(events, id, { horizon: opts.horizon, scenario: opts.scenario });
      }
      return { asOf: Date.now(), overall, agents };
    }
    case "/api/projects": {
      const map = new Map<string, { project: string; tokens: number; cost: number; events: number }>();
      for (const e of filterEvents(events, opts)) { const project = e.project ?? "Unknown project"; const r = map.get(project) ?? { project, tokens: 0, cost: 0, events: 0 }; r.tokens += e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens + e.reasoningTokens; r.cost += e.cost; r.events++; map.set(project, r); }
      return [...map.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
    }
    case "/api/project-trends": {
      const current = maybeBrowserApi("/api/projects" + u.search) as Array<{ project:string; tokens:number; cost:number; events:number }>;
      return current.map((p) => ({ ...p, priorCost: 0, costChange: null }));
    }
    case "/api/cache": {
      const rows = filterEvents(events, opts); const input = rows.reduce((n, e) => n + e.inputTokens, 0); const read = rows.reduce((n, e) => n + e.cacheReadTokens, 0); const write = rows.reduce((n, e) => n + e.cacheWriteTokens, 0);
      return { measurable: input + read > 0, denominator: "input + cache-read tokens", hitRate: input + read ? read / (input + read) : null, inputTokens: input, cacheReadTokens: read, cacheWriteTokens: write, estimatedSavings: null, savingsNote: "Unavailable without a verified uncached price comparison.", hotspots: [] };
    }
    case "/api/comparison": {
      const currentRows = filterEvents(events, opts); const start = opts.since ?? Math.min(...currentRows.map((e) => e.timestamp), Date.now()); const end = opts.until ?? Date.now(); const priorRows = filterEvents(events, { ...opts, since: start - (end - start), until: start });
      const sum = (rows: UsageEvent[]) => ({ tokens: rows.reduce((n,e) => n + e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens + e.reasoningTokens, 0), cost: rows.reduce((n,e) => n + e.cost, 0), events: rows.length }); const a=sum(currentRows), b=sum(priorRows);
      return { current:a, prior:b, change:{ tokens:b.tokens?(a.tokens-b.tokens)/b.tokens:null, cost:b.cost?(a.cost-b.cost)/b.cost:null }, currentPeriodIncomplete:end>=Date.now(), contributors: maybeBrowserApi("/api/projects") };
    }
    case "/api/diagnostics":
      return { generatedAt: Date.now(), duplicateImportsPrevented: events.filter((e) => e.sourceEventId).length, missingModel: events.filter((e) => e.model === "unknown").length, unknownPricing: 0, partialMeasurements: events.filter((e) => e.measurementStatus === "partial").length, parseErrors: null, note: "Parse errors are skipped during browser import and are not historically counted.", pricing: { currency: "USD", version: "bundled snapshot", methodology: "API-equivalent estimate; not a billed amount" } };
    case "/api/source-status":
      return { origin: "browser", mode: "browser-local" };
    default:
      return null;
  }
}

/** Whether any usage data is available (server or browser). */
export function hasAnyData(): boolean {
  return events.length > 0;
}

export function todayLabel(): string {
  return fmtLocalDate(Date.now());
}

export { toBreakdown, computeStreaks };
