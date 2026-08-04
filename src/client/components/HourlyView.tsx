import { useEffect, useState } from "react";
import { fetchJSON, formatTokens } from "../format";
import { hoverHandlers, useChartTooltip, UsageTooltip } from "./ChartTooltip";

interface HourlyRow {
  hour: string;
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

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HourlyView({ refreshKey }: { refreshKey: string }) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<HourlyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tip = useChartTooltip();

  useEffect(() => {
    let alive = true;
    const since = new Date(date + "T00:00:00").getTime();
    const until = since + 86_400_000;
    fetchJSON<HourlyRow[]>(`/api/hourly?since=${since}&until=${until}`)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey, date]);

  const max = Math.max(1, ...(rows?.map((r) => r.totals.totalTokens) ?? [1]));

  return (
    <section className="card">
      <h2>Hourly usage</h2>
      <div className="filters">
        <label>
          date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">error: {error}</p>}
      {!rows && !error && <p className="muted">loading…</p>}
      {rows && rows.length === 0 && <p className="muted">no usage on this day</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="bars bars-hourly">
            {rows.map((r) => (
              <div
                key={r.hour}
                className="bar-col"
                {...hoverHandlers(tip, <UsageTooltip heading={r.hour.replace(" ", " · ")} totals={r.totals} />)}
              >
                <div className="bar" style={{ height: `${Math.max(4, (r.totals.totalTokens / max) * 160)}px` }} />
                <div className="bar-label">{r.hour.slice(11, 13)}h</div>
              </div>
            ))}
          </div>
          {tip.node}
          <table className="table">
            <thead>
              <tr>
                <th>hour</th>
                <th>tokens</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour}>
                  <td>{r.hour.slice(11)}</td>
                  <td className="strong">{formatTokens(r.totals.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
