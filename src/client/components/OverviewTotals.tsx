import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";

interface Totals {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

interface Summary {
  today: Totals;
  allTime: Totals;
  now: number;
}

export function OverviewTotals({ refreshKey }: { refreshKey: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJSON<Summary>("/api/summary")
      .then((s) => alive && setSummary(s))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) return <section className="card">error loading summary: {error}</section>;
  if (!summary) return <section className="card muted">loading summary…</section>;

  const cards: { label: string; value: string }[] = [
    { label: "input", value: formatTokens(summary.today.inputTokens) },
    { label: "output", value: formatTokens(summary.today.outputTokens) },
    { label: "cache read", value: formatTokens(summary.today.cacheReadTokens) },
    { label: "cache write", value: formatTokens(summary.today.cacheWriteTokens) },
    { label: "reasoning", value: formatTokens(summary.today.reasoningTokens) },
  ];

  return (
    <section className="card">
      <h2>Today</h2>
      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
          </div>
        ))}
        <div className="stat stat-cost">
          <div className="stat-label">cost</div>
          <div className="stat-value">{formatCost(summary.today.cost)}</div>
        </div>
      </div>
    </section>
  );
}
