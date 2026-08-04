# tokenmaxxx — BUILD PLAN

Build against `SPEC.md` in this same folder. Work phase by phase, in order.
Do not skip ahead to stretch goals before the core loop (log line → parsed
→ aggregated → pushed over WebSocket → rendered) works end-to-end.

## Phase 0 — Setup

- `bun init` a TypeScript project.
- Folder structure:
  ```
  /src
    /server
      index.ts        # Bun.serve entry, REST + WebSocket + static serving
      sources/
        types.ts       # UsageSource interface, normalized UsageEvent type
        claudeCode.ts  # UsageSource implementation for Claude Code logs
        opencode.ts    # UsageSource implementation for OpenCode (sqlite or json)
        codex.ts       # UsageSource implementation for Codex CLI
      aggregator.ts    # in-memory + sqlite-backed totals, grouped queries
      db.ts            # bun:sqlite setup/schema (single usage_events table)
      pricing.ts        # loads pricing.json, cost calculator
    /client
      App.tsx
      components/
        LiveTicker.tsx
        OverviewTotals.tsx
        ModelTable.tsx
        AgentTable.tsx
        DailyView.tsx
        HourlyView.tsx
        ContributionGraph.tsx
        StatsView.tsx
      hooks/
        useWebSocket.ts
      styles.css
  pricing.json
  SPEC.md
  PLAN.md
  README.md
  ```
- `package.json` scripts: `dev` (bun run with watch), `start`, `test`.

## Phase 1 — Inspect real data before writing any parser

For each of the three agents, locate real local data on the dev machine
and write down the exact shape before coding against it:

- **Claude Code**: JSONL under `~/.claude/projects/**/*.jsonl` — confirm
  the model name field, `usage` object field names, timestamp field, and
  which lines are usage-bearing vs. not.
- **OpenCode**: check whether `~/.local/share/opencode/opencode.db`
  (SQLite) exists; if so inspect its schema (table/column names for
  messages + token usage). If it doesn't exist, fall back to inspecting
  `~/.local/share/opencode/storage/message/*.json`.
