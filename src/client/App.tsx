import { useState, useSyncExternalStore } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAlertSettings } from "./hooks/useAlertSettings";
import { useSoundAlerts } from "./hooks/useSoundAlerts";
import { getVersion, isBrowserMode, getEventCount, subscribe } from "./browser/store";
import { LiveTicker } from "./components/LiveTicker";
import { OverviewTotals } from "./components/OverviewTotals";
import { ModelTable } from "./components/ModelTable";
import { AgentTable } from "./components/AgentTable";
import { DailyView } from "./components/DailyView";
import { HourlyView } from "./components/HourlyView";
import { ForecastView } from "./components/ForecastView";
import { ContributionGraph } from "./components/ContributionGraph";
import { StatsView } from "./components/StatsView";
import { SessionsTable } from "./components/SessionsTable";
import { SkillsView } from "./components/SkillsView";
import { AlertSettings } from "./components/AlertSettings";
import { ExportView } from "./components/ExportView";
import { ConnectView } from "./components/ConnectView";
import { ThemeIcon, useTheme } from "./theme";
import "./styles.css";
import "./dashboard-shell.css";

type Tab = "overview" | "models" | "agents" | "sessions" | "skills" | "daily" | "hourly" | "forecast" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "agents", label: "Agents" },
  { id: "sessions", label: "Sessions" },
  { id: "skills", label: "Skills" },
  { id: "daily", label: "Daily" },
  { id: "hourly", label: "Hourly" },
  { id: "forecast", label: "Forecast" },
  { id: "stats", label: "Stats" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [showConnect, setShowConnect] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const alerts = useAlertSettings();
  const { lastEvent, sessionSeq, state } = useWebSocket();
  useSoundAlerts(lastEvent, alerts.settings, alerts.snoozedUntil);
  const browserMode = useSyncExternalStore(subscribe, isBrowserMode, isBrowserMode);
  const browserVersion = useSyncExternalStore(subscribe, getVersion, getVersion);
  const eventCount = useSyncExternalStore(subscribe, getEventCount, getEventCount);
  const refreshKey = browserMode
    ? `browser:${browserVersion}`
    : lastEvent
      ? `${lastEvent.timestamp}:${lastEvent.cost}:${lastEvent.agent}:${lastEvent.model}`
      : "0";
  const connected = state === "open";
  const sourceLabel = browserMode ? "Browser logs" : "Server stream";
  const statusLabel = browserMode ? "Local only" : connected ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting";

  const focusTab = (nextIndex: number) => {
    const next = TABS[(nextIndex + TABS.length) % TABS.length];
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`dashboard-tab-${next.id}`)?.focus());
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(TABS.length - 1);
    }
  };

  return (
    <div className="app dashboard-app">
      <header className="topbar dashboard-topbar">
        <a className="brand-link" href="/" aria-label="tokenmaxxx home">
          <h1 className="brand">
            <span className="brand-mark" aria-hidden="true">t</span>
            <span>tokenmaxxx</span>
          </h1>
        </a>

        <div className="topbar-right dashboard-actions" aria-label="Dashboard controls">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title="Toggle theme"
            type="button"
          >
            <ThemeIcon theme={theme} />
          </button>
          <div className="dashboard-action-group">
            <button
              className={`btn ${alerts.settings.enabled ? "btn-active" : ""}`}
              onClick={() => setShowAlerts((s) => !s)}
              aria-expanded={showAlerts}
              type="button"
            >
              Alerts
            </button>
            <button
              className={`btn ${showExport ? "btn-active" : ""}`}
              onClick={() => setShowExport((s) => !s)}
              aria-expanded={showExport}
              type="button"
            >
              Export
            </button>
            <button
              className={`btn ${showConnect ? "btn-active" : ""}`}
              onClick={() => setShowConnect((s) => !s)}
              aria-expanded={showConnect}
              type="button"
            >
              {browserMode ? "Local logs" : "Connect logs"}
            </button>
          </div>
          <div className={`conn ${browserMode || connected ? "conn-open" : "conn-reconnecting"}`} aria-live="polite">
            <span className="dot" aria-hidden="true" />
            <span>{browserMode ? "browser" : connected ? "live" : state === "connecting" ? "connecting…" : "reconnecting…"}</span>
          </div>
        </div>
      </header>

      <section className="dashboard-heading" aria-labelledby="dashboard-title">
        <div className="dashboard-heading-copy">
          <p className="dashboard-eyebrow">Usage telemetry</p>
          <h2 id="dashboard-title">Token usage, in one operational view.</h2>
          <p>Inspect live cost, volume, sessions, skills, and forecasts without leaving the dashboard.</p>
        </div>
        <dl className="dashboard-context" aria-label="Current data context">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabel}</dd>
          </div>
        </dl>
      </section>

      <div className="dashboard-utilities">
        {showConnect && <ConnectView />}

        {showAlerts && (
          <AlertSettings
            settings={alerts.settings}
            onChange={alerts.update}
            snoozedUntil={alerts.snoozedUntil}
            onSnooze={alerts.snooze}
            onClearSnooze={alerts.clearSnooze}
          />
        )}

        {showExport && <ExportView />}

        {browserMode && (
          <div className="card muted browser-banner" role="status">
            viewing <strong>{eventCount.toLocaleString()}</strong> events from logs you loaded in this browser — nothing is uploaded to this server
          </div>
        )}
      </div>

      <nav className="tabs dashboard-tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((t, index) => (
          <button
            id={`dashboard-tab-${t.id}`}
            key={t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="dashboard-panel"
            tabIndex={tab === t.id ? 0 : -1}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main
        id="dashboard-panel"
        className="content dashboard-content"
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${tab}`}
      >
        {tab === "overview" && (
          <>
            {!browserMode && <LiveTicker lastEvent={lastEvent} />}
            <OverviewTotals refreshKey={refreshKey} />
            <ContributionGraph refreshKey={refreshKey} />
          </>
        )}
        {tab === "models" && <ModelTable refreshKey={refreshKey} />}
        {tab === "agents" && <AgentTable refreshKey={refreshKey} />}
        {tab === "sessions" && <SessionsTable refreshKey={refreshKey} sessionSeq={sessionSeq} />}
        {tab === "skills" && <SkillsView refreshKey={refreshKey} />}
        {tab === "daily" && <DailyView refreshKey={refreshKey} />}
        {tab === "hourly" && <HourlyView refreshKey={refreshKey} />}
        {tab === "forecast" && <ForecastView refreshKey={refreshKey} />}
        {tab === "stats" && <StatsView refreshKey={refreshKey} />}
      </main>
    </div>
  );
}

export default App;
