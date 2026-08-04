import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { hoverHandlers, useChartTooltip } from "./ChartTooltip";

interface ForecastPoint {
  date: string;
  totalTokens: number;
  cost: number;
  low: number;
  high: number;
  costLow: number;
  costHigh: number;
}

interface ForecastResult {
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

interface ForecastResponse {
  overall: ForecastResult;
  agents: Record<string, ForecastResult>;
}

const HORIZONS = [7, 14, 30] as const;

export function ForecastView({ refreshKey }: { refreshKey: string }) {
  const [horizon, setHorizon] = useState<number>(7);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tip = useChartTooltip();

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchJSON<ForecastResponse>(`/api/forecast?horizon=${horizon}`)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey, horizon]);

  if (error) return <section className="card">error: {error}</section>;
  if (!data) return <section className="card muted">loading forecast…</section>;

  const { overall } = data;
  if (!overall.hasData) return <section className="card muted">not enough usage data to forecast yet</section>;

  const cum = overall.cumulative;
  const fit = overall.fit!;
  const bars: {
    date: string;
    kind: "history" | "forecast";
    tokens: number;
    cost: number;
    low?: number;
    high?: number;
  }[] = [
    ...overall.history.map((h) => ({ date: h.date, kind: "history" as const, tokens: h.totalTokens, cost: h.cost })),
    ...overall.forecast.map((f) => ({
      date: f.date,
      kind: "forecast" as const,
      tokens: f.totalTokens,
      cost: f.cost,
      low: f.low,
      high: f.high,
    })),
  ];
  const max = Math.max(1, ...bars.map((b) => Math.max(b.tokens, b.high ?? 0)));
  const sepIndex = overall.history.length;

  return (
    <section className="card">
      <div className="table-toolbar">
        <h2>Forecast</h2>
        <div className="filters" style={{ marginBottom: 0 }}>
          {HORIZONS.map((h) => (
            <button
              key={h}
              className={`btn ${horizon === h ? "btn-active" : ""}`}
              onClick={() => setHorizon(h)}
            >
              next {h}d
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid forecast-headline">
        <div className="stat">
          <div className="stat-label">predicted tokens · {horizon}d</div>
          <div className="stat-value">{formatTokens(cum.tokens)}</div>
        </div>
        <div className="stat stat-cost">
          <div className="stat-label">predicted cost · {horizon}d</div>
          <div className="stat-value">{formatCost(cum.cost)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">80% range</div>
          <div className="stat-value">
            {formatTokens(cum.low)} – {formatTokens(cum.high)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">trend</div>
          <div className="stat-value">
            {fit.trendPerDay >= 0 ? "+" : ""}
            {formatTokens(fit.trendPerDay)}/day
          </div>
        </div>
      </div>

      <div className="forecast-legend">
        <span className="legend-dot legend-history" /> actual
        <span className="legend-dot legend-forecast" /> predicted
      </div>

      <div className="bars">
        {bars.map((b, i) => {
          const content = (
            <div className="chart-tooltip-head">
              {b.date}
              <div className="chart-tooltip-grid" style={{ marginTop: 6 }}>
                {b.kind === "history" ? (
                  <>
                    <div className="chart-tooltip-item">
                      <span>actual tokens</span>
                      <span>{formatTokens(b.tokens)}</span>
                    </div>
                    <div className="chart-tooltip-item">
                      <span>cost</span>
                      <span>{formatCost(b.cost)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="chart-tooltip-item">
                      <span>predicted</span>
                      <span>{formatTokens(b.tokens)}</span>
                    </div>
                    <div className="chart-tooltip-item">
                      <span>80% range</span>
                      <span>
                        {formatTokens(b.low!)} – {formatTokens(b.high!)}
                      </span>
                    </div>
                    <div className="chart-tooltip-item">
                      <span>cost</span>
                      <span>{formatCost(b.cost)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
          return (
            <div
              key={b.date}
              className={`bar-col${i === sepIndex ? " bar-sep" : ""}${b.kind === "forecast" ? " bar-col-forecast" : ""}`}
              {...hoverHandlers(tip, content)}
            >
              <div
                className={`bar${b.kind === "forecast" ? " bar-forecast" : ""}`}
                style={{ height: `${Math.max(4, (Math.max(b.tokens, b.high ?? 0) / max) * 160)}px` }}
              />
              <div className="bar-label">{b.date.slice(5)}</div>
            </div>
          );
        })}
      </div>
      {tip.node}

      <table className="table">
        <thead>
          <tr>
            <th>agent</th>
            <th>predicted tokens</th>
            <th>predicted cost</th>
            <th>80% range</th>
            <th>trend</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.agents).map(([agent, r]) => (
            <tr key={agent}>
              <td>
                <span className={`badge badge-${agent}`}>{agent}</span>
              </td>
              <td className="strong">{r.hasData ? formatTokens(r.cumulative.tokens) : "—"}</td>
              <td className="strong">{r.hasData ? formatCost(r.cumulative.cost) : "—"}</td>
              <td className="muted">
                {r.hasData ? `${formatTokens(r.cumulative.low)} – ${formatTokens(r.cumulative.high)}` : "—"}
              </td>
              <td className="muted">
                {r.hasData && r.fit ? (
                  <span>
                    {r.fit.trendPerDay >= 0 ? "+" : ""}
                    {formatTokens(r.fit.trendPerDay)}/day ({Math.round(r.fit.trendPerDayPct * 100)}%)
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted forecast-meta">
        fitted on {fit.n} days · avg {formatTokens(fit.meanDaily)}/day · residual σ {formatTokens(fit.sigma)}
        · trend +{Math.round(fit.trendPerDayPct * 100)}%/day · 80% interval
      </p>
    </section>
  );
}
