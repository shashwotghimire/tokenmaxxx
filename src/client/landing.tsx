import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./landing.css";

const BARS = [18, 34, 26, 48, 42, 64, 56, 78, 70, 92, 84, 100, 66, 88, 74, 96, 90, 108, 82, 118];

const AGENTS = [
  { name: "Claude Code", tag: "claude-code", color: "var(--yellow)" },
  { name: "OpenCode", tag: "opencode", color: "var(--accent)" },
  { name: "Codex CLI", tag: "codex", color: "var(--green)" },
];

const FEATURES = [
  {
    title: "Live streaming",
    body: "New log lines reach your dashboard in ~1 second over WebSocket — watch tokens tick up as you work.",
    icon: "⚡",
  },
  {
    title: "Every breakdown",
    body: "Slice usage by model, agent, day, and hour. Find which models burn your budget fastest.",
    icon: "▦",
  },
  {
    title: "Forecast ahead",
    body: "Trend + seasonality model predicts the next 7/14/30 days of tokens and cost with an 80% interval.",
    icon: "↗",
  },
  {
    title: "Local & private",
    body: "No accounts, no cloud sync, no telemetry of your own. Your usage data never leaves your machine.",
    icon: "◈",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Keep coding",
    body: "Use Claude Code, OpenCode, or Codex CLI exactly as you always do.",
  },
  {
    n: "02",
    title: "tokenmaxxx watches",
    body: "It tails the agents' native logs and databases automatically — zero configuration.",
  },
  {
    n: "03",
    title: "See everything",
    body: "Live totals, per-session detail, and forecasts land in your browser in real time.",
  },
];

export function Landing() {
  return (
    <div className="landing">
      <nav className="l-nav">
        <a className="l-brand" href="/">
          <span className="l-logo">t</span>
          tokenmaxxx
        </a>
        <div className="l-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#agents">Agents</a>
        </div>
        <a className="l-btn l-btn-primary" href="/dashboard">
          Open dashboard →
        </a>
      </nav>

      <header className="l-hero">
        <div className="l-hero-bg" aria-hidden="true" />
        <div className="l-wrap l-hero-inner">
          <span className="l-pill">real-time telemetry for AI coding agents</span>
          <h1>
            Know every token
            <br />
            you <span className="l-accent">spend</span>.
          </h1>
          <p className="l-sub">
            A self-hosted, live dashboard that watches Claude Code, OpenCode, and Codex CLI — tokens,
            cost, and trends streaming in as you work.
          </p>
          <div className="l-cta">
            <a className="l-btn l-btn-primary l-btn-lg" href="/dashboard">
              Open dashboard
            </a>
            <a
              className="l-btn l-btn-ghost l-btn-lg"
              href="https://github.com/shashwotghimire/tokenmaxxx"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
          </div>
        </div>

        <div className="l-wrap">
          <div className="l-hero-card">
            <div className="l-hc-head">
              <div className="l-hc-live">
                <span className="l-dot" />
                live · claude-code · opus
              </div>
              <div className="l-hc-value">$0.024</div>
            </div>
            <div className="l-hc-stats">
              <div className="l-hc-stat">
                <span>input</span>
                <strong>184K</strong>
              </div>
              <div className="l-hc-stat">
                <span>output</span>
                <strong>92K</strong>
              </div>
              <div className="l-hc-stat">
                <span>cache read</span>
                <strong>410K</strong>
              </div>
              <div className="l-hc-stat l-hc-stat-cost">
                <span>cost</span>
                <strong>$0.024</strong>
              </div>
            </div>
            <div className="l-hc-chart">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="l-hc-bar"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.03}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="l-agents" id="agents">
        <div className="l-wrap">
          <p className="l-eyebrow">works with</p>
          <div className="l-agent-row">
            {AGENTS.map((a) => (
              <div className="l-agent" key={a.name}>
                <span className="l-agent-dot" style={{ background: a.color }} />
                {a.name}
                <code>{a.tag}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="l-wrap">
          <p className="l-eyebrow">features</p>
          <h2 className="l-h2">Everything you need to rein in your spend</h2>
          <div className="l-feature-grid">
            {FEATURES.map((f) => (
              <div className="l-feature" key={f.title}>
                <div className="l-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section l-section-alt" id="how">
        <div className="l-wrap">
          <p className="l-eyebrow">how it works</p>
          <h2 className="l-h2">Zero config. Just run it.</h2>
          <div className="l-step-grid">
            {STEPS.map((s) => (
              <div className="l-step" key={s.n}>
                <span className="l-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-cta-band">
        <div className="l-wrap">
          <h2 className="l-h2">Spin it up in minutes</h2>
          <p className="l-sub">
            Runs anywhere Bun runs — your laptop, a VPS, or a Docker container.
          </p>
          <div className="l-code">
            <span className="l-code-prompt">$</span> docker run -p 3000:3000 ghcr.io/shashwotghimire/tokenmaxxx
          </div>
          <div className="l-cta">
            <a className="l-btn l-btn-primary l-btn-lg" href="/dashboard">
              Open dashboard
            </a>
            <a className="l-btn l-btn-ghost l-btn-lg" href="https://github.com/shashwotghimire/tokenmaxxx" target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-wrap">
          <a className="l-brand" href="/">
            <span className="l-logo">t</span>
            tokenmaxxx
          </a>
          <span className="l-footer-note">local-first · no accounts · no cloud</span>
        </div>
      </footer>
    </div>
  );
}

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <Landing />
  </StrictMode>
);

(import.meta.hot.data.root ??= createRoot(elem)).render(app);

export default Landing;
