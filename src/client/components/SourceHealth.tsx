import { useEffect, useState } from "react";
import { fetchJSON } from "../format";
export function SourceHealth({ refreshKey }: { refreshKey: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { let active = true; const refresh = () => fetchJSON("/api/source-status").then((value) => { if (active) setD(value); }).catch(() => { if (active) setD(null); }); refresh(); const timer = setInterval(refresh, 5000); return () => { active = false; clearInterval(timer); }; }, [refreshKey]);
  return <section className="card source-health"><h2>Source health</h2><p><strong>Origin:</strong> this machine · <strong>mode:</strong> automatic JSON log discovery · <strong>process:</strong> {d ? "running" : "status unavailable"}</p>{d?.sources && <ul>{d.sources.map((source: { id: string; state: string; files: number }) => <li key={source.id}>{source.id}: {source.state}{source.files > 0 ? ` (${source.files} files)` : ""}</li>)}</ul>}<p className="muted">Run tokenmaxxx on the same machine as your agents. It watches their default JSON/JSONL folders and updates usage as records arrive. Agents with only database storage have no JSON usage to display.</p></section>;
}
