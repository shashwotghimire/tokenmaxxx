import { useState } from "react";
import { fetchJSON } from "../format";
import { downloadRows, type ExportDataset, type ExportFormat } from "../exportFormat";
import type { SessionInfo, UsageEvent } from "../browser/types";

type Range = "all" | "today" | "7" | "30";

function rangeParams(range: Range): Record<string, number> {
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return { since: start, until: start + 86_400_000 };
    }
    case "7":
      return { since: now - 7 * 86_400_000 };
    case "30":
      return { since: now - 30 * 86_400_000 };
    default:
      return {};
  }
}

export function ExportView() {
  const [dataset, setDataset] = useState<ExportDataset>("events");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [agent, setAgent] = useState<string>("all");
  const [range, setRange] = useState<Range>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const params = new URLSearchParams({ format: "json" });
      if (agent !== "all") params.set("agent", agent);
      for (const [k, v] of Object.entries(rangeParams(range))) params.set(k, String(v));
      const rows = await fetchJSON<UsageEvent[] | SessionInfo[]>(`/api/export/${dataset}?${params}`);
      downloadRows(rows, dataset, format);
      setDone(`${(rows as unknown[]).length.toLocaleString()} rows downloaded`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card connect">
      <div className="connect-head">
        <div>
          <h2>Export data</h2>
          <p className="muted">
            Download usage events or sessions as CSV or JSON — pivots cleanly in Excel or Notion. Works in browser
            mode too (exports what you loaded).
          </p>
        </div>
      </div>

      <div className="alert-grid">
        <label>
          <span>data</span>
          <select value={dataset} onChange={(e) => setDataset(e.target.value as ExportDataset)}>
            <option value="events">usage events</option>
            <option value="sessions">sessions</option>
          </select>
        </label>
        <label>
          <span>format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label>
          <span>agent</span>
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">all</option>
            <option value="claude-code">claude-code</option>
            <option value="opencode">opencode</option>
            <option value="codex">codex</option>
          </select>
        </label>
        <label>
          <span>time range</span>
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="all">all time</option>
            <option value="today">today</option>
            <option value="7">last 7 days</option>
            <option value="30">last 30 days</option>
          </select>
        </label>
      </div>

      <div className="connect-actions">
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? "Exporting…" : "Download"}
        </button>
      </div>
      {done && <p className="muted connect-status">{done}</p>}
      {error && <p className="error">error: {error}</p>}
    </section>
  );
}
