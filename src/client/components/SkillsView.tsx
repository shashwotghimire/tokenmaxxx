import { useEffect, useState } from "react";
import { fetchJSON, formatTokens } from "../format";
import { SortTh, useSearchSort } from "../sort";

interface Skill {
  name: string;
  description: string | null;
  agent: "claude-code" | "opencode";
  scope: "global" | "project";
  projectRoot: string | null;
  path: string;
  mainFile: string;
  files: number;
  references: number;
  bytes: number;
  estTokens: number;
}

interface SkillsResult {
  roots: string[];
  skills: Skill[];
  scannedAt: number;
}

export function SkillsView({ refreshKey }: { refreshKey: string }) {
  const [data, setData] = useState<SkillsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJSON<SkillsResult>("/api/skills")
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) {
    return (
      <section className="card muted">
        skills are read from this machine's <code>.claude/skills</code> and <code>.agents/skills</code> folders —
        load them on the local dashboard
      </section>
    );
  }
  if (!data) return <section className="card muted">loading skills…</section>;

  return <SkillsTable data={data} />;
}

function SkillsTable({ data }: { data: SkillsResult }) {
  const skills = data.skills;
  const { query, setQuery, sortKey, sortDir, toggle, sorted } = useSearchSort<Skill>(
    skills,
    (s) => `${s.name} ${s.description ?? ""} ${s.agent} ${s.scope} ${s.path} ${s.projectRoot ?? ""}`,
    (s, key) => {
      switch (key) {
        case "estTokens":
          return s.estTokens;
        case "files":
          return s.files;
        case "references":
          return s.references;
        case "agent":
          return s.agent;
        case "path":
          return s.path;
        default:
          return s.name;
      }
    },
    "estTokens",
    -1,
  );

  const totalEstTokens = skills.reduce((a, s) => a + s.estTokens, 0);
  const biggest = [...skills].sort((a, b) => b.estTokens - a.estTokens)[0];
  const bloatiest = [...skills].sort((a, b) => b.references - a.references)[0];

  return (
    <>
      <section className="card">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">skills found</div>
            <div className="stat-value">{skills.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">est. context tokens</div>
            <div className="stat-value">{formatTokens(totalEstTokens)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">heaviest</div>
            <div className="stat-value">{biggest ? biggest.name : "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">most reference files</div>
            <div className="stat-value">{bloatiest ? bloatiest.name : "—"}</div>
          </div>
        </div>
        <p className="muted table-count">
          scanned {data.roots.length} root{data.roots.length === 1 ? "" : "s"}: {data.roots.join(", ")} — cache refreshes
          every 60s
        </p>
      </section>

      <section className="card">
        <div className="table-toolbar">
          <h2>Skills ({sorted.length}{query ? ` / ${skills.length}` : ""})</h2>
          <input
            className="searchbox"
            type="search"
            placeholder="search name, description, path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <table className="table">
          <thead>
            <tr>
              <SortTh label="name" active={sortKey === "name"} dir={sortDir} onClick={() => toggle("name")} />
              <SortTh label="agent" active={sortKey === "agent"} dir={sortDir} onClick={() => toggle("agent")} />
              <SortTh label="files" active={sortKey === "files"} dir={sortDir} onClick={() => toggle("files")} />
              <SortTh
                label="reference files"
                active={sortKey === "references"}
                dir={sortDir}
                onClick={() => toggle("references")}
              />
              <SortTh
                label="est. context tokens"
                active={sortKey === "estTokens"}
                dir={sortDir}
                onClick={() => toggle("estTokens")}
              />
              <SortTh label="path" active={sortKey === "path"} dir={sortDir} onClick={() => toggle("path")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <SkillRow key={s.path} skill={s} />
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function SkillRow({ skill: s }: { skill: Skill }) {
  return (
    <tr>
      <td>
        <div className="skill-name">
          <span className="strong">{s.name}</span>
          <span className={`badge badge-${s.scope}`}>{s.scope}</span>
        </div>
        {s.description && <div className="muted skill-desc">{s.description}</div>}
      </td>
      <td>
        <span className={`badge badge-${s.agent}`}>{s.agent}</span>
      </td>
      <td>{s.files}</td>
      <td>{s.references}</td>
      <td className="strong">{formatTokens(s.estTokens)}</td>
      <td className="muted skill-path">{s.path}</td>
    </tr>
  );
}
