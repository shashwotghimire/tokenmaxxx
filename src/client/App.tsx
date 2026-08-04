import { useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { LiveTicker } from "./components/LiveTicker";
import { OverviewTotals } from "./components/OverviewTotals";
import { ModelTable } from "./components/ModelTable";
import { AgentTable } from "./components/AgentTable";
import { DailyView } from "./components/DailyView";
import { HourlyView } from "./components/HourlyView";
import { ContributionGraph } from "./components/ContributionGraph";
import { StatsView } from "./components/StatsView";
import { SessionsTable } from "./components/SessionsTable";
import "./styles.css";

type Tab = "overview" | "models" | "agents" | "sessions" | "daily" | "hourly" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "agents", label: "Agents" },
  { id: "sessions", label: "Sessions" },
  { id: "daily", label: "Daily" },
  { id: "hourly", label: "Hourly" },
  { id: "stats", label: "Stats" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const { lastEvent, sessionSeq, state } = useWebSocket();
  const refreshKey = lastEvent ? `${lastEvent.timestamp}:${lastEvent.cost}:${lastEvent.agent}:${lastEvent.model}` : "0";
  const connected = state === "open";

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">tokenmaxxx</h1>
        <div className={`conn ${connected ? "conn-open" : "conn-reconnecting"}`}>
          <span className="dot" />
          {connected ? "live" : state === "connecting" ? "connecting…" : "reconnecting…"}
        </div>
      </header>

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
            <LiveTicker lastEvent={lastEvent} />
            <OverviewTotals refreshKey={refreshKey} />
            <ContributionGraph refreshKey={refreshKey} />
          </>
        )}
        {tab === "models" && <ModelTable refreshKey={refreshKey} />}
        {tab === "agents" && <AgentTable refreshKey={refreshKey} />}
        {tab === "sessions" && <SessionsTable refreshKey={refreshKey} sessionSeq={sessionSeq} />}
        {tab === "daily" && <DailyView refreshKey={refreshKey} />}
        {tab === "hourly" && <HourlyView refreshKey={refreshKey} />}
        {tab === "stats" && <StatsView refreshKey={refreshKey} />}
      </main>
    </div>
  );
}

export default App;
