import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { FilterBar } from "./components/FilterBar";
import { InsightsView } from "./components/InsightsView";
import { DataQualityView } from "./components/DataQualityView";
import { SourceHealth } from "./components/SourceHealth";
import "./styles.css";

type Tab = "overview" | "models" | "agents" | "sessions" | "skills" | "daily" | "hourly" | "forecast" | "stats" | "insights" | "quality";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "agents", label: "Agents" },
  { id: "sessions", label: "Sessions" },
  { id: "insights", label: "Spend & cache" },
  { id: "quality", label: "Data quality" },
  { id: "skills", label: "Skills" },
  { id: "daily", label: "Daily" },
  { id: "hourly", label: "Hourly" },
  { id: "forecast", label: "Forecast" },
  { id: "stats", label: "Stats" },
];

export function App() {
  const initial = new URLSearchParams(location.search).get("view") as Tab | null;
  const [tab, setTabState] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial! : "overview");
  const [filterSeq, setFilterSeq] = useState(0);
  const [privacy, setPrivacy] = useState(() => localStorage.getItem("tokenmaxxx:privacy") === "1");
  const tabsRef = useRef<HTMLElement>(null);
  const setTab = (next: Tab) => { setTabState(next); const q = new URLSearchParams(location.search); q.set("view", next); history.replaceState(null, "", `${location.pathname}?${q}`); };
  useEffect(() => { document.documentElement.dataset.privacy = privacy ? "on" : "off"; localStorage.setItem("tokenmaxxx:privacy", privacy ? "1" : "0"); }, [privacy]);
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

      <FilterBar onChange={() => setFilterSeq((n) => n + 1)} privacy={privacy} onPrivacy={() => setPrivacy((v) => !v)} />
      <nav className="tabs" role="tablist" aria-label="Dashboard views" ref={tabsRef} onKeyDown={(e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; const i = TABS.findIndex((t) => t.id === tab); const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length]!; setTab(next.id); requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus()); }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => setTab(t.id)}
            role="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} data-tab={t.id}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === "overview" && (
          <>
            {!browserMode && <LiveTicker lastEvent={lastEvent} />}
            <OverviewTotals refreshKey={`${refreshKey}:${filterSeq}`} />
            <SourceHealth refreshKey={refreshKey} browserMode={browserMode} />
            <ContributionGraph refreshKey={`${refreshKey}:${filterSeq}`} />
          </>
        )}
        {tab === "models" && <ModelTable refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "agents" && <AgentTable refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "sessions" && <SessionsTable refreshKey={`${refreshKey}:${filterSeq}`} sessionSeq={sessionSeq} />}
        {tab === "insights" && <InsightsView refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "quality" && <DataQualityView refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "skills" && <SkillsView refreshKey={refreshKey} />}
        {tab === "daily" && <DailyView refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "hourly" && <HourlyView refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "forecast" && <ForecastView refreshKey={`${refreshKey}:${filterSeq}`} />}
        {tab === "stats" && <StatsView refreshKey={`${refreshKey}:${filterSeq}`} />}
      </main>
    </div>
  );
}

export default App;
