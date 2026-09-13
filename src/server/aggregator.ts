import { mergeUsage, tokenFields } from "../shared/usage";
import { getDb } from "./db";
import { costForEvent, pricingMetadata } from "./pricing";
import { normalizeModel } from "../shared/models";
import { projectLabel, redactPath, sanitizeTitle } from "../shared/privacy";
import { dateKey, hourKey, shiftDate, todayRange, validTimeZone, zonedDateTimeToEpoch } from "../shared/time";
import type { SessionInfo, UsageEvent } from "./sources/types";

export interface DateRange {
  since?: number;
  until?: number;
}

export interface QueryOptions {
  agent?: string;
  model?: string;
  project?: string;
  sessionId?: string;
  since?: number;
  until?: number;
  timeZone?: string;
}

function buildWhere(opts: QueryOptions): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts.agent) {
    clauses.push("agent = ?");
    params.push(opts.agent);
  }
  if (opts.model) { clauses.push("model = ?"); params.push(normalizeModel(opts.model).model); }
  if (opts.project) { clauses.push("project = ?"); params.push(opts.project); }
  if (opts.sessionId) { clauses.push("session_id = ?"); params.push(opts.sessionId); }
  if (opts.since !== undefined) {
    clauses.push("timestamp >= ?");
    params.push(opts.since);
  }
  if (opts.until !== undefined) {
    clauses.push("timestamp < ?");
    params.push(opts.until);
  }
  return { where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", params };
}

