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

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand-link" href="/">
          <h1 className="brand">tokenmaxxx</h1>
        </a>
        <div className="topbar-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title="Toggle theme"
          >
            <ThemeIcon theme={theme} />
          </button>
          <button className={`btn ${alerts.settings.enabled ? "btn-active" : ""}`} onClick={() => setShowAlerts((s) => !s)}>
            Alerts
          </button>
          <button className={`btn ${showExport ? "btn-active" : ""}`} onClick={() => setShowExport((s) => !s)}>
            Export
          </button>
          <button className="btn" onClick={() => setShowConnect((s) => !s)}>
            {browserMode ? "Viewing local logs" : "Connect logs"}
          </button>
          <div className={`conn ${browserMode ? "conn-open" : connected ? "conn-open" : "conn-reconnecting"}`}>
            <span className="dot" />
            {browserMode
              ? "browser"
              : connected
                ? "live"
                : state === "connecting"
                  ? "connecting…"
                  : "reconnecting…"}
          </div>
        </div>
      </header>

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
        <div className="card muted browser-banner">
          viewing <strong>{eventCount.toLocaleString()}</strong> events from logs you loaded in this browser —
          nothing is uploaded to this server
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
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
