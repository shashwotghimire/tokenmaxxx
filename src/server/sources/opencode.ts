import path from "node:path";
import { normalizeModel } from "../../shared/models";
import { projectLabel } from "../../shared/privacy";
import { watchJsonFiles, defaultLogRoots, emptySession } from "./jsonFiles";
import type { UsageEvent, UsageSource } from "./types";

const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** OpenCode's persisted categories are already disjoint: output excludes
 * reasoning and input excludes cache. tokens.total is optional, not additive. */
export function parseMessageData(raw: string): UsageEvent | null {
  let data: any;
  try { data = JSON.parse(raw); } catch { return null; }
  if (data.role !== "assistant" || !data.tokens || !Number.isFinite(data.time?.created)) return null;
  const tokens = data.tokens;
  const normalized = normalizeModel(data.modelID);
  const event: UsageEvent = {
    agent: "opencode", model: normalized.model, rawModel: normalized.rawModel,
    timestamp: data.time.created,
    inputTokens: count(tokens.input), outputTokens: count(tokens.output),
    cacheWriteTokens: count(tokens.cache?.write), cacheReadTokens: count(tokens.cache?.read),
    reasoningTokens: count(tokens.reasoning),
    sourceEventId: data.id ? String(data.id) : undefined,
    sessionId: data.sessionID ? String(data.sessionID) : undefined,
    project: data.path?.cwd ? projectLabel(data.path.cwd) : undefined,
  };
  return event.inputTokens + event.outputTokens + event.cacheWriteTokens + event.cacheReadTokens + event.reasoningTokens > 0 ? event : null;
}

export function createOpencodeSource(): UsageSource {
  return {
    id: "opencode",
    watch(onEvent, onSession) {
      const root = defaultLogRoots("opencode")[0]!;
      return watchJsonFiles([root, path.join(root, "..", "session")], (file) => (json) => {
        if (json.id && json.title && !json.role && onSession) {
          onSession({ ...emptySession("opencode", String(json.id)), title: String(json.title),
            cwd: json.directory ?? null, timeCreated: json.time?.created ?? null, timeUpdated: json.time?.updated ?? null });
        }
        const event = parseMessageData(JSON.stringify(json));
        if (event) onEvent({ ...event, sourceEventId: event.sourceEventId ?? path.basename(file, ".json"), sessionId: event.sessionId ?? path.basename(path.dirname(file)) });
      });
    },
  };
}
