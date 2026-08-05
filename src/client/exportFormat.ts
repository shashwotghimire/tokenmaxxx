import type { UsageEvent, SessionInfo } from "./browser/types";

export type ExportFormat = "csv" | "json";
export type ExportDataset = "events" | "sessions";

function csvField(v: unknown): string {
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

export function eventsToCsv(events: UsageEvent[]): string {
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

export function serializeRows(
  rows: UsageEvent[] | SessionInfo[],
  dataset: ExportDataset,
  format: ExportFormat,
): string {
  if (format === "csv") {
    return dataset === "events" ? eventsToCsv(rows as UsageEvent[]) : sessionsToCsv(rows as SessionInfo[]);
  }
  return JSON.stringify(rows, null, 2);
}

export function downloadRows(rows: UsageEvent[] | SessionInfo[], dataset: ExportDataset, format: ExportFormat): void {
  const body = serializeRows(rows, dataset, format);
  const type = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tokenmaxxx-${dataset}-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
