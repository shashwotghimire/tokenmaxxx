import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { SortTh, useSearchSort } from "../sort";
import { BrandTile, brandForAgent } from "./brand-icons";

export interface BreakdownRow {
  key: string;
  agent?: string;
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

interface RawBreakdownRow {
  model?: string;
  agent?: string;
  totals: BreakdownRow["totals"];
}

interface Props {
  refreshKey: string;
  kind: "model" | "agent";
}

const COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "model" },
  { key: "input", label: "input" },
  { key: "output", label: "output" },
  { key: "cacheRead", label: "cache read" },
  { key: "cacheWrite", label: "cache write" },
  { key: "total", label: "total" },
  { key: "cost", label: "cost" },
];

export function BreakdownTable({ refreshKey, kind }: Props) {
  const [rows, setRows] = useState<BreakdownRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJSON<RawBreakdownRow[]>(`/api/${kind === "model" ? "models" : "agents"}`)
      .then((r) =>
        alive &&
        setRows(r.map((row) => ({ key: kind === "model" ? row.model! : row.agent!, agent: row.agent, totals: row.totals }))),
      )
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey, kind]);

  const { query, setQuery, sortKey, sortDir, toggle, sorted } = useSearchSort<BreakdownRow>(
    rows ?? [],
    (r) => r.key,
    (r, key) => {
      switch (key) {
        case "input":
          return r.totals.inputTokens;
        case "output":
          return r.totals.outputTokens;
        case "cacheRead":
          return r.totals.cacheReadTokens;
        case "cacheWrite":
          return r.totals.cacheWriteTokens;
        case "total":
          return r.totals.totalTokens;
        case "cost":
          return r.totals.cost;
        default:
          return r.key;
      }
    },
    "total",
    -1,
  );

  if (error) return <section className="card">error: {error}</section>;
  if (!rows) return <section className="card muted">loading…</section>;

  const nameKey = kind === "model" ? "model" : "agent";
  const totals = sorted.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.totals.inputTokens,
      outputTokens: acc.outputTokens + r.totals.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.totals.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + r.totals.cacheWriteTokens,
      totalTokens: acc.totalTokens + r.totals.totalTokens,
      cost: acc.cost + r.totals.cost,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0 },
  );

  return (
    <section className="card">
      <h2>{kind === "model" ? "By model" : "By agent"}</h2>
      <div className="table-toolbar">
        <input
          className="searchbox"
          type="search"
          placeholder={`search ${nameKey}s…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted table-count">
          {sorted.length} of {rows.length}
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <SortTh
                key={c.key}
                label={c.key === "name" ? nameKey : c.label}
                active={sortKey === c.key}
                dir={sortDir}
                onClick={() => toggle(c.key)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const brand = kind === "agent" ? brandForAgent(r.key) : r.agent ? brandForAgent(r.agent) : null;
            return (
              <tr key={r.key}>
                <td className={kind === "agent" ? `badge-cell badge-${r.key}` : ""}>
                  <div className="name-cell">
                    {brand && <BrandTile kind={brand} size={16} />}
                    {kind === "agent" ? <span className={`badge badge-${r.key}`}>{r.key}</span> : <span>{r.key}</span>}
                  </div>
                </td>
                <td>{formatTokens(r.totals.inputTokens)}</td>
                <td>{formatTokens(r.totals.outputTokens)}</td>
                <td>{formatTokens(r.totals.cacheReadTokens)}</td>
                <td>{formatTokens(r.totals.cacheWriteTokens)}</td>
                <td className="strong">{formatTokens(r.totals.totalTokens)}</td>
                <td className="strong">{formatCost(r.totals.cost)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="table-total">
            <td className="strong">total</td>
            <td className="strong">{formatTokens(totals.inputTokens)}</td>
            <td className="strong">{formatTokens(totals.outputTokens)}</td>
            <td className="strong">{formatTokens(totals.cacheReadTokens)}</td>
            <td className="strong">{formatTokens(totals.cacheWriteTokens)}</td>
            <td className="strong">{formatTokens(totals.totalTokens)}</td>
            <td className="strong">{formatCost(totals.cost)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
