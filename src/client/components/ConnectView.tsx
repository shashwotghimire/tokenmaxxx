import { useCallback, useState, useSyncExternalStore } from "react";
import { getEventCount, isBrowserMode, setBrowserData, subscribe, updateBrowserEvents, disconnect } from "../browser/store";
import { parseClaudeFile, readCodexDb, readOpencodeDb, walkDir } from "../browser/readers";
import type { SessionInfo, UsageEvent } from "../browser/types";

interface Loader {
  label: string;
  load: () => Promise<{ events: UsageEvent[]; sessions: SessionInfo[] }>;
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function pickDir(): Promise<FileSystemDirectoryHandle | null> {
  if ("showDirectoryPicker" in window) {
    return (window as any).showDirectoryPicker().catch(() => null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as any).webkitdirectory = true;
    (input as any).multiple = true;
    input.accept = ".jsonl";
    input.onchange = () => {
      const files = [...(input.files ?? [])].filter((f) => f.name.endsWith(".jsonl"));
      if (files.length === 0) return resolve(null);
      // Wrap the File[] as a pseudo-handle-based loader below.
      resolve(files as unknown as FileSystemDirectoryHandle);
    };
    input.click();
  });
}

export function ConnectView() {
  const isBrowser = useSyncExternalStore(subscribe, isBrowserMode, isBrowserMode);
  const eventCount = useSyncExternalStore(subscribe, getEventCount, getEventCount);
  const [loaders, setLoaders] = useState<Loader[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (next: Loader[]) => {
      setBusy(true);
      setError(null);
      try {
        let events: UsageEvent[] = [];
        let sessions: SessionInfo[] = [];
        for (const l of next) {
          const r = await l.load();
          events = events.concat(r.events);
          sessions = sessions.concat(r.sessions);
        }
        if (isBrowserMode()) {
          updateBrowserEvents({ events, sessions, sources: next.map((l) => l.label) });
        } else {
          setBrowserData({ events, sessions, sources: next.map((l) => l.label) });
        }
        setLoaders(next);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const addClaude = async () => {
    const dir = await pickDir();
    if (!dir) return;
    // Two shapes: FileSystemDirectoryHandle or a fallback File[].
    const isDirHandle = !Array.isArray(dir);
    const loader: Loader = {
      label: isDirHandle ? "Claude Code logs" : "Claude Code logs (files)",
      load: async () => {
        const files = isDirHandle ? await walkDir(dir) : (dir as unknown as File[]);
        const events: UsageEvent[] = [];
        const sessions: SessionInfo[] = [];
        for (const f of files) {
          const r = parseClaudeFile(f.name, await f.text());
          events.push(...r.events);
          sessions.push(r.session);
        }
        return { events, sessions };
      },
    };
    await reload([...loaders, loader]);
  };

  const addOpencode = async () => {
    const file = await pickFile(".db,.sqlite");
    if (!file) return;
    const loader: Loader = {
      label: "OpenCode db",
      load: () => readOpencodeDb(file),
    };
    await reload([...loaders, loader]);
  };

  const addCodex = async () => {
    const file = await pickFile(".sqlite,.db");
    if (!file) return;
    const loader: Loader = {
      label: "Codex state db",
      load: () => readCodexDb(file),
    };
    await reload([...loaders, loader]);
  };

  const handleDisconnect = () => {
    disconnect();
    setLoaders([]);
  };

  return (
    <section className={`card connect ${isBrowser ? "connect-live" : ""}`}>
      <div className="connect-head">
        <div>
          <h2>{isBrowser ? "Connected to your logs" : "Connect your logs"}</h2>
          <p className="muted">
            {isBrowser
              ? `${eventCount.toLocaleString()} events loaded in this browser — nothing is uploaded.`
              : "This site has no server-side data. Select your agent logs to see your own usage — everything stays in your browser."}
          </p>
        </div>
        {isBrowser && (
          <button className="btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </div>

      {!isBrowser && (
        <div className="connect-actions">
          <button className="btn btn-agent" onClick={addClaude} disabled={busy}>
            Claude Code
          </button>
          <button className="btn btn-agent" onClick={addOpencode} disabled={busy}>
            OpenCode
          </button>
          <button className="btn btn-agent" onClick={addCodex} disabled={busy}>
            Codex CLI
          </button>
        </div>
      )}

      {isBrowser && loaders.length > 0 && (
        <div className="connect-sources">
          {loaders.map((l, i) => (
            <span className="badge" key={i}>
              {l.label}
            </span>
          ))}
          <button className="btn" onClick={() => reload(loaders)} disabled={busy}>
            Scan again
          </button>
        </div>
      )}

      {busy && <p className="muted connect-status">reading logs…</p>}
      {error && <p className="error">error: {error}</p>}
    </section>
  );
}
