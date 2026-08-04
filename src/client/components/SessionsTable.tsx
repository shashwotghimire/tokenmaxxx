import { useEffect, useState } from "react";
import { fetchJSON, formatCost, formatTokens } from "../format";
import { SortTh, useSearchSort } from "../sort";
import { BrandTile, brandForAgent } from "./brand-icons";

interface Session {
  agent: string;
  sessionId: string;
  title: string | null;
  model: string | null;
  cwd: string | null;
  gitBranch: string | null;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  timeCreated: number | null;
  timeUpdated: number | null;
}

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export function SessionsTable({ refreshKey, sessionSeq }: { refreshKey: string; sessionSeq: number }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    fetchJSON<Session[]>("/api/sessions?limit=500")
      .then((r) => alive && setSessions(r))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey, sessionSeq]);

  const { query, setQuery, sortKey, sortDir, toggle, sorted } = useSearchSort<Session>(
    sessions ?? [],
    (s) => `${s.agent} ${s.title ?? ""} ${s.model ?? ""} ${s.cwd ?? ""} ${s.sessionId}`,
    (s, key) => {
      switch (key) {
        case "tokens":
          return s.tokens;
        case "cost":
          return s.cost;
        case "time":
          return s.timeUpdated ?? -Infinity;
        case "title":
          return s.title ?? "";
        case "model":
          return s.model ?? "";
        default:
          return s.agent;
      }
    },
    "time",
    -1,
  );

  if (error) return <section className="card">error loading sessions: {error}</section>;
  if (!sessions) return <section className="card muted">loading sessions…</section>;

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="card">
      <div className="table-toolbar">
        <h2>Sessions ({sorted.length}{query ? ` / ${sessions.length}` : ""})</h2>
        <input
          className="searchbox"
          type="search"
          placeholder="search title, model, cwd, agent…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <table className="table sessions">
        <thead>
          <tr>
            <SortTh label="agent" active={sortKey === "agent"} dir={sortDir} onClick={() => toggle("agent")} />
            <SortTh label="title" active={sortKey === "title"} dir={sortDir} onClick={() => toggle("title")} />
            <SortTh label="model" active={sortKey === "model"} dir={sortDir} onClick={() => toggle("model")} />
            <SortTh label="tokens" active={sortKey === "tokens"} dir={sortDir} onClick={() => toggle("tokens")} />
            <SortTh label="cost" active={sortKey === "cost"} dir={sortDir} onClick={() => toggle("cost")} />
            <SortTh label="last activity" active={sortKey === "time"} dir={sortDir} onClick={() => toggle("time")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const key = `${s.agent}:${s.sessionId}`;
            const open = expanded.has(key);
            return (
              <SessionRow key={key} session={s} open={open} onToggle={() => toggleExpanded(key)} />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SessionRow({
  session: s,
  open,
  onToggle,
}: {
  session: Session;
  open: boolean;
  onToggle: () => void;
}) {
  const breakdown: [string, string][] = [
    ["session id", s.sessionId],
    ["created", formatDateTime(s.timeCreated)],
    ["updated", formatDateTime(s.timeUpdated)],
    ["cwd", s.cwd ?? "—"],
    ["git branch", s.gitBranch ?? "—"],
    ["input tokens", formatTokens(s.inputTokens)],
    ["output tokens", formatTokens(s.outputTokens)],
    ["cache read", formatTokens(s.cacheReadTokens)],
    ["cache write", formatTokens(s.cacheWriteTokens)],
    ["reasoning tokens", formatTokens(s.reasoningTokens)],
    ["total tokens", formatTokens(s.tokens)],
    ["estimated cost", formatCost(s.cost)],
  ];

  return (
    <>
      <tr className={open ? "row-open" : ""} onClick={onToggle}>
        <td>
          <div className="name-cell">
            {brandForAgent(s.agent) && <BrandTile kind={brandForAgent(s.agent)!} size={16} />}
            <span className={`badge badge-${s.agent}`}>{s.agent}</span>
          </div>
        </td>
        <td className="sess-title">{s.title ?? <span className="muted">untitled</span>}</td>
        <td className="muted">
          <div className="name-cell">
            {brandForAgent(s.agent) && <BrandTile kind={brandForAgent(s.agent)!} size={16} />}
            <span>{s.model ?? "—"}</span>
          </div>
        </td>
        <td className="strong">{formatTokens(s.tokens)}</td>
        <td className="strong">{formatCost(s.cost)}</td>
        <td className="muted">{formatTime(s.timeUpdated)}</td>
      </tr>
      {open && (
        <tr className="session-detail-row">
          <td colSpan={6}>
            <div className="session-detail">
              <div className="session-detail-head">
                <span className="muted">{s.model ?? "unknown model"}</span>
                <span>{formatTokens(s.tokens)} tokens</span>
                <span>{formatCost(s.cost)}</span>
              </div>
              <div className="session-detail-grid">
                {breakdown.map(([label, value]) => (
                  <div className="session-detail-item" key={label}>
                    <span className="stat-label">{label}</span>
                    <span className="detail-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