function storeEvent(event: UsageEvent): UsageEvent & { cost: number; changed: boolean; delta?: UsageEvent & { cost: number } } {
  const normalized = normalizeModel(event.model);
  event = { ...event, model: normalized.model, rawModel: event.rawModel ?? normalized.rawModel };
  const db = getDb();
  if (event.sourceEventId && (event.agent === "opencode" || (event.agent === "claude-code" && event.sourceEventId.startsWith("response:")))) {
    const previous = db.query(`SELECT input_tokens AS inputTokens, output_tokens AS outputTokens,
      cache_write_tokens AS cacheWriteTokens, cache_read_tokens AS cacheReadTokens,
      reasoning_tokens AS reasoningTokens FROM usage_events WHERE agent = ? AND source_event_id = ?`)
      .get(event.agent, event.sourceEventId) as UsageEvent | null;
    if (previous) {
      event = { ...event, ...mergeUsage(previous, event) };
      const priced = costForEvent(event);
      db.query(`UPDATE usage_events SET input_tokens=?, output_tokens=?, cache_write_tokens=?,
        cache_read_tokens=?, reasoning_tokens=?, cost=? WHERE agent=? AND source_event_id=?`)
        .run(event.inputTokens, event.outputTokens, event.cacheWriteTokens, event.cacheReadTokens,
          event.reasoningTokens, priced ?? 0, event.agent, event.sourceEventId!);
      const delta = { ...event };
      for (const key of tokenFields) delta[key] -= previous[key];
      return { ...event, cost: priced ?? 0, changed: tokenFields.some((key) => delta[key] !== 0),
        delta: { ...delta, cost: costForEvent(delta) ?? 0 } };
    }
  }
  const priced = costForEvent(event);
  const cost = priced ?? 0;
  const existing = event.sourceEventId ? db.query("SELECT id FROM usage_events WHERE agent = ? AND source_event_id = ? LIMIT 1").get(event.agent, event.sourceEventId) : db
    .query(
      `SELECT id FROM usage_events
       WHERE agent = ? AND model = ? AND timestamp = ?
         AND input_tokens = ? AND output_tokens = ?
         AND cache_write_tokens = ? AND cache_read_tokens = ?
         AND reasoning_tokens = ? LIMIT 1`
    )
    .get(
      event.agent,
      event.model,
      event.timestamp,
      event.inputTokens,
      event.outputTokens,
      event.cacheWriteTokens,
      event.cacheReadTokens,
      event.reasoningTokens
    );
  if (existing) {
    // Already ingested (e.g. re-backfill after a restart) — do not duplicate.
    return { ...event, cost, changed: false };
  }
  db.query(
    `INSERT INTO usage_events
        (agent, model, timestamp, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, reasoning_tokens, cost,
         source_event_id, raw_model, session_id, project, measurement_status, cost_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.agent,
    event.model,
    event.timestamp,
    event.inputTokens,
    event.outputTokens,
    event.cacheWriteTokens,
    event.cacheReadTokens,
    event.reasoningTokens,
    cost, event.sourceEventId ?? null, event.rawModel ?? event.model, event.sessionId ?? null,
    event.project ?? null, event.measurementStatus ?? "complete", priced === null ? "unknown" : priced === 0 ? "free" : "estimated"
  );
  return { ...event, cost, changed: true };
}

/** Commit response replacement and session refresh together. */
export function handleEvent(event: UsageEvent) {
  return getDb().transaction(() => {
    const stored = storeEvent(event);
    if (event.sessionId && stored.changed) {
      handleSession({ agent: event.agent, sessionId: event.sessionId, title: null,
        model: event.model, cwd: null, gitBranch: null, tokens: 0, cost: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
        reasoningTokens: 0, timeCreated: event.timestamp, timeUpdated: event.timestamp });
    }
    return stored;
  })();
}

export function handleSession(session: SessionInfo): SessionInfo {
  const totals = getDb().query(`SELECT COUNT(*) AS n, SUM(input_tokens) AS inputTokens,
    SUM(output_tokens) AS outputTokens, SUM(cache_read_tokens) AS cacheReadTokens,
    SUM(cache_write_tokens) AS cacheWriteTokens, SUM(reasoning_tokens) AS reasoningTokens,
    SUM(cost) AS cost FROM usage_events WHERE agent = ? AND session_id = ?`)
    .get(session.agent, session.sessionId) as { n: number } & SessionInfo;
  if (totals.n) {
    session = { ...session, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens, cacheWriteTokens: totals.cacheWriteTokens,
      reasoningTokens: totals.reasoningTokens, cost: totals.cost,
      tokens: tokenFields.reduce((n, key) => n + totals[key], 0) };
  }
  session = {
    ...session,
    title: sanitizeTitle(session.title),
    cwd: session.cwd ? String(session.cwd) : null,
    model: session.model ? normalizeModel(session.model).model : null,
  };
  getDb()
    .query(
      `INSERT INTO sessions
        (agent, session_id, title, model, cwd, git_branch, tokens, cost,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         reasoning_tokens, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent, session_id) DO UPDATE SET
        title = COALESCE(excluded.title, sessions.title),
        model = COALESCE(excluded.model, sessions.model),
        cwd = COALESCE(excluded.cwd, sessions.cwd),
        git_branch = COALESCE(excluded.git_branch, sessions.git_branch),
        tokens = excluded.tokens,
        cost = excluded.cost,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_read_tokens = excluded.cache_read_tokens,
        cache_write_tokens = excluded.cache_write_tokens,
        reasoning_tokens = excluded.reasoning_tokens,
        time_created = MIN(COALESCE(sessions.time_created, excluded.time_created), COALESCE(excluded.time_created, sessions.time_created)),
        time_updated = MAX(COALESCE(sessions.time_updated, excluded.time_updated), COALESCE(excluded.time_updated, sessions.time_updated))`
    )
    .run(
      session.agent,
      session.sessionId,
      session.title,
      session.model,
      session.cwd,
      session.gitBranch,
      session.tokens,
      session.cost,
      session.inputTokens,
      session.outputTokens,
      session.cacheReadTokens,
      session.cacheWriteTokens,
      session.reasoningTokens,
      session.timeCreated,
      session.timeUpdated
    );
  return session;
}

interface SessionRow {
  agent: string;
  session_id: string;
  title: string | null;
  model: string | null;
  cwd: string | null;
  git_branch: string | null;
  tokens: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  time_created: number | null;
  time_updated: number | null;
}

export function getSessions(opts: QueryOptions & { limit?: number }): SessionInfo[] {
  const { where, params } = buildWhereUpdated(opts);
  const limit = Math.min(opts.limit ?? 500, 100_000);
  const rows = getDb()
    .query(
      `SELECT agent, session_id, title, model, cwd, git_branch, tokens, cost,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              reasoning_tokens, time_created, time_updated
       FROM sessions ${where}
       ORDER BY time_updated DESC
       LIMIT ${limit}`
    )
    .all(...params) as SessionRow[];
  return rows.map((r) => ({
    agent: r.agent as SessionInfo["agent"],
    sessionId: r.session_id,
    title: sanitizeTitle(r.title),
    model: r.model,
    cwd: r.cwd,
    gitBranch: r.git_branch,
    tokens: r.tokens,
    cost: r.cost,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    reasoningTokens: r.reasoning_tokens,
    timeCreated: r.time_created,
    timeUpdated: r.time_updated,
    measurementStatus: "complete",
    measurementNote: null,
  }));
}

export function getAllEvents(opts: QueryOptions & { limit?: number }): (UsageEvent & { cost: number })[] {
  const { where, params } = buildWhere(opts);
  const limit = Math.min(opts.limit ?? 100_000, 1_000_000);
  const rows = getDb()
    .query(
      `SELECT agent, model, timestamp, input_tokens, output_tokens,
              cache_write_tokens, cache_read_tokens, reasoning_tokens, cost,
              source_event_id, raw_model, session_id, project, measurement_status
       FROM usage_events ${where}
       ORDER BY timestamp DESC
       LIMIT ${limit}`
    )
    .all(...params) as {
    agent: string;
    model: string;
    timestamp: number;
    input_tokens: number;
    output_tokens: number;
    cache_write_tokens: number;
    cache_read_tokens: number;
    reasoning_tokens: number;
    cost: number;
    source_event_id: string | null; raw_model: string | null; session_id: string | null; project: string | null; measurement_status: "complete" | "partial";
  }[];
  return rows.map((r) => ({
    agent: r.agent as UsageEvent["agent"],
    model: r.model,
    timestamp: r.timestamp,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    cacheReadTokens: r.cache_read_tokens,
    reasoningTokens: r.reasoning_tokens,
    cost: r.cost,
    sourceEventId: r.source_event_id ?? undefined, rawModel: r.raw_model ?? undefined,
    sessionId: r.session_id ?? undefined, project: r.project ?? undefined, measurementStatus: r.measurement_status,
  }));
}

function buildWhereUpdated(opts: QueryOptions): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts.agent) {
    clauses.push("agent = ?");
    params.push(opts.agent);
  }
  if (opts.since !== undefined) {
    clauses.push("time_updated >= ?");
    params.push(opts.since);
  }
  if (opts.until !== undefined) {
    clauses.push("time_updated < ?");
    params.push(opts.until);
  }
  return { where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", params };
}

interface TotalsRow {
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  cost: number;
}

function totalsQuery(opts: QueryOptions): TotalsRow {
  const { where, params } = buildWhere(opts);
  const row = getDb()
    .query(
      `SELECT
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(cost), 0) as cost
       FROM usage_events ${where}`
    )
    .get(...params) as TotalsRow;
  return row;
}

function toBreakdown(row: TotalsRow) {
  return {
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cacheReadTokens: row.cache_read_tokens,
    reasoningTokens: row.reasoning_tokens,
    totalTokens:
      row.input_tokens + row.output_tokens + row.cache_write_tokens + row.cache_read_tokens + row.reasoning_tokens,
    cost: row.cost,
  };
}

export function getSummary(opts: QueryOptions = {}) {
  const timeZone = validTimeZone(opts.timeZone);
  const { since, until } = todayRange(timeZone);
  const today = toBreakdown(totalsQuery({ ...opts, since, until }));
  const allTime = toBreakdown(totalsQuery({ agent: opts.agent }));
  return { today, allTime, now: Date.now(), range: { since, until, timeZone }, pricing: pricingMetadata() };
}

export function getDaily(opts: QueryOptions & { days?: number }): { date: string; totals: ReturnType<typeof toBreakdown> }[] {
  const timeZone = validTimeZone(opts.timeZone);
  const days = opts.days ?? 7;
  const today = dateKey(Date.now(), timeZone);
  const since = opts.since ?? todayRange(timeZone, Date.parse(`${shiftDate(today, -(days - 1))}T12:00:00Z`)).since;
  const until = opts.until ?? todayRange(timeZone).until;
  const map = new Map<string, TotalsRow>();
  for (const e of getAllEvents({ ...opts, since, until, limit: 1_000_000 })) {
    const key = dateKey(e.timestamp, timeZone); const row = map.get(key) ?? { input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, reasoning_tokens: 0, cost: 0 };
    row.input_tokens += e.inputTokens; row.output_tokens += e.outputTokens; row.cache_write_tokens += e.cacheWriteTokens; row.cache_read_tokens += e.cacheReadTokens; row.reasoning_tokens += e.reasoningTokens; row.cost += e.cost; map.set(key, row);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, totals: toBreakdown(row) }));
}

export function getHourly(opts: QueryOptions & { date?: string; days?: number }): { hour: string; totals: ReturnType<typeof toBreakdown> }[] {
  const timeZone = validTimeZone(opts.timeZone); const range = opts.date ? todayRange(timeZone, zonedDateTimeToEpoch(opts.date, timeZone)) : todayRange(timeZone);
  const since = opts.since ?? range.since; const until = opts.until ?? range.until; const map = new Map<string, TotalsRow>();
  for (const e of getAllEvents({ ...opts, since, until, limit: 1_000_000 })) { const key = hourKey(e.timestamp, timeZone); const row = map.get(key) ?? { input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, reasoning_tokens: 0, cost: 0 }; row.input_tokens += e.inputTokens; row.output_tokens += e.outputTokens; row.cache_write_tokens += e.cacheWriteTokens; row.cache_read_tokens += e.cacheReadTokens; row.reasoning_tokens += e.reasoningTokens; row.cost += e.cost; map.set(key, row); }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([hour, row]) => ({ hour, totals: toBreakdown(row) }));
}

export function getModelBreakdown(opts: QueryOptions): { model: string; agent: string; totals: ReturnType<typeof toBreakdown> }[] {
  const { where, params } = buildWhere(opts);
  const rows = getDb()
    .query(
      `SELECT
        model,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(cost), 0) as cost
       FROM usage_events ${where}
       GROUP BY model
       ORDER BY (input_tokens + output_tokens + cache_write_tokens + cache_read_tokens + reasoning_tokens) DESC`
    )
    .all(...params) as ({ model: string } & TotalsRow)[];

  const perAgent = getDb()
    .query(
      `SELECT model, agent,
        (input_tokens + output_tokens + cache_write_tokens + cache_read_tokens + reasoning_tokens) as total
       FROM usage_events ${where}
       GROUP BY model, agent`
    )
    .all(...params) as { model: string; agent: string; total: number }[];

  const dominant = new Map<string, { agent: string; total: number }>();
  for (const r of perAgent) {
    const cur = dominant.get(r.model);
    if (!cur || r.total > cur.total) dominant.set(r.model, { agent: r.agent, total: r.total });
  }

  return rows.map((r) => ({
    model: r.model,
    agent: dominant.get(r.model)?.agent ?? "opencode",
    totals: toBreakdown(r),
  }));
}

export function getAgentBreakdown(opts: QueryOptions): { agent: string; totals: ReturnType<typeof toBreakdown> }[] {
  const { where, params } = buildWhere(opts);
  const rows = getDb()
    .query(
      `SELECT
        agent,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(cost), 0) as cost
       FROM usage_events ${where}
       GROUP BY agent
       ORDER BY (input_tokens + output_tokens + cache_write_tokens + cache_read_tokens + reasoning_tokens) DESC`
    )
    .all(...params) as ({ agent: string } & TotalsRow)[];
  return rows.map((r) => ({ agent: r.agent, totals: toBreakdown(r) }));
}

export function getContributionGraph(opts: QueryOptions & { days?: number }): { date: string; totalTokens: number; cost: number }[] {
  const days = opts.days ?? 365;
  const since = opts.since ?? startOfDayOffset(days);
  const until = opts.until ?? Date.now() + 86_400_000;
  const { where, params } = buildWhere({ ...opts, since, until });
  const rows = getDb()
    .query(
      `SELECT
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) +
        COALESCE(SUM(cache_write_tokens), 0) + COALESCE(SUM(cache_read_tokens), 0) +
        COALESCE(SUM(reasoning_tokens), 0) as total_tokens,
        COALESCE(SUM(cost), 0) as cost
       FROM usage_events ${where}
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; total_tokens: number; cost: number }[];
  return rows.map((r) => ({ date: r.date, totalTokens: r.total_tokens, cost: r.cost }));
}

