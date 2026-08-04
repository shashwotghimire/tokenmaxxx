import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { BrandTile, brandForAgent, brandForModel } from "./brand-icons";
import type { BrandKind } from "./brand-icons";

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

  const rows: { label: string; value: string; brand?: BrandKind | null }[] = [
    { label: "total tokens", value: formatTokens(stats.totals.totalTokens) },
    { label: "total cost", value: formatCost(stats.totals.cost) },
    { label: "active days", value: String(stats.days) },
    { label: "current streak", value: `${stats.streaks.current} day${stats.streaks.current === 1 ? "" : "s"}` },
    { label: "longest streak", value: `${stats.streaks.longest} day${stats.streaks.longest === 1 ? "" : "s"}` },
    { label: "busiest day", value: stats.busiestDay ?? "—" },
    { label: "busiest hour", value: stats.busiestHour !== null ? `${String(stats.busiestHour).padStart(2, "0")}:00` : "—" },
    { label: "top model", value: stats.topModel ?? "—", brand: stats.topModel ? brandForModel(stats.topModel) : null },
    { label: "top agent", value: stats.topAgent ?? "—", brand: stats.topAgent ? brandForAgent(stats.topAgent) : null },
  ];

  return (
    <section className="card">
      <h2>Stats</h2>
      <div className="stat-grid">
        {rows.map((row) => (
          <div className="stat" key={row.label}>
            <div className="stat-label">{row.label}</div>
            <div className="stat-value">
              {row.brand && <BrandTile kind={row.brand} size={16} />}
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
