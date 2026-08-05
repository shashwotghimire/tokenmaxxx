import type { SessionInfo, UsageEvent } from "./sources/types";

export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

function iso(ts: number | null): string {
  if (!ts) return "";
  return new Date(ts).toISOString();
}

export function eventsToCsv(events: (UsageEvent & { cost: number })[]): string {
  return toCsv(
    [
      "agent",
      "model",
      "timestamp",
      "inputTokens",
      "outputTokens",
      "cacheWriteTokens",
      "cacheReadTokens",
      "reasoningTokens",
      "cost",
    ],
    events.map((e) => [
      e.agent,
      e.model,
      iso(e.timestamp),
      e.inputTokens,
      e.outputTokens,
      e.cacheWriteTokens,
      e.cacheReadTokens,
      e.reasoningTokens,
      e.cost,
    ]),
  );
}

export function sessionsToCsv(sessions: SessionInfo[]): string {
  return toCsv(
    [
      "agent",
      "sessionId",
      "title",
      "model",
      "cwd",
      "gitBranch",
      "tokens",
      "cost",
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "reasoningTokens",
      "timeCreated",
      "timeUpdated",
    ],
    sessions.map((s) => [
      s.agent,
      s.sessionId,
      s.title,
      s.model,
      s.cwd,
      s.gitBranch,
      s.tokens,
      s.cost,
      s.inputTokens,
      s.outputTokens,
      s.cacheReadTokens,
      s.cacheWriteTokens,
      s.reasoningTokens,
      iso(s.timeCreated),
      iso(s.timeUpdated),
    ]),
  );
}