export function getStats(opts: QueryOptions) {
  const { where, params } = buildWhere(opts);
  const db = getDb();
  const totals = toBreakdown(totalsQuery(opts));

  const days = db
    .query(
      `SELECT date(timestamp / 1000, 'unixepoch', 'localtime') as date, SUM(cost) as cost
       FROM usage_events ${where}
       GROUP BY date`
    )
    .all(...params) as { date: string; cost: number }[];

  const busiestDay = days.reduce<{ date: string; cost: number } | null>(
    (best, d) => (!best || d.cost > best.cost ? d : best),
    null
  );

  const hours = db
    .query(
      `SELECT CAST(strftime('%H', timestamp / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour, SUM(cost) as cost
       FROM usage_events ${where}
       GROUP BY hour`
    )
    .all(...params) as { hour: number; cost: number }[];
  const busiestHour = hours.reduce<{ hour: number; cost: number } | null>(
    (best, h) => (!best || h.cost > best.cost ? h : best),
    null
  );

  const models = db
    .query(
      `SELECT model, SUM(cost) as cost FROM usage_events ${where} GROUP BY model ORDER BY cost DESC LIMIT 1`
    )
    .all(...params) as { model: string; cost: number }[];
  const topModel = models[0]?.model ?? null;

  const agents = db
    .query(
      `SELECT agent, SUM(cost) as cost FROM usage_events ${where} GROUP BY agent ORDER BY cost DESC LIMIT 1`
    )
    .all(...params) as { agent: string; cost: number }[];
  const topAgent = agents[0]?.agent ?? null;

  const activeDates = days.map((d) => d.date).sort();
  const streaks = computeStreaks(activeDates);

  return {
    totals,
    days: days.length,
    busiestDay: busiestDay?.date ?? null,
    busiestHour: busiestHour?.hour ?? null,
    topModel,
    topAgent,
    streaks,
  };
}

