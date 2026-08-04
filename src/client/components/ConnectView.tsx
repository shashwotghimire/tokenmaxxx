import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getEventCount, isBrowserMode, setBrowserData, subscribe, updateBrowserEvents, disconnect } from "../browser/store";
import { parseClaudeFile, readCodexDb, readOpencodeDb, walkDir } from "../browser/readers";
import type { SessionInfo, UsageEvent } from "../browser/types";
import { clearHandles, loadHandles, saveHandles } from "../browser/persistence";
import type { StoredHandles } from "../browser/persistence";
import { defaultPaths, detectOS } from "../browser/platform";
import { BrandTile } from "./brand-icons";

interface Loader {
  label: string;
  load: () => Promise<{ events: UsageEvent[]; sessions: SessionInfo[] }>;
}

function toFile(src: File | FileSystemFileHandle): Promise<File> {
  if (typeof File !== "undefined" && src instanceof File) return Promise.resolve(src);
  return (src as FileSystemFileHandle).getFile();
}

async function permissionFor(handle: FileSystemHandle, request: boolean): Promise<boolean> {
  const h = handle as unknown as { queryPermission?: (d: { mode: string }) => Promise<string>; requestPermission?: (d: { mode: string }) => Promise<string> };
  if (typeof h.queryPermission !== "function") return true;
  let state = await h.queryPermission({ mode: "read" });
  if (state !== "granted" && request && typeof h.requestPermission === "function") {
    state = await h.requestPermission({ mode: "read" });
  }
  return state === "granted";
}

function pickFileFallback(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function pickFile(id: string): Promise<File | FileSystemFileHandle | null> {
  if ("showOpenFilePicker" in window) {
    return (window as any)
      .showOpenFilePicker({
        id,
        mode: "read",
        types: [{ description: "SQLite database", accept: { "application/octet-stream": [".db", ".sqlite"] } }],
      })
      .then((handles: FileSystemFileHandle[]) => handles[0] ?? null)
      .catch(() => null);
  }
  return pickFileFallback(".db,.sqlite");
}

function pickDir(): Promise<FileSystemDirectoryHandle | File[] | null> {
  if ("showDirectoryPicker" in window) {
    return (window as any)
      .showDirectoryPicker({ id: "claude-projects", mode: "read" })
      .catch(() => null) as Promise<FileSystemDirectoryHandle | null>;
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
      resolve(files as unknown as File[]);
    };
    input.click();
  });
}

function claudeLoader(dir: FileSystemDirectoryHandle | File[]): Loader {
  const isDirHandle = !Array.isArray(dir);
  return {
    label: isDirHandle ? "Claude Code logs" : "Claude Code logs (files)",
    load: async () => {
      const files = isDirHandle ? await walkDir(dir as FileSystemDirectoryHandle) : (dir as File[]);
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
}

function opencodeLoader(src: File | FileSystemFileHandle): Loader {
  return { label: "OpenCode db", load: async () => readOpencodeDb(await toFile(src)) };
}

function codexLoader(src: File | FileSystemFileHandle): Loader {
  return { label: "Codex state db", load: async () => readCodexDb(await toFile(src)) };
}

export function ConnectView() {
  const isBrowser = useSyncExternalStore(subscribe, isBrowserMode, isBrowserMode);
  const eventCount = useSyncExternalStore(subscribe, getEventCount, getEventCount);
  const [loaders, setLoaders] = useState<Loader[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredHandles | null>(null);
  const [needPermission, setNeedPermission] = useState(false);

  const os = detectOS();
  const paths = defaultPaths(os);

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

  const remember = useCallback(
    async (update: (h: StoredHandles) => void) => {
      const current = stored ?? (await loadHandles());
      update(current);
      await saveHandles(current);
      setStored(current);
    },
    [stored]
  );

  const collectStored = useCallback(
    async (request: boolean) => {
      const h = stored ?? (await loadHandles());
      if (!h) return [];
      const next: Loader[] = [];
      if (h.claude && (await permissionFor(h.claude, request))) next.push(claudeLoader(h.claude));
      if (h.opencode && (await permissionFor(h.opencode, request))) next.push(opencodeLoader(h.opencode));
      if (h.codex && (await permissionFor(h.codex, request))) next.push(codexLoader(h.codex));
      return next;
    },
    [stored]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await loadHandles();
      if (cancelled) return;
      setStored(h);
      const builders = await collectStored(false);
      if (cancelled) return;
      if (builders.length > 0) {
        await reload(builders);
      } else if (h && Object.values(h).some((v) => !!v)) {
        setNeedPermission(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnect = async () => {
    setBusy(true);
    try {
      const builders = await collectStored(true);
      setNeedPermission(builders.length === 0);
      if (builders.length > 0) await reload(builders);
    } finally {
      setBusy(false);
    }
  };

  const addClaude = async () => {
    const dir = await pickDir();
    if (!dir) return;
    if (!Array.isArray(dir)) await remember((h) => (h.claude = dir));
    await reload([...loaders, claudeLoader(dir)]);
  };

  const addOpencode = async () => {
    const file = await pickFile("opencode-db");
    if (!file) return;
    if (typeof File === "undefined" || !(file instanceof File)) await remember((h) => (h.opencode = file as FileSystemFileHandle));
    await reload([...loaders, opencodeLoader(file)]);
  };

  const addCodex = async () => {
    const file = await pickFile("codex-db");
    if (!file) return;
    if (typeof File === "undefined" || !(file instanceof File)) await remember((h) => (h.codex = file as FileSystemFileHandle));
    await reload([...loaders, codexLoader(file)]);
  };

  const handleDisconnect = async () => {
    await clearHandles();
    setStored(null);
    setNeedPermission(false);
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

      <div className="connect-detect">
        <span className="badge badge-os">Detected: {os}</span>
        <p className="muted connect-paths">
          Your logs live at:
          <code>{paths.claude}</code>
          <code>{paths.opencode}</code>
          <code>{paths.codex}</code>
        </p>
      </div>

      {!isBrowser && needPermission && (
        <div className="connect-actions">
          <button className="btn btn-primary" onClick={reconnect} disabled={busy}>
            Reconnect to your logs
          </button>
          <p className="muted">You granted access on this device before — re-authorize to read them again.</p>
        </div>
      )}

      {!isBrowser && !needPermission && (
        <div className="connect-actions">
          <button className="btn btn-agent" onClick={addClaude} disabled={busy}>
            <BrandTile kind="claude" />
            <span>Claude Code</span>
          </button>
          <button className="btn btn-agent" onClick={addOpencode} disabled={busy}>
            <BrandTile kind="opencode" />
            <span>OpenCode</span>
          </button>
          <button className="btn btn-agent" onClick={addCodex} disabled={busy}>
            <BrandTile kind="codex" />
            <span>Codex CLI</span>
          </button>
          <p className="muted">Choices are remembered on this device — reconnect is automatic on your next visit.</p>
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
