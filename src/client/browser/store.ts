import { computeStreaks, aggregateSummary, aggregateDaily, aggregateHourly, aggregateModels, aggregateAgents, aggregateContributions, aggregateStats, fmtLocalDate, sortSessions, toBreakdown, filterEvents } from "./aggregate";
import { buildForecastFromEvents } from "./forecast";
import type { SessionInfo, UsageEvent } from "./types";
import { AGENTS } from "../../server/sources/types";

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

function parseOpts(url: URL): { agent?: string; since?: number; until?: number; days?: number; horizon?: number; limit?: number } {
  const agent = url.searchParams.get("agent") ?? undefined;
  const since = maybeNum(url.searchParams.get("since"));
  const until = maybeNum(url.searchParams.get("until"));
  const days = maybeNum(url.searchParams.get("days"));
  const horizon = maybeNum(url.searchParams.get("horizon"));
  const limit = maybeNum(url.searchParams.get("limit"));
  return { agent, since, until, days, horizon, limit };
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
      const overall = buildForecastFromEvents(events, undefined, { horizon: opts.horizon });
      const agents: Record<string, ReturnType<typeof buildForecastFromEvents>> = {};
      for (const id of Object.values(AGENTS)) {
        agents[id] = buildForecastFromEvents(events, id, { horizon: opts.horizon });
      }
      return { asOf: Date.now(), overall, agents };
    }
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
