import { useEffect, useState } from "react";
import { fetchJSON } from "../format";
export function DataQualityView({ refreshKey }: { refreshKey: string }) {
  const [d, setD] = useState<any>(null); const [error, setError] = useState("");
  useEffect(() => { fetchJSON("/api/diagnostics").then(setD).catch((e) => setError(String(e))); }, [refreshKey]);
  if (error) return <section className="card error">Unable to load diagnostics: {error}</section>; if (!d) return <section className="card muted">Loading diagnostics…</section>;
  const rows = [["missing model", d.missingModel], ["unknown pricing", d.unknownPricing], ["partial measurements", d.partialMeasurements], ["stable source identities", d.duplicateImportsPrevented], ["parse errors", d.parseErrors ?? "not historically counted"]];
  return <section className="card"><h2>Data quality</h2><p className="muted">Actionable coverage checks for imported and live data. A zero means the check found no current issue, not that every provider exposes every field.</p><table className="table"><thead><tr><th>check</th><th>count / status</th></tr></thead><tbody>{rows.map(([k,v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table><h3>Cost methodology</h3><p>{d.pricing.methodology}. Currency: {d.pricing.currency}. Rates: {d.pricing.version}. Unknown models remain unpriced; $0 is reserved for verified free rates.</p><p className="muted">{d.note}</p></section>;
}
