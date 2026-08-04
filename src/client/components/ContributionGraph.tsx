import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { useChartTooltip } from "./ChartTooltip";

interface Contribution {
  date: string;
  totalTokens: number;
  cost: number;
}

const CELL = 11;
const GAP = 3;
const DAYS = 365;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface DayData {
  tokens: number;
  cost: number;
}

function buildWeeks(data: Map<string, DayData>): { date: string; tokens: number; cost: number }[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start grid on the Sunday at-or-before (today - 364 days).
  const start = new Date(today);
  start.setDate(start.getDate() - (DAYS - 1));
  start.setDate(start.getDate() - start.getDay());

  const weeks: { date: string; tokens: number; cost: number }[][] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const week: { date: string; tokens: number; cost: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const ds = fmtDate(cursor);
      const day = data.get(ds) ?? { tokens: 0, cost: 0 };
      week.push({ date: ds, tokens: day.tokens, cost: day.cost });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function ContributionGraph({ refreshKey }: { refreshKey: string }) {
  const [weeks, setWeeks] = useState<{ date: string; tokens: number; cost: number }[][] | null>(null);
  const [max, setMax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tip = useChartTooltip();

  useEffect(() => {
    let alive = true;
    fetchJSON<Contribution[]>(`/api/contributions?days=${DAYS}`)
      .then((rows) => {
        if (!alive) return;
        const map = new Map<string, DayData>(rows.map((r) => [r.date, { tokens: r.totalTokens, cost: r.cost }]));
        const w = buildWeeks(map);
        setWeeks(w);
        setMax(Math.max(1, ...rows.map((r) => r.totalTokens)));
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) return <section className="card">error loading contributions: {error}</section>;
  if (!weeks) return <section className="card muted">loading contributions…</section>;

  const width = weeks.length * (CELL + GAP);

  const level = (tokens: number): number => {
    if (tokens <= 0) return 0;
    const q = tokens / max;
    if (q > 0.5) return 4;
    if (q > 0.25) return 3;
    if (q > 0.1) return 2;
    return 1;
  };

  return (
    <section className="card">
      <h2>Contribution graph</h2>
      <svg className="contribution" viewBox={`0 0 ${width} 160`} style={{ width: "100%", height: "auto" }}>
        {weeks.map((week, x) =>
          week.map((day, y) => (
            <rect
              key={day.date}
              x={x * (CELL + GAP)}
              y={y * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              className={`cell cell-${level(day.tokens)}`}
              onMouseEnter={(e) =>
                tip.show(e, (
                  <>
                    <div className="chart-tooltip-head">{day.date}</div>
                    <div className="chart-tooltip-grid">
                      <div className="chart-tooltip-item chart-tooltip-total">
                        <span>tokens</span>
                        <span>{formatTokens(day.tokens)}</span>
                      </div>
                      <div className="chart-tooltip-item chart-tooltip-cost">
                        <span>cost</span>
                        <span>{formatCost(day.cost)}</span>
                      </div>
                    </div>
                  </>
                ))
              }
              onMouseMove={tip.move}
              onMouseLeave={tip.hide}
            />
          ))
        )}
      </svg>
      {tip.node}
    </section>
  );
}
