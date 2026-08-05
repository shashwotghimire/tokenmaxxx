import { testAlert, agentLabel, dollarsAndCents, type AlertConfig } from "../sound";

export function AlertSettings({
  settings,
  onChange,
  snoozedUntil,
  onSnooze,
  onClearSnooze,
}: {
  settings: AlertConfig;
  onChange: (patch: Partial<AlertConfig>) => void;
  snoozedUntil: number | null;
  onSnooze: (hours: number) => void;
  onClearSnooze: () => void;
}) {
  const snoozing = snoozedUntil !== null && snoozedUntil > Date.now();
  const remainingMin = snoozedUntil ? Math.max(0, Math.ceil((snoozedUntil - Date.now()) / 60_000)) : 0;

  return (
    <section className={`card connect ${settings.enabled ? "alert-armed" : ""}`}>
      <div className="connect-head">
        <div>
          <h2>Sound alerts</h2>
          <p className="muted">
            Beeps and/or speaks aloud whenever a single usage event costs more than your threshold. Everything stays in
            this browser — no server involved.
          </p>
        </div>
        <button className={`btn ${settings.enabled ? "btn-active" : ""}`} onClick={() => onChange({ enabled: !settings.enabled })}>
          {settings.enabled ? "Armed — click to disable" : "Click to arm"}
        </button>
      </div>

      <div className="alert-grid">
        <label>
          <span>threshold per event</span>
          <span className="alert-input">
            <span className="alert-prefix">$</span>
            <input
              type="number"
              min={0.01}
              step={0.25}
              value={settings.threshold}
              onChange={(e) => onChange({ threshold: Math.max(0.01, Number(e.target.value) || 0) })}
            />
          </span>
        </label>
        <label>
          <span>sound</span>
          <select
            value={settings.mode}
            onChange={(e) => onChange({ mode: e.target.value as AlertConfig["mode"] })}
          >
            <option value="beep">beep</option>
            <option value="voice">voice</option>
            <option value="both">beep + voice</option>
          </select>
        </label>
        <label>
          <span>repeat</span>
          <select
            value={settings.repeat}
            disabled={settings.mode === "beep"}
            onChange={(e) => onChange({ repeat: Number(e.target.value) })}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </label>
      </div>

      <div className="connect-actions">
        <button className="btn" onClick={() => testAlert(settings)}>
          Test alert
        </button>
        {snoozing ? (
          <button className="btn" onClick={onClearSnooze}>
            Un-snooze ({remainingMin}m left)
          </button>
        ) : (
          <button className="btn" onClick={() => onSnooze(1)}>
            Snooze 1 hour
          </button>
        )}
      </div>

      <p className="muted alert-preview">
        will announce: “{agentLabel("opencode")} just spent {dollarsAndCents(Math.max(settings.threshold, 0.01))}.”
        {settings.mode === "beep" ? " (just the beep)" : settings.mode === "voice" ? " (voice only)" : ""}
      </p>
    </section>
  );
}
