import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./landing.css";
import { BrandTile } from "./components/brand-icons";
import type { BrandKind } from "./components/brand-icons";
import { ThemeIcon, useTheme } from "./theme";

const BARS = [18, 34, 26, 48, 42, 64, 56, 78, 70, 92, 84, 100, 66, 88, 74, 96, 90, 108, 82, 118];

const AGENTS: { name: string; tag: string; brand: BrandKind }[] = [
  { name: "Claude Code", tag: "claude-code", brand: "claude" },
  { name: "OpenCode", tag: "opencode", brand: "opencode" },
  { name: "Codex CLI", tag: "codex", brand: "codex" },
];

const FEATURES = [
  {
    title: "Live streaming",
    body: "New log lines reach your dashboard in ~1 second over WebSocket — watch tokens tick up as you work.",
  },
  {
    title: "Every breakdown",
    body: "Slice usage by model, agent, day, and hour. Find which models burn your budget fastest.",
  },
  {
    title: "Forecast ahead",
    body: "Trend + seasonality model predicts the next 7/14/30 days of tokens and cost with an 80% interval.",
  },
  {
    title: "Local & private",
    body: "No accounts, no cloud sync, no telemetry of your own. Your usage data never leaves your machine.",
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

const INSTALL: Record<string, string> = {
  unix: `docker run -d --name tokenmaxxx -p 3000:3000 \\
  -v "$HOME/.claude:/root/.claude:ro" \\
  -v "$HOME/.local/share/opencode:/root/.local/share/opencode:ro" \\
  -v "$HOME/.codex:/root/.codex:ro" \\
  -v tokenmaxxx-data:/data \\
  ghcr.io/shashwotghimire/tokenmaxxx:latest`,
  powershell: `docker run -d --name tokenmaxxx -p 3000:3000 \`
  -v "$HOME\\.claude:/root/.claude:ro" \`
  -v "$HOME\\.local\\share\\opencode:/root/.local/share/opencode:ro" \`
  -v "$HOME\\.codex:/root/.codex:ro" \`
  -v tokenmaxxx-data:/data \`
  ghcr.io/shashwotghimire/tokenmaxxx:latest`,
  cmd: `docker run -d --name tokenmaxxx -p 3000:3000 -v %USERPROFILE%\\.claude:/root/.claude:ro -v %USERPROFILE%\\.local\\share\\opencode:/root/.local/share/opencode:ro -v %USERPROFILE%\\.codex:/root/.codex:ro -v tokenmaxxx-data:/data ghcr.io/shashwotghimire/tokenmaxxx:latest`,
};

const PROMPT: Record<string, string> = { unix: "$", powershell: "PS>", cmd: ">" };

const COMMANDS = [
  { id: "features", label: "Features", hint: "jump to features" },
  { id: "how", label: "How it works", hint: "jump to how it works" },
  { id: "install", label: "Install", hint: "jump to install" },
  { id: "dashboard", label: "Open dashboard", hint: "go to /dashboard" },
  { id: "github", label: "View on GitHub", hint: "github.com/shashwotghimire/tokenmaxxx" },
] as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results = COMMANDS.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.hint.includes(q)
  );

  const go = (id: string) => {
    onClose();
    if (id === "dashboard") {
      window.location.href = "/dashboard";
      return;
    }
    if (id === "github") {
      window.open("https://github.com/shashwotghimire/tokenmaxxx", "_blank", "noreferrer");
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <span className="cmdk-prompt" aria-hidden="true">/</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Jump to…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                go(results[sel].id);
              }
            }}
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <ul className="cmdk-list" role="listbox">
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === sel}
              className={`cmdk-row${i === sel ? " cmdk-row-sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(c.id)}
            >
              <span className="cmdk-label">{c.label}</span>
              <span className="cmdk-hint">{c.hint}</span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="cmdk-empty">No commands match “{query}”</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Reveal({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal" style={{ ["--i" as string]: index }}>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button className="copy-btn" onClick={copy} aria-label="Copy command">
      {copied ? <span className="copy-ok">copied ✓</span> : <span className="copy-label">copy</span>}
    </button>
  );
}

export function Landing() {
  const [os, setOs] = useState<"unix" | "powershell" | "cmd">("unix");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="landing">
      <nav className="l-nav">
        <a className="l-brand" href="/">
          tokenmaxxx
        </a>
        <div className="l-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#install">Install</a>
        </div>
        <div className="l-nav-actions">
          <button
            className="l-cmdk"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <span aria-hidden="true">⌘</span>K
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title="Toggle theme"
          >
            <ThemeIcon theme={theme} />
          </button>
          <a className="l-btn l-btn-primary" href="/dashboard">
            Open dashboard
          </a>
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <header className="l-hero">
        <div className="l-wrap l-hero-inner">
          <div className="l-hero-copy">
            <p className="l-kicker">self-hosted telemetry for AI coding agents</p>
            <h1>Know every token you spend.</h1>
            <p className="l-sub">
              Runs on your machine and reads the logs Claude Code, OpenCode, and Codex CLI already
              keep. Counts tokens and cost live, slices them by model and day, and forecasts the
              next 30 days. Nothing is uploaded, ever.
            </p>
            <div className="l-cta">
              <a className="l-btn l-btn-primary l-btn-lg" href="#install">
                Try it
              </a>
              <a
                className="l-btn l-btn-ghost l-btn-lg"
                href="https://github.com/shashwotghimire/tokenmaxxx"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub ↗
              </a>
            </div>
          </div>

          <figure className="l-panel">
            <figcaption className="l-panel-meta">
              <span className="l-dot" aria-hidden="true" />
              live · claude-code · opus
              <span className="l-panel-sample">sample</span>
            </figcaption>
            <div className="l-panel-body">
              <div className="l-panel-stats">
                <div className="l-panel-stat">
                  <span className="l-panel-label">input</span>
                  <strong>184K</strong>
                </div>
                <div className="l-panel-stat">
                  <span className="l-panel-label">output</span>
                  <strong>92K</strong>
                </div>
                <div className="l-panel-stat">
                  <span className="l-panel-label">cost</span>
                  <strong className="l-panel-cost">$0.024</strong>
                </div>
              </div>
              <div className="l-panel-chart" role="img" aria-label="Example usage bars">
                {BARS.map((h, i) => (
                  <div
                    key={i}
                    className="l-panel-bar"
                    style={{ height: `${h}%`, animationDelay: reduced ? "0s" : `${i * 0.03}s` }}
                  />
                ))}
              </div>
            </div>
          </figure>
        </div>
      </header>

      <section className="l-agents" id="agents">
        <div className="l-wrap">
          <p className="l-kicker l-kicker-center">works with</p>
          <div className="l-agent-row">
            {AGENTS.map((a) => (
              <div className="l-agent" key={a.name}>
                <BrandTile kind={a.brand} size={20} />
                {a.name}
                <code>{a.tag}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="l-wrap">
          <Reveal>
            <p className="l-kicker">features</p>
            <h2 className="l-h2">Everything you need to rein in your spend</h2>
            <div className="l-spec">
              {FEATURES.map((f, i) => (
                <div className="l-spec-row" key={f.title}>
                  <h3 className="l-spec-name">{f.title}</h3>
                  <p className="l-spec-body">{f.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="l-section l-section-alt" id="how">
        <div className="l-wrap">
          <Reveal>
            <p className="l-kicker">how it works</p>
            <h2 className="l-h2">Zero config. Just run it.</h2>
            <div className="l-steps">
              {STEPS.map((s, i) => (
                <div className="l-step" key={s.n}>
                  <span className="l-step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <span className="l-step-connector" aria-hidden="true">
                    {i < STEPS.length - 1 ? "→" : ""}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="l-band" id="install">
        <div className="l-wrap">
          <Reveal>
            <p className="l-kicker l-kicker-on">install</p>
            <h2 className="l-h2 l-h2-on">Self-host it in minutes</h2>
            <p className="l-sub l-sub-on">
              One command. Your logs stay on your machine — tokenmaxxx reads the agents&apos; own
              files and streams the dashboard to localhost.
            </p>
            <div className="l-os-tabs">
              {(
                [
                  ["unix", "macOS / Linux"],
                  ["powershell", "Windows · PowerShell"],
                  ["cmd", "Windows · cmd"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`l-os-tab${os === key ? " l-os-tab-on" : ""}`}
                  onClick={() => setOs(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="l-code l-code-block">
              <span className="l-code-prompt">{PROMPT[os]}</span>
              <pre>{INSTALL[os]}</pre>
              <CopyButton text={INSTALL[os]} />
            </div>
            <p className="l-sub l-sub-small l-sub-on">
              Then open <code>http://localhost:3000/dashboard</code>. Or run it directly with
              <code> bun start</code> if you already have Bun.
            </p>
            <div className="l-cta">
              <a
                className="l-btn l-btn-primary l-btn-lg"
                href="https://github.com/shashwotghimire/tokenmaxxx"
                target="_blank"
                rel="noreferrer"
              >
                Get it on GitHub ↗
              </a>
              <a className="l-btn l-btn-ghost l-btn-lg l-btn-ghost-on" href="#features">
                See features
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-wrap l-footer-row">
          <a className="l-brand" href="/">
            tokenmaxxx
          </a>
          <span className="l-footer-note">local-first · no accounts · no cloud</span>
          <div className="l-footer-links">
            <a href="#features">Features</a>
            <a href="#install">Install</a>
            <a href="https://github.com/shashwotghimire/tokenmaxxx" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
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
