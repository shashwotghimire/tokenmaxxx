import { getDb } from "./db";

const PERIOD = 7;
const Z = 1.28; // ~80% prediction interval

export interface ForecastPoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
  low: number;
  high: number;
  costLow: number;
  costHigh: number;
}

export interface ForecastResult {
  hasData: boolean;
  horizon: number;
  windowDays: number;
  fit: {
    n: number;
    meanDaily: number;
    trendPerDay: number;
    trendPerDayPct: number;
    sigma: number;
    costMeanDaily: number;
    costSigma: number;
  } | null;
  history: { date: string; totalTokens: number; cost: number }[];
  forecast: ForecastPoint[];
  cumulative: { tokens: number; cost: number; low: number; high: number };
}

function startOfLocalDay(offsetDays = 0): number {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  base.setDate(base.getDate() + offsetDays);
  return base.getTime();
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface DayRow {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost: number;
}

interface DailyPoint {
  date: string;
  weekday: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

function buildDailySeries(agent: string | undefined, windowDays: number): DailyPoint[] {
  const since = startOfLocalDay(-(windowDays - 1));
  const until = startOfLocalDay(1);
  const params: (string | number)[] = [since, until];
  const agentClause = agent ? " AND agent = ?" : "";
  if (agent) params.push(agent);
  const rows = getDb()
    .query(
      `SELECT date(timestamp / 1000, 'unixepoch', 'localtime') as date,
              COALESCE(SUM(input_tokens), 0) as input_tokens,
              COALESCE(SUM(output_tokens), 0) as output_tokens,
              COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
              COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
              COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
              COALESCE(SUM(cost), 0) as cost
       FROM usage_events
       WHERE timestamp >= ? AND timestamp < ?${agentClause}
       GROUP BY date`
    )
    .all(...params) as DayRow[];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DailyPoint[] = [];
  const d = new Date(since);
  for (let i = 0; i < windowDays; i++) {
    const date = fmtDate(d);
    const r = byDate.get(date);
    const inputTokens = r?.input_tokens ?? 0;
    const outputTokens = r?.output_tokens ?? 0;
    const cacheReadTokens = r?.cache_read_tokens ?? 0;
    const cacheWriteTokens = r?.cache_write_tokens ?? 0;
    const reasoningTokens = r?.reasoning_tokens ?? 0;
    out.push({
      date,
      weekday: d.getDay(),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens,
      totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens,
      cost: r?.cost ?? 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function invert(A: number[][]): number[][] {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r]![col] ?? 0) > Math.abs(aug[piv]![col] ?? 0)) piv = r;
    }
    const tmp = aug[col]!;
    aug[col] = aug[piv]!;
    aug[piv] = tmp;
    const pv = aug[col]![col] ?? 0;
    if (Math.abs(pv) < 1e-12) return Array.from({ length: n }, () => new Array(n).fill(0));
    for (let j = 0; j < 2 * n; j++) aug[col]![j] = (aug[col]![j] ?? 0) / pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col] ?? 0;
      for (let j = 0; j < 2 * n; j++) aug[r]![j] = (aug[r]![j] ?? 0) - f * (aug[col]![j] ?? 0);
    }
  }
  return aug.map((row) => row!.slice(n));
}

interface Fit {
  beta: number[];
  invXtX: number[][];
  sigma: number;
  n: number;
  mean: number;
}

/** Additive model: y = intercept + slope*t + weekday dummies (weekday 6 is the reference). */
function fitAdditiveSeasonal(y: number[], firstWeekday: number, useSeasonal: boolean): Fit {
  const n = y.length;
  const p = useSeasonal ? 1 + 1 + (PERIOD - 1) : 2;
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [1, i];
    if (useSeasonal) {
      const w = (firstWeekday + i) % PERIOD;
      for (let k = 0; k < PERIOD - 1; k++) row.push(w === k ? 1 : 0);
    }
    X.push(row);
  }
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] = (Xty[a] ?? 0) + (X[i]![a] ?? 0) * (y[i] ?? 0);
      for (let b = 0; b < p; b++) XtX[a]![b] = (XtX[a]![b] ?? 0) + (X[i]![a] ?? 0) * (X[i]![b] ?? 0);
    }
  }
  const invXtX = invert(XtX);
  const beta = invXtX.map((row) => row.reduce((s, v, j) => s + (v ?? 0) * (Xty[j] ?? 0), 0));
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < p; a++) yhat += (X[i]![a] ?? 0) * (beta[a] ?? 0);
    sse += ((y[i] ?? 0) - yhat) ** 2;
  }
  const sigma = n > p ? Math.sqrt(sse / (n - p)) : 0;
  const mean = n > 0 ? y.reduce((a, b) => a + (b ?? 0), 0) / n : 0;
  return { beta, invXtX, sigma, n, mean };
}

