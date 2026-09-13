import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { AgentId, SessionInfo } from "./types";

import { FileTailer } from "./tailer";
import type { UsageSource } from "./types";

export function listJsonFiles(dir: string, extensions = [".jsonl", ".json"]): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsonFiles(file, extensions));
    else if (entry.isFile() && extensions.includes(path.extname(file))) files.push(file);
  }
  return files.sort();
}

/** JSONL is tailed; complete JSON documents are reread only when changed.
 * Missing directories are rescanned, so agents can start after the dashboard. */
export function watchJsonFiles(roots: string[], create: (file: string) => (json: any) => void): ReturnType<UsageSource["watch"]> {
  const readers = new Map<string, { process: (json: any) => void; tailer?: FileTailer; signature?: string }>();
  const tick = () => {
    for (const root of roots) {
      try {
        for (const file of listJsonFiles(root)) {
          let reader = readers.get(file);
          if (!reader) {
            reader = { process: create(file), tailer: file.endsWith(".jsonl") ? new FileTailer(file) : undefined };
            readers.set(file, reader);
          }
          try {
            if (reader.tailer) {
              for (const line of reader.tailer.readNewLines()) {
                if (!line.trim()) continue;
                try { reader.process(JSON.parse(line)); } catch { /* incomplete/invalid record */ }
              }
            } else {
              const stat = statSync(file);
              const signature = `${stat.mtimeMs}:${stat.size}`;
              if (signature === reader.signature) continue;
              reader.process(JSON.parse(readFileSync(file, "utf8")));
              reader.signature = signature;
            }
          } catch { /* retry files being replaced or written on the next poll */ }
        }
      } catch { console.warn("[sources] unable to read an agent log directory"); }
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

export function defaultLogRoots(agent: AgentId): string[] {
  if (agent === "claude-code") return [path.join(homedir(), ".claude", "projects")];
  if (agent === "codex") return ["sessions", "archived_sessions"].map((dir) => path.join(homedir(), ".codex", dir));
  return [path.join(homedir(), ".local", "share", "opencode", "storage", "message")];
}

export function emptySession(agent: AgentId, sessionId: string): SessionInfo {
  return { agent, sessionId, title: null, model: null, cwd: null, gitBranch: null,
    tokens: 0, cost: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    cacheWriteTokens: 0, reasoningTokens: 0, timeCreated: null, timeUpdated: null };
}
