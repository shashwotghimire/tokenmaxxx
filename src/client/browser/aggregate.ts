import type { Breakdown, SessionInfo, UsageEvent } from "./types";

export interface QueryOpts {
  agent?: string;
  since?: number;
  until?: number;
}

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtLocalDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtLocalHour(ts: number): string {
  const d = new Date(ts);
  return `${fmtLocalDate(ts)} ${pad(d.getHours())}:00`;
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function filterEvents(evts: UsageEvent[], opts: QueryOpts): UsageEvent[] {
  return evts.filter(
    (e) =>
      (!opts.agent || e.agent === opts.agent) &&
      (opts.since === undefined || e.timestamp >= opts.since) &&
      (opts.until === undefined || e.timestamp < opts.until)
  );
}

export function toBreakdown(evts: UsageEvent[]): Breakdown {
  const out: Breakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
  for (const e of evts) {
    out.inputTokens += e.inputTokens;
    out.outputTokens += e.outputTokens;
    out.cacheWriteTokens += e.cacheWriteTokens;
    out.cacheReadTokens += e.cacheReadTokens;
    out.reasoningTokens += e.reasoningTokens;
    out.cost += e.cost;
  }
  out.totalTokens =
    out.inputTokens + out.outputTokens + out.cacheWriteTokens + out.cacheReadTokens + out.reasoningTokens;
  return out;
}

function addTo(a: Breakdown, b: Breakdown): Breakdown {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.cacheWriteTokens += b.cacheWriteTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.reasoningTokens += b.reasoningTokens;
  a.totalTokens += b.totalTokens;
  a.cost += b.cost;
  return a;
}

export function aggregateSummary(evts: UsageEvent[], opts: QueryOpts = {}) {
  const start = startOfToday();
  const today = toBreakdown(filterEvents(evts, { ...opts, since: start, until: start + DAY_MS }));
  const allTime = toBreakdown(filterEvents(evts, { agent: opts.agent }));
  return { today, allTime, now: Date.now() };
}

export function aggregateDaily(
  evts: UsageEvent[],
  opts: QueryOpts & { days?: number }
): { date: string; totals: Breakdown }[] {
  const days = opts.days ?? 7;
  const since = opts.since ?? startOfToday() - days * DAY_MS;
  const until = opts.until ?? Date.now() + DAY_MS;
  const map = new Map<string, Breakdown>();
  for (const e of filterEvents(evts, { ...opts, since, until })) {
    const date = fmtLocalDate(e.timestamp);
    map.set(date, addTo(map.get(date) ?? zeroBreakdown(), toBreakdown([e])));
  }
  return [...map.entries()]
    .map(([date, totals]) => ({ date, totals }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function aggregateHourly(
  evts: UsageEvent[],
  opts: QueryOpts & { date?: string; days?: number }
): { hour: string; totals: Breakdown }[] {
  const since = opts.since;
  const until = opts.until;
  const map = new Map<string, Breakdown>();
  for (const e of filterEvents(evts, { ...opts, since, until })) {
    const hour = fmtLocalHour(e.timestamp);
    map.set(hour, addTo(map.get(hour) ?? zeroBreakdown(), toBreakdown([e])));
  }
  return [...map.entries()]
    .map(([hour, totals]) => ({ hour, totals }))
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));
}

function groupBy<T>(evts: UsageEvent[], key: (e: UsageEvent) => string): { key: string; totals: Breakdown }[] {
  const map = new Map<string, Breakdown>();
  for (const e of evts) {
    const k = key(e);
    map.set(k, addTo(map.get(k) ?? zeroBreakdown(), toBreakdown([e])));
  }
  return [...map.entries()].map(([key, totals]) => ({ key, totals }));
}

export function aggregateModels(evts: UsageEvent[], opts: QueryOpts): { model: string; agent: string; totals: Breakdown }[] {
  const byModel = new Map<string, Breakdown>();
  const byModelAgent = new Map<string, Map<string, number>>();
  for (const e of filterEvents(evts, opts)) {
    const k = e.model;
    byModel.set(k, addTo(byModel.get(k) ?? zeroBreakdown(), toBreakdown([e])));
    const perAgent = byModelAgent.get(k) ?? new Map<string, number>();
    const total = e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens + e.reasoningTokens;
    perAgent.set(e.agent, (perAgent.get(e.agent) ?? 0) + total);
    byModelAgent.set(k, perAgent);
  }
  return [...byModel.entries()]
    .map(([model, totals]) => {
      let agent = "opencode";
      let best = -1;
      for (const [a, t] of byModelAgent.get(model) ?? []) {
        if (t > best) {
          best = t;
          agent = a;
        }
      }
      return { model, agent, totals };
    })
    .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
}

export function aggregateAgents(evts: UsageEvent[], opts: QueryOpts): { agent: string; totals: Breakdown }[] {
  return groupBy(filterEvents(evts, opts), (e) => e.agent)
    .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens)
    .map((g) => ({ agent: g.key, totals: g.totals }));
}

export function aggregateContributions(
  evts: UsageEvent[],
  opts: QueryOpts & { days?: number }
): { date: string; totalTokens: number; cost: number }[] {
  const days = opts.days ?? 365;
  const since = opts.since ?? startOfToday() - days * DAY_MS;
  const until = opts.until ?? Date.now() + DAY_MS;
  const map = new Map<string, { totalTokens: number; cost: number }>();
  for (const e of filterEvents(evts, { ...opts, since, until })) {
    const date = fmtLocalDate(e.timestamp);
    const cur = map.get(date) ?? { totalTokens: 0, cost: 0 };
    cur.totalTokens +=
      e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens + e.reasoningTokens;
    cur.cost += e.cost;
    map.set(date, cur);
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, totalTokens: v.totalTokens, cost: v.cost }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function aggregateStats(evts: UsageEvent[], opts: QueryOpts) {
  const filtered = filterEvents(evts, opts);
  const totals = toBreakdown(filtered);

  const byDay = new Map<string, number>();
  const byHour = new Map<number, number>();
  for (const e of filtered) {
    const d = fmtLocalDate(e.timestamp);
    byDay.set(d, (byDay.get(d) ?? 0) + e.cost);
    const h = new Date(e.timestamp).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + e.cost);
  }

  let busiestDay: string | null = null;
  let busiestDayCost = -1;
  for (const [d, cost] of byDay) {
    if (cost > busiestDayCost) {
      busiestDay = d;
      busiestDayCost = cost;
    }
  }

  let busiestHour: number | null = null;
  let busiestHourCost = -1;
  for (const [h, cost] of byHour) {
    if (cost > busiestHourCost) {
      busiestHour = h;
      busiestHourCost = cost;
    }
  }

  const byModel = new Map<string, number>();
  const byAgent = new Map<string, number>();
  for (const e of filtered) {
    byModel.set(e.model, (byModel.get(e.model) ?? 0) + e.cost);
    byAgent.set(e.agent, (byAgent.get(e.agent) ?? 0) + e.cost);
  }
  let topModel: string | null = null;
  let topModelCost = -1;
  for (const [m, cost] of byModel) {
    if (cost > topModelCost) {
      topModel = m;
      topModelCost = cost;
    }
  }
  let topAgent: string | null = null;
  let topAgentCost = -1;
  for (const [a, cost] of byAgent) {
    if (cost > topAgentCost) {
      topAgent = a;
      topAgentCost = cost;
    }
  }

  const activeDates = [...byDay.keys()].sort();
  return {
    totals,
    days: activeDates.length,
    busiestDay,
    busiestHour,
    topModel,
    topAgent,
    streaks: computeStreaks(activeDates),
  };
}

export function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };
  const now = new Date();
  const today = fmtLocalDate(now.getTime());
  const yesterday = fmtLocalDate(now.getTime() - DAY_MS);
  const set = new Set(dates);

  let current = 0;
  let cursor: Date | null = set.has(today)
    ? now
    : set.has(yesterday)
      ? new Date(now.getTime() - DAY_MS)
      : null;
  if (cursor) {
    let d = new Date(cursor.getTime());
    while (set.has(fmtLocalDate(d.getTime()))) {
      current++;
      d = new Date(d.getTime() - DAY_MS);
    }
  }

  let longest = 0;
  const sorted = [...dates].sort();
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]! + "T00:00:00").getTime();
    const b = new Date(sorted[i]! + "T00:00:00").getTime();
    run = b - a === DAY_MS ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  longest = Math.max(longest, run);

  return { current, longest };
}

function zeroBreakdown(): Breakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
}

/** Sort sessions most-recently-updated first, matching the server query. */
export function sortSessions(sessions: SessionInfo[], limit: number): SessionInfo[] {
  return [...sessions]
    .sort((a, b) => (b.timeUpdated ?? 0) - (a.timeUpdated ?? 0))
    .slice(0, Math.min(limit ?? 500, 5000));
}