export function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  const now = new Date();
  const todayStr = fmtDate(now);
  const yesterdayStr = fmtDate(new Date(now.getTime() - 86_400_000));

  const set = new Set(dates);
  const fmt = (d: Date) => fmtDate(d);

  let current = 0;
  let cursor = set.has(todayStr) ? new Date(now) : set.has(yesterdayStr) ? new Date(now.getTime() - 86_400_000) : null;
  if (cursor) {
    let d = new Date(cursor.getTime());
    while (set.has(fmt(d))) {
      current++;
      d = new Date(d.getTime() - 86_400_000);
    }
  }

  let longest = 0;
  const sorted = [...dates].sort();
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]! + "T00:00:00").getTime();
    const b = new Date(sorted[i]! + "T00:00:00").getTime();
    run = b - a === 86_400_000 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  longest = Math.max(longest, run);

  return { current, longest };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayOffset(days: number): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return startOfToday - days * 86_400_000;
}

export function parseQueryDate(s: string): number | undefined {
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const ms = Number(s);
    return Number.isFinite(ms) ? ms : undefined;
  }
  // Date-only "YYYY-MM-DD" → local midnight, not UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const local = new Date(y!, (m ?? 1) - 1, d);
    return Number.isNaN(local.getTime()) ? undefined : local.getTime();
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? undefined : ms;
}
