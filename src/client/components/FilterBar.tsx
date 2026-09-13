import { useMemo, useState } from "react";

const KEYS = ["agent", "model", "project", "since", "until", "tz"] as const;
const SAVED_KEY = "tokenmaxxx:saved-views";
type Saved = { name: string; query: string };

export function FilterBar({ onChange, privacy, onPrivacy }: { onChange: () => void; privacy: boolean; onPrivacy: () => void }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [saved, setSaved] = useState<Saved[]>(() => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; } });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(location.search); value ? next.set(key, value) : next.delete(key);
    history.replaceState(null, "", `${location.pathname}?${next}`); onChange();
  };
  const clear = () => { const next = new URLSearchParams(location.search); KEYS.forEach((k) => next.delete(k)); history.replaceState(null, "", `${location.pathname}?${next}`); onChange(); };
  const save = () => {
    const name = prompt("Saved view name"); if (!name?.trim()) return;
    const shareable = new URLSearchParams(location.search); shareable.delete("project");
    const next = [...saved.filter((v) => v.name !== name.trim()), { name: name.trim(), query: shareable.toString() }];
    setSaved(next); localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };
  const apply = (query: string) => { history.replaceState(null, "", `${location.pathname}?${query}`); onChange(); };
  return (
    <section className="filterbar" aria-label="Dashboard filters">
      <label>Period <select defaultValue={params.has("since") ? "custom" : "all"} onChange={(e) => { if (e.target.value === "all") { update("since", ""); update("until", ""); } else { const days = Number(e.target.value); const d = new Date(); d.setDate(d.getDate() - days + 1); update("since", d.toISOString().slice(0, 10)); update("until", new Date().toISOString().slice(0, 10)); } }}><option value="all">All time</option><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option><option value="custom" disabled>Custom dates</option></select></label>
      <label>From <input type="date" defaultValue={params.get("since") ?? ""} onChange={(e) => update("since", e.target.value)} /></label>
      <label>To <input type="date" defaultValue={params.get("until") ?? ""} onChange={(e) => update("until", e.target.value)} /></label>
      <label>Agent <select defaultValue={params.get("agent") ?? ""} onChange={(e) => update("agent", e.target.value)}><option value="">All</option><option value="claude-code">Claude Code</option><option value="opencode">OpenCode</option><option value="codex">Codex</option></select></label>
      <label>Model <input defaultValue={params.get("model") ?? ""} placeholder="All models" onBlur={(e) => update("model", e.target.value)} /></label>
      <label>Project <input defaultValue={params.get("project") ?? ""} placeholder="All projects" onBlur={(e) => update("project", e.target.value)} /></label>
      <label>Timezone <input defaultValue={params.get("tz") ?? Intl.DateTimeFormat().resolvedOptions().timeZone} onBlur={(e) => update("tz", e.target.value)} /></label>
      <div className="filter-actions"><button className="btn" onClick={clear}>Clear filters</button><button className="btn" onClick={save}>Save view</button><button className={`btn ${privacy ? "btn-active" : ""}`} onClick={onPrivacy} aria-pressed={privacy}>Privacy mode</button></div>
      {saved.length > 0 && <label>Saved view <select defaultValue="" onChange={(e) => apply(e.target.value)}><option value="">Choose…</option>{saved.map((v) => <option key={v.name} value={v.query}>{v.name}</option>)}</select></label>}
      <p className="filter-note">Filters apply to every applicable view. Saved/shareable state omits project paths. Dates use the selected IANA timezone; end dates are inclusive.</p>
    </section>
  );
}