function predict(fit: Fit, t: number, firstWeekday: number, useSeasonal: boolean): { y: number; se: number } {
  const w = (firstWeekday + t) % PERIOD;
  const p = useSeasonal ? 1 + 1 + (PERIOD - 1) : 2;
  const row: number[] = [1, t];
  if (useSeasonal) {
    for (let k = 0; k < PERIOD - 1; k++) row.push(w === k ? 1 : 0);
  }
  let y = 0;
  for (let a = 0; a < p; a++) y += (row[a] ?? 0) * (fit.beta[a] ?? 0);
  let lev = 0;
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++) lev += (row[a] ?? 0) * (fit.invXtX[a]?.[b] ?? 0) * (row[b] ?? 0);
  }
  return { y, se: fit.sigma * Math.sqrt(1 + lev) };
}

export function buildForecast(opts: { agent?: string; horizon?: number; windowDays?: number } = {}): ForecastResult {
  const horizon = clamp(Math.round(opts.horizon ?? 7), 1, 30);
  const windowDays = clamp(Math.round(opts.windowDays ?? 42), 7, 120);
  const series = buildDailySeries(opts.agent, windowDays);
  const totalY = series.map((d) => d.totalTokens);
  const costY = series.map((d) => d.cost);
  const sumTotal = totalY.reduce((a, b) => a + b, 0);
  const sumCost = costY.reduce((a, b) => a + b, 0);

  const empty: ForecastResult = {
    hasData: false,
    horizon,
    windowDays,
    fit: null,
    history: series.map((d) => ({ date: d.date, totalTokens: d.totalTokens, cost: d.cost })),
    forecast: [],
    cumulative: { tokens: 0, cost: 0, low: 0, high: 0 },
  };
  if (sumTotal <= 0) return empty;

  const firstWeekday = series[0]?.weekday ?? 0;
  const nonzero = totalY.filter((v) => v > 0).length;
  const useSeasonal = nonzero >= PERIOD;
  const fitT = fitAdditiveSeasonal(totalY, firstWeekday, useSeasonal);
  const fitC = fitAdditiveSeasonal(costY, firstWeekday, useSeasonal);

  const bucketTotals = series.reduce(
    (a, d) => ({
      input: a.input + d.inputTokens,
      output: a.output + d.outputTokens,
      cacheRead: a.cacheRead + d.cacheReadTokens,
      cacheWrite: a.cacheWrite + d.cacheWriteTokens,
      reasoning: a.reasoning + d.reasoningTokens,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  );
  const shares = {
    input: bucketTotals.input / sumTotal,
    output: bucketTotals.output / sumTotal,
    cacheRead: bucketTotals.cacheRead / sumTotal,
    cacheWrite: bucketTotals.cacheWrite / sumTotal,
    reasoning: bucketTotals.reasoning / sumTotal,
  };

  const forecast: ForecastPoint[] = [];
  const start = startOfLocalDay(1);
  const d = new Date(start);
  for (let i = 0; i < horizon; i++) {
    const t = windowDays + i;
    const p = predict(fitT, t, firstWeekday, useSeasonal);
    const c = predict(fitC, t, firstWeekday, useSeasonal);
    const totalTokens = Math.max(0, Math.round(p.y));
    const cost = Math.max(0, Math.round(c.y * 1000) / 1000);
    const low = Math.max(0, Math.round(p.y - Z * p.se));
    const high = Math.max(0, Math.round(p.y + Z * p.se));
    const costLow = Math.max(0, Math.round((c.y - Z * c.se) * 1000) / 1000);
    const costHigh = Math.max(0, Math.round((c.y + Z * c.se) * 1000) / 1000);
    forecast.push({
      date: fmtDate(d),
      inputTokens: Math.round(totalTokens * shares.input),
      outputTokens: Math.round(totalTokens * shares.output),
      cacheReadTokens: Math.round(totalTokens * shares.cacheRead),
      cacheWriteTokens: Math.round(totalTokens * shares.cacheWrite),
      reasoningTokens: Math.round(totalTokens * shares.reasoning),
      totalTokens,
      cost,
      low,
      high,
      costLow,
      costHigh,
    });
    d.setDate(d.getDate() + 1);
  }

  const cum = forecast.reduce(
    (a, p) => ({ tokens: a.tokens + p.totalTokens, cost: a.cost + p.cost, low: a.low + p.low, high: a.high + p.high }),
    { tokens: 0, cost: 0, low: 0, high: 0 }
  );

  const slopeT = fitT.beta[1] ?? 0;

  return {
    hasData: true,
    horizon,
    windowDays,
    fit: {
      n: nonzero,
      meanDaily: Math.round(fitT.mean),
      trendPerDay: Math.round(slopeT),
      trendPerDayPct: fitT.mean !== 0 ? slopeT / fitT.mean : 0,
      sigma: Math.round(fitT.sigma),
      costMeanDaily: Math.round(fitC.mean * 1000) / 1000,
      costSigma: Math.round(fitC.sigma * 1000) / 1000,
    },
    history: series.map((d) => ({ date: d.date, totalTokens: d.totalTokens, cost: d.cost })),
    forecast,
    cumulative: { tokens: cum.tokens, cost: Math.round(cum.cost * 1000) / 1000, low: cum.low, high: cum.high },
  };
}
