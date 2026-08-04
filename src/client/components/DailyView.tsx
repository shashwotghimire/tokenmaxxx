import { useCallback, useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { hoverHandlers, useChartTooltip, UsageTooltip } from "./ChartTooltip";

interface DailyRow {
  date: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cost: number;
  };
}

type Range = "today" | "7d" | "30d" | "custom";

export function DailyView({ refreshKey }: { refreshKey: string }) {
  const [range, setRange] = useState<Range>("7d");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tip = useChartTooltip();

  const buildUrl = useCallback(() => {
    const base = "/api/daily";
    if (range === "today") return `${base}?days=1`;
    if (range === "7d") return `${base}?days=7`;
    if (range === "30d") return `${base}?days=30`;
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  }, [range, since, until]);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchJSON<DailyRow[]>(buildUrl())
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey, buildUrl]);

  const max = Math.max(1, ...(rows?.map((r) => r.totals.totalTokens) ?? [1]));

  return (
    <section className="card">
      <h2>Daily usage</h2>
      <div className="filters">
        {(
          [
            ["today", "Today"],
            ["7d", "Week"],
            ["30d", "30 days"],
            ["custom", "Custom"],
          ] as [Range, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`btn ${range === id ? "btn-active" : ""}`}
            onClick={() => setRange(id)}
          >
            {label}
          </button>
        ))}
        {range === "custom" && (
          <div className="date-range">
            <label>
              from
              <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </label>
            <label>
              to
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {error && <p className="error">error: {error}</p>}
      {!rows && !error && <p className="muted">loading…</p>}
      {rows && rows.length === 0 && <p className="muted">no usage in range</p>}

      {rows && rows.length > 0 && (
        <>
          <div className="bars">
            {rows.map((r) => (
              <div
                key={r.date}
                className="bar-col"
                {...hoverHandlers(tip, <UsageTooltip heading={r.date} totals={r.totals} />)}
              >
                <div className="bar" style={{ height: `${Math.max(4, (r.totals.totalTokens / max) * 160)}px` }} />
                <div className="bar-label">{r.date.slice(5)}</div>
              </div>
            ))}
          </div>
          {tip.node}
          <table className="table">
            <thead>
              <tr>
                <th>date</th>
                <th>input</th>
                <th>output</th>
                <th>cache read</th>
                <th>cache write</th>
                <th>total</th>
                <th>cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{formatTokens(r.totals.inputTokens)}</td>
                  <td>{formatTokens(r.totals.outputTokens)}</td>
                  <td>{formatTokens(r.totals.cacheReadTokens)}</td>
                  <td>{formatTokens(r.totals.cacheWriteTokens)}</td>
                  <td className="strong">{formatTokens(r.totals.totalTokens)}</td>
                  <td className="strong">{formatCost(r.totals.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
