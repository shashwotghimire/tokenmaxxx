import { useEffect, useState } from "react";
import { fetchJSON } from "../format";
export function SourceHealth({ refreshKey, browserMode }: { refreshKey: string; browserMode: boolean }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (!browserMode) fetchJSON("/api/source-status").then(setD).catch(() => setD(null)); }, [refreshKey, browserMode]);
  if (browserMode) return <section className="card source-health"><h2>Source health</h2><p><strong>Origin:</strong> files selected in this browser · <strong>mode:</strong> browser-local snapshot</p><p className="muted">“Local” means parsed in this tab and not uploaded. It is not background-live unless the browser retains file permission and rescans.</p></section>;
  return <section className="card source-health"><h2>Source health</h2><p><strong>Origin:</strong> this server machine · <strong>mode:</strong> server watchers · <strong>process:</strong> {d ? "running" : "status unavailable"}</p><p className="muted">“Live” means the server polls configured local sources and pushes newly detected events while both processes run. It does not guarantee complete provider fields.</p></section>;
}
