# tokenmaxxx — SPEC

## What this is

A super-minimal, **local-only** web dashboard that shows real-time AI coding
token usage, inspired by the `tokscale` CLI (junhoyeo/tokscale). It reads the
same local log files tokscale reads, computes token/cost stats, and pushes
live updates to a browser tab over WebSocket. No CLI, no TUI — browser only.

## Explicit non-goals (do not build these)

- No auth / no multi-user — single machine, single user, localhost only.
- No GitHub login, leaderboard, "submit", or "wrapped" social features.
- No cloud sync, no external API calls except (optionally) fetching a
  pricing table once at startup — everything must work fully offline with a
  bundled fallback pricing table.
- No packaging/distribution (installers, npx global bin) — just
  `bun install && bun run dev` on the user's own machine.
- No Rust core, no native TUI. Bun + TypeScript only.

## Core user story

User has Claude Code, OpenCode, and/or Codex CLI running in other
terminals. They open `http://localhost:PORT` and see, mirroring tokscale
CLI's own view set (Overview, Models, Daily, Hourly, Stats, Agents):

1. A **live ticker** — tokens used in the current session, updating within
   ~1–2s of a new log entry being written, with a running $ cost estimate.
2. **Overview / today's totals** — input / output / cache-read /
   cache-write / reasoning tokens, and total estimated cost for today.
3. A **per-model breakdown table** — tokens and cost grouped by model
   (Models view).
4. A **per-agent breakdown table** — tokens and cost grouped by source
   agent (Claude Code / OpenCode / Codex) (Agents view).
5. A **daily view** — bar chart / table of totals per day, filterable by
   date range (today / week / since–until), mirroring tokscale's Daily tab.
6. An **hourly view** — totals bucketed by hour for the current/selected
   day, mirroring tokscale's Hourly tab.
7. A **contribution-graph calendar** (GitHub-style heatmap of daily usage)
   — 2D is enough, 3D is not required.
8. A **stats view** — the underlying numeric summary tokscale's Stats tab
   shows: totals, streaks (consecutive days with usage), busiest day,
   busiest hour, top model, top agent.

All views read from the same underlying per-event data — build the
aggregator so any of the above is a query/grouping over one event table,
not separate hand-maintained rollups per view.

Stretch (only after all of the above works end-to-end):

- Additional agents beyond the three above (Gemini CLI, etc.) —
  the source interface should already make this close to free.
  Note: Cursor and Antigravity were investigated (Aug 2026) and **skipped**
  — neither exposes local token-usage data. Cursor's agent transcripts
  (`~/.cursor/projects/*/agent-transcripts/**/*.jsonl`) carry only
  user/assistant text with no model/timestamp/tokens fields, its
  `ai-code-tracking.db` records no AI-edit rows, and Antigravity's
  `~/.gemini/antigravity-cli/` has no recorded conversations. Revisit if a
  source for their usage appears.
- Dark/light theme toggle.
- Minutely view (tokscale has this as an opt-in extra).

## Data sources (v1 scope: Claude Code + OpenCode + Codex, all three from day one)

Build one `UsageSource` implementation per agent behind a shared interface
(`interface UsageSource { id: string; watch(onEvent): void }`) so the
aggregator/API/UI never special-case a specific agent — every event carries
an `agent` field and everything downstream just groups by it.

For each source, **inspect a real sample on the dev machine before writing
its parser** — do not assume the schema, confirm field names against an
actual file/row first. Known starting points to check:

- **Claude Code**: JSONL session logs, typically under
  `~/.claude/projects/**/*.jsonl`. Each relevant line has a model name and
  a `usage` object (input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens).
- **OpenCode**: SQLite at `~/.local/share/opencode/opencode.db` (covers
  opencode + opencode-stable + other channels), or fall back to the legacy
  JSON message files under `~/.local/share/opencode/storage/message/` if
  the db isn't present. Confirm which one exists on the dev machine first.
- **Codex CLI**: path and format not yet confirmed — locate Codex's local
  session/log directory on the dev machine (check `~/.codex/` first) and
  inspect a real session file before implementing its parser. If no local
  Codex data exists yet on the dev machine, stub the source behind the
  same interface and implement it once a sample is available — don't block
  Claude Code / OpenCode on it.

Every parsed event, regardless of source, must normalize to one shape:
`{ agent, model, timestamp, inputTokens, outputTokens, cacheWriteTokens,
cacheReadTokens, reasoningTokens }` (use `0` for fields a given agent
doesn't report) so the aggregator stays source-agnostic.

## Pricing

Bundle a small static JSON pricing table (`pricing.json`) keyed by model
name with `{ input, output, cacheWrite, cacheRead }` USD-per-token (or
per-million-tokens, pick one unit and document it). No live pricing fetch
required for v1 — hardcode current known prices for the models actually
seen in the user's logs, plus a sane fallback/default entry.

## Architecture (minimal)

- **Bun** as runtime, dev server, and bundler (`Bun.serve`, native
  WebSocket support, `bun:sqlite`).
- **Backend**: watches the log directory (`fs.watch`, recursive), parses
  new lines as they're appended, updates an in-memory aggregate + persists
  to a local SQLite file (`bun:sqlite`) so history survives a restart.
  Broadcasts each new usage event to connected WebSocket clients.
- **REST API** (small, read-only):
  - `GET /api/summary` — today's totals + running session totals
  - `GET /api/daily?days=7` — per-day totals for the chart
  - `GET /api/models` — per-model breakdown
- **WebSocket** `/ws` — pushes `{ type: "usage", event }` on every new
  parsed log line, and a small heartbeat/reconnect handled client-side.
- **Frontend**: React (via Bun's built-in JSX/TSX + `Bun.serve` HTML
  imports — no separate Vite/webpack setup needed). One page, a handful of
  components, a `useWebSocket` hook. Plain CSS, no UI framework — keep the
  bundle small.

## Non-functional requirements

- `bun install && bun run dev` must be the entire setup.
- Works with zero configuration if the default log path exists; otherwise
  prints a clear error naming the expected path.
- Dashboard reflects a new log line within ~1–2 seconds, no manual refresh.
- Survives the watched log file not existing yet (waits / retries) and
  survives malformed lines (skip + log a warning, don't crash).

## Acceptance test (how to know it's done)

1. Start the app pointed at real (or seeded/mock) log locations for all
   three agents.
2. Append a new well-formed usage entry to one agent's log at a time
   (Claude Code, then OpenCode, then Codex).
3. For each, confirm the browser dashboard updates the live ticker,
   overview totals, model table, agent table, and (if the day/hour bucket
   changes) the daily/hourly views and contribution graph — without a page
   refresh — within ~2 seconds.
4. Confirm the agent breakdown table correctly attributes each event to
   the right agent, and the stats view's totals match the sum across
   agents.
5. Restart the server; confirm totals are unchanged (loaded from SQLite),
   not reset to zero.
