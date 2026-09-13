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
    title: "Break down your usage",
    body: "Filter tokens and estimated cost by date, project, model, coding tool, or session. Open a session to find the events that cost the most.",
  },
  {
    title: "Know when data is incomplete",
    body: "If a model has no price, a source stops updating, or a provider reports only part of its usage, tokenmaxxx tells you instead of showing a misleading zero.",
  },
  {
    title: "Set a budget and compare periods",
    body: "Set daily or monthly limits, compare one period with another, check cache use, and see a 30-day forecast when there is enough history.",
  },
  {
    title: "Share without exposing private details",
    body: "Privacy mode hides titles and paths in screenshots. Exports remove credentials and shorten working-directory paths to project names.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Run tokenmaxxx",
    body: "Start it with Docker or Bun on the machine where your coding tools save their logs.",
  },
  {
    n: "02",
    title: "Give it read-only access",
    body: "Mount or select the Claude Code, OpenCode, and Codex CLI files you want it to read.",
  },
  {
    n: "03",
    title: "Open the dashboard",
    body: "See usage by day, model, project, and session. New records appear while tokenmaxxx is running.",
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
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <header className="l-hero">
        <div className="l-wrap l-hero-inner">
          <div className="l-hero-copy">
            <p className="l-kicker">token and cost tracking for AI coding tools</p>
            <h1>See what your AI coding tools cost.</h1>
            <p className="l-sub">
              tokenmaxxx reads the usage files already saved by Claude Code, OpenCode, and Codex
              CLI. It shows tokens and estimated cost by day, model, project, and session, so you
              can see where the money goes. Load files in your browser or run tokenmaxxx on your
              own machine.
            </p>
            <div className="l-cta">
              <a className="l-btn l-btn-primary l-btn-lg" href="#install">
                Set it up
              </a>
              <a
                className="l-btn l-btn-ghost l-btn-lg"
                href="https://github.com/shashwotghimire/tokenmaxxx"
                target="_blank"
                rel="noreferrer"
              >
                See the code on GitHub ↗
              </a>
            </div>
          </div>

          <figure className="l-panel">
            <figcaption className="l-panel-meta">
              <span className="l-dot" aria-hidden="true" />
              example · claude-code · opus
              <span className="l-panel-sample">sample data</span>
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
          <p className="l-kicker l-kicker-center">reads usage from</p>
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

      <section className="l-mode-strip" aria-labelledby="mode-heading">
        <div className="l-wrap l-mode-grid">
          <div><p className="l-kicker">choose how it reads your data</p><h2 id="mode-heading" className="l-h2">Your files stay on the machine you choose.</h2></div>
          <dl className="l-mode-list">
            <div><dt>In your browser</dt><dd>Choose the log files yourself. tokenmaxxx reads them in that tab and does not upload them. You may need to choose the files again in a new browser session.</dd></div>
            <div><dt>On your machine</dt><dd>Run tokenmaxxx on your computer or server and point it at the log files. It watches for changes and updates the dashboard while it is running.</dd></div>
          </dl>
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="l-wrap">
          <Reveal>
            <p className="l-kicker">what you can see</p>
            <h2 className="l-h2">See where your tokens go and what they cost.</h2>
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
            <h2 className="l-h2">Point it at your logs. Then keep coding.</h2>
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
            <p className="l-kicker l-kicker-on">run tokenmaxxx</p>
            <h2 className="l-h2 l-h2-on">Start with Docker</h2>
            <p className="l-sub l-sub-on">
              Copy the command for your system. It reads the default log folders without changing
              them and stores tokenmaxxx data in a Docker volume.
            </p>
            <div className="l-os-tabs" role="tablist" aria-label="Installation platform">
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
                  role="tab"
                  aria-selected={os === key}
                  tabIndex={os === key ? 0 : -1}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="l-code l-code-block">
              <span className="l-code-prompt">{PROMPT[os]}</span>
              <pre>{INSTALL[os]}</pre>
              <CopyButton text={INSTALL[os]!} />
            </div>
            <p className="l-sub l-sub-small l-sub-on">
              When the container starts, open <code>http://localhost:3000</code>. The dashboard opens
              immediately. If you
              cloned the repository and already have Bun, use <code>bun start</code> instead.
            </p>
            <div className="l-cta">
              <a
                className="l-btn l-btn-primary l-btn-lg"
                href="https://github.com/shashwotghimire/tokenmaxxx"
                target="_blank"
                rel="noreferrer"
              >
                View setup on GitHub ↗
              </a>
              <a className="l-btn l-btn-ghost l-btn-lg l-btn-ghost-on" href="#features">
                See what it tracks
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
          <span className="l-footer-note">your logs stay on your machine</span>
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
