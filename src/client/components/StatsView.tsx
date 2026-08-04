import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";

interface Stats {
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cost: number;
  };
  days: number;
  busiestDay: string | null;
  busiestHour: number | null;
  topModel: string | null;
  topAgent: string | null;
  streaks: { current: number; longest: number };
}

export function StatsView({ refreshKey }: { refreshKey: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJSON<Stats>("/api/stats")
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) return <section className="card">error loading stats: {error}</section>;
  if (!stats) return <section className="card muted">loading stats…</section>;

  const rows: [string, string][] = [
    ["total tokens", formatTokens(stats.totals.totalTokens)],
    ["total cost", formatCost(stats.totals.cost)],
    ["active days", String(stats.days)],
    ["current streak", `${stats.streaks.current} day${stats.streaks.current === 1 ? "" : "s"}`],
    ["longest streak", `${stats.streaks.longest} day${stats.streaks.longest === 1 ? "" : "s"}`],
    ["busiest day", stats.busiestDay ?? "—"],
    ["busiest hour", stats.busiestHour !== null ? `${String(stats.busiestHour).padStart(2, "0")}:00` : "—"],
    ["top model", stats.topModel ?? "—"],
    ["top agent", stats.topAgent ?? "—"],
  ];

  return (
    <section className="card">
      <h2>Stats</h2>
      <div className="stat-grid">
        {rows.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
