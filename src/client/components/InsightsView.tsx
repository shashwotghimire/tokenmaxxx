import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { budgetAlertKey, budgetState } from "../../shared/budget";

type Project = { project: string; tokens: number; cost: number; events: number; priorCost?: number; costChange?: number | null };
type Comparison = { current: { tokens: number; cost: number; events: number }; prior: { tokens: number; cost: number }; change: { tokens: number | null; cost: number | null }; currentPeriodIncomplete: boolean; contributors: Project[] };
type Cache = { measurable: boolean; denominator: string; hitRate: number | null; inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; estimatedSavings: null; savingsNote: string; hotspots: { label: string; tokens: number }[] };

export function InsightsView({ refreshKey }: { refreshKey: string }) {
  const [projects, setProjects] = useState<Project[]>([]); const [comparison, setComparison] = useState<Comparison | null>(null); const [cache, setCache] = useState<Cache | null>(null); const [error, setError] = useState("");
  useEffect(() => { Promise.all([fetchJSON<Project[]>("/api/project-trends"), fetchJSON<Comparison>("/api/comparison"), fetchJSON<Cache>("/api/cache")]).then(([p, c, k]) => { setProjects(p); setComparison(c); setCache(k); }).catch((e) => setError(String(e))); }, [refreshKey]);
  if (error) return <section className="card error">Unable to load insights: {error}</section>;
  if (!comparison || !cache) return <section className="card muted">Loading insights…</section>;
  const pct = (n: number | null) => n === null ? "No prior baseline" : `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%`;
  return <div className="stack">
    <section className="card"><h2>Period comparison</h2><div className="stat-grid"><div className="stat"><div className="stat-label">current spend</div><div className="stat-value">{formatCost(comparison.current.cost)}</div></div><div className="stat"><div className="stat-label">vs prior period</div><div className="stat-value">{pct(comparison.change.cost)}</div></div><div className="stat"><div className="stat-label">largest contributor</div><div className="stat-value">{comparison.contributors[0]?.project ?? "—"}</div></div></div>{comparison.currentPeriodIncomplete && <p className="muted">The current period is still in progress; compare cautiously.</p>}</section>
    <BudgetPanel spend={comparison.current.cost} />
    <section className="card"><h2>Project trends</h2>{projects.length === 0 ? <p className="empty-state">No project metadata is available for this range.</p> : <div className="table-scroll"><table className="table"><thead><tr><th>project / working directory</th><th>events</th><th>tokens</th><th>API-equivalent estimate</th><th>vs prior</th></tr></thead><tbody>{projects.map((p) => <tr key={p.project}><td>{p.project}</td><td>{p.events}</td><td>{formatTokens(p.tokens)}</td><td>{formatCost(p.cost)}</td><td>{p.costChange == null ? "No baseline" : `${p.costChange >= 0 ? "+" : ""}${Math.round(p.costChange * 100)}%`}</td></tr>)}</tbody></table></div>}</section>
    <section className="card"><h2>Cache efficiency</h2><div className="stat-grid"><div className="stat"><div className="stat-label">hit rate</div><div className="stat-value">{cache.hitRate === null ? "Unavailable" : `${(cache.hitRate * 100).toFixed(1)}%`}</div></div><div className="stat"><div className="stat-label">denominator</div><div className="stat-value small-value">{cache.denominator}</div></div><div className="stat"><div className="stat-label">estimated savings</div><div className="stat-value">Unavailable</div></div></div><p className="muted">{cache.savingsNote} Hotspots only appear when cache-read tokens are measured.</p></section>
  </div>;
}

function BudgetPanel({ spend }: { spend: number }) {
  const [daily, setDaily] = useState(() => Number(localStorage.getItem("tokenmaxxx:budget:daily")) || 0);
  const [monthly, setMonthly] = useState(() => Number(localStorage.getItem("tokenmaxxx:budget:monthly")) || 0);
  const [actual, setActual] = useState({ daily: spend, monthly: spend });
  useEffect(() => {
    const now = new Date(); const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; const today = now.toISOString().slice(0, 10);
    Promise.all([fetchJSON<any>("/api/summary"), fetchJSON<any>(`/api/comparison?since=${first}&until=${today}`)]).then(([s, m]) => setActual({ daily: s.today.cost, monthly: m.current.cost })).catch(() => {});
  }, [spend]);
  const dayState = budgetState(actual.daily, daily); const monthState = budgetState(actual.monthly, monthly);
  useEffect(() => {
    localStorage.setItem("tokenmaxxx:budget:daily", String(daily)); localStorage.setItem("tokenmaxxx:budget:monthly", String(monthly));
    for (const [period, amount, allowance, crossed] of [["daily", actual.daily, daily, dayState.exceeded], ["monthly", actual.monthly, monthly, monthState.exceeded]] as const) { if (!crossed) continue; const date = new Date().toISOString().slice(0, period === "daily" ? 10 : 7); const key = budgetAlertKey(date, allowance, period); if (localStorage.getItem(key)) continue; localStorage.setItem(key, "1"); if (Notification.permission === "granted") new Notification(`tokenmaxxx ${period} budget reached`, { body: `API-equivalent estimate is ${formatCost(amount)}.` }); }
  }, [daily, monthly, actual.daily, actual.monthly, dayState.exceeded, monthState.exceeded]);
  return <section className="card"><div className="table-toolbar"><div><h2>Budgets</h2><p className="muted">Browser-only allowances. Alerts deduplicate by period and only run while this page is open; background delivery is not guaranteed.</p></div><div className="filter-actions"><label>Daily USD <input type="number" min="0" step=".01" value={daily || ""} onChange={(e) => setDaily(Math.max(0, Number(e.target.value) || 0))} /></label><label>Monthly USD <input type="number" min="0" step=".01" value={monthly || ""} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} /></label></div></div><div className="stat-grid"><div className="stat"><div className="stat-label">daily remaining</div><div className="stat-value">{dayState.remaining === null ? "Not set" : formatCost(dayState.remaining)}</div></div><div className="stat"><div className="stat-label">monthly remaining</div><div className="stat-value">{monthState.remaining === null ? "Not set" : formatCost(monthState.remaining)}</div></div></div></section>;
}