- **Codex CLI**: check `~/.codex/` for session/log files and inspect a
  real one. If nothing exists locally yet, note that and proceed with
  Claude Code + OpenCode first — implement `codex.ts` as a stub that
  satisfies the `UsageSource` interface but is a no-op, and come back to
  it once a real sample is available (don't guess the schema).
  Do not guess any of these schemas from memory or from tokscale's own
  source without checking — confirm against real local data first.

## Phase 2 — Shared types + normalized event shape

- `types.ts`: `UsageSource` interface (`id: string; watch(onEvent): void`)
  and the normalized `UsageEvent` type: `{ agent, model, timestamp,
inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens,
reasoningTokens }`.
- Every source's parser must map its native fields onto this one shape
  (missing fields → `0`), so nothing downstream needs to know which agent
  an event came from except via the `agent` string.

## Phase 3 — Parsers (one per agent)

- `claudeCode.ts`: reads existing file(s) fully once at startup
  (backfill), then `fs.watch`es for appended lines, parsing only new bytes
  (track file offset per file).
- `opencode.ts`: either polls/watches the sqlite db for new rows (track
  last-seen rowid/timestamp) or watches the message JSON directory for new
  files, depending on what Phase 1 found.
- `codex.ts`: implement once a real sample is confirmed; until then, a
  stub that registers but emits nothing (so the rest of the app runs
  correctly with 0–3 active sources).
- Unit tests (`bun test`) per parser against real sample lines/rows
  (well-formed, malformed, non-usage entries).

## Phase 4 — Pricing + cost calculator

- `pricing.json`: static map of model name → per-token rates for
  input/output/cacheWrite/cacheRead, plus a `default` fallback entry.
- `pricing.ts`: `costForEvent(event): number` using the table above.
- Unit test the calculator against a couple of hand-computed examples.

## Phase 5 — Aggregator + persistence

- `db.ts`: `bun:sqlite` schema — a single `usage_events` table (agent,
  model, timestamp, input_tokens, output_tokens, cache_write_tokens,
  cache_read_tokens, reasoning_tokens, cost) is enough; derive every view
  (overview / per-model / per-agent / per-day / per-hour / contribution
  graph / stats) with SQL queries and `GROUP BY` rather than maintaining
  separate hand-written rollups per view.
- `aggregator.ts`: on each new `UsageEvent`, compute cost, insert into
  sqlite, and expose query functions used by both the REST API and the
  WebSocket broadcast payload: `getSummary()`, `getDaily(days)`,
  `getHourly(date)`, `getModelBreakdown()`, `getAgentBreakdown()`,
  `getContributionGraph(days)`, `getStats()` (streaks, busiest day/hour,
  top model, top agent).

## Phase 6 — Server: REST + WebSocket

- `Bun.serve` with:
  - `GET /api/summary`, `/api/daily`, `/api/hourly`, `/api/models`,
    `/api/agents`, `/api/contributions`, `/api/stats` → JSON from the
    matching aggregator query function. Support `?agent=` and date-range
    query params (`?days=`, `?since=&until=`) consistently across the
    endpoints that make sense for.
  - `GET /ws` upgraded to WebSocket; on connect, wire every active
    source's `watch()` callback to
    `ws.send(JSON.stringify({ type: "usage", event }))` for every new
    event (tagged with its `agent`); maintain a simple client set for
    broadcast.
  - Serve the built client (or use Bun's HTML import dev-serving) at `/`.
- Wire all three `sources/*.ts` → `aggregator.ts` → broadcast on startup;
  a source with no local data (e.g. Codex before Phase 1 confirms its
  schema) should simply contribute nothing, not break startup.

## Phase 7 — Frontend

- `useWebSocket` hook: connects to `/ws`, exposes latest event + a
  reconnect-with-backoff on close.
- `LiveTicker`: shows running session token count + $ cost, animates on
  each new event (simple, no animation library).
- `OverviewTotals`: fetches `/api/summary`, updates in place as new
  WebSocket events arrive.
- `ModelTable`: fetches `/api/models`, re-fetches (or patches locally) on
  new events.
- `AgentTable`: fetches `/api/agents` — same pattern, grouped by agent
  instead of model.
- `DailyView`: fetches `/api/daily`, bar chart + date-range filter
  (today/week/since–until) per SPEC.md.
- `HourlyView`: fetches `/api/hourly` for the selected day.
- `ContributionGraph`: fetches `/api/contributions`, renders a GitHub-style
  heatmap (plain SVG grid, color-scaled by daily total — no library).
- `StatsView`: fetches `/api/stats`, renders the numeric summary (streaks,
  busiest day/hour, top model, top agent).
- Simple tab/view switcher across the above (Overview/Models/Agents/
  Daily/Hourly/Stats), mirroring tokscale's own tab set.
- Plain CSS, single stylesheet, no UI framework, no charting library.

## Phase 8 — Polish

- README.md: what this is, `bun install && bun run dev`, expected log
  paths for all three agents, how to point any of them at a non-default
  path if needed (env vars — keep it to one knob per agent).
- Handle per source: log/db location missing (clear startup message
  naming which agent and which path, app still runs with the others),
  malformed entry (skip + console.warn, don't crash), WebSocket
  disconnect/reconnect in the UI (show a small "reconnecting…" state,
  don't just go blank).

## Phase 9 — Verify against SPEC.md's acceptance test

- Run the 4-step acceptance test in SPEC.md exactly as written before
  calling this done. If any step fails, fix it before moving to any
  stretch goal.

## After core is done (optional, only if asked for)

- Add further `UsageSource`s beyond Claude Code/OpenCode/Codex (e.g.
  Gemini CLI) — should be low-effort given the shared interface.
  Cursor and Antigravity were investigated (Aug 2026) and skipped: no
  local token-usage data exists for either on the dev machine (Cursor
  transcripts carry no model/timestamp/tokens; Antigravity CLI has no
  recorded conversations).
- Theme toggle.
- Opt-in minutely view.
