# tokenmaxxx

A compact, **local-first** web dashboard for real-time AI coding token
usage across Claude Code, OpenCode, and Codex CLI. Inspired by the
[`tokscale`](https://github.com/junhoyeo/tokscale) CLI — with a browser dashboard and a local log watcher.
No accounts or cloud sync.

## Setup

```sh
bun install
bun run dev
```

Then open `http://localhost:3000` — the dashboard opens directly. That's it —
no configuration is needed if your agents log to their default locations.

## Self-hosting (Docker)

Prebuilt images are published to GHCR. Each release is tagged (e.g. `v1.0.0`)
and `latest` tracks `main`:

**macOS / Linux (bash):**

```sh
docker run -d --name tokenmaxxx -p 3000:3000 \
  -v "$HOME/.claude:/root/.claude:ro" \
  -v "$HOME/.local/share/opencode:/root/.local/share/opencode:ro" \
  -v "$HOME/.codex:/root/.codex:ro" \
  -v tokenmaxxx-data:/data \
  ghcr.io/shashwotghimire/tokenmaxxx:latest
```

**Windows · PowerShell:**

```powershell
docker run -d --name tokenmaxxx -p 3000:3000 `
  -v "$HOME\.claude:/root/.claude:ro" `
  -v "$HOME\.local\share\opencode:/root/.local/share/opencode:ro" `
  -v "$HOME\.codex:/root/.codex:ro" `
  -v tokenmaxxx-data:/data `
  ghcr.io/shashwotghimire/tokenmaxxx:latest
```

**Windows · cmd (single line):**

```sh
docker run -d --name tokenmaxxx -p 3000:3000 -v %USERPROFILE%\.claude:/root/.claude:ro -v %USERPROFILE%\.local\share\opencode:/root/.local/share/opencode:ro -v %USERPROFILE%\.codex:/root/.codex:ro -v tokenmaxxx-data:/data ghcr.io/shashwotghimire/tokenmaxxx:latest
```

Open `http://localhost:3000` after the container starts. Docker deployments go
straight to the dashboard; the separate hosted site serves the landing page only.

(Docker Desktop converts the Windows paths to the VM automatically; WSL2
users can just run the bash version.)

The container automatically discovers JSON/JSONL logs in the mounted default
agent directories. Mount folders read-only as shown above. There is no file
picker, upload flow, custom source-path setting, or agent database reader.
tokenmaxxx's own aggregate database persists in `/data`.

## What it shows

- **Sound alerts** — opt-in, in-browser annoyance: beep and/or voice-announce
  ("Claude Code just spent 7 dollars and 50 cents") whenever a single usage
  event crosses a cost threshold. Configurable threshold, beep/voice/both,
  repeat count, test button, and a snooze. Settings persist in
  `localStorage`.
- **Live ticker** — token + cost increases since opening the dashboard, updated
  as new log records arrive. Revised responses contribute only their increase.
- **Overview** — today's input / output / cache-read / cache-write /
  reasoning tokens and cost, plus a GitHub-style contribution heatmap.
- **Models** — token & cost breakdown per model.
- **Agents** — token & cost breakdown per agent (Claude Code / OpenCode /
  Codex).
- **Sessions** — per-session metadata + token/cost totals across all agents.
- **Skills** — every skill installed on this machine (`<project>/.agents/skills`
  and `<project>/.claude/skills`, plus global `~/.claude/skills`), with each
  skill's file count, reference-file count, and an estimated context-injection
  weight (bytes / 4) so you can spot the skills that quietly burn tokens every
  time they load. Scans `$HOME` by default; override with
  `TOKENMAXXX_SKILLS_ROOT` (results cached for 60s).
- **Daily** — per-day totals with today / week / 30-day / custom date-range
  filters.
- **Hourly** — per-hour totals for a selected day.
- **Stats** — totals, streaks, busiest day/hour, top model, top agent.
- **Export** — download usage events or sessions as CSV/JSON (all time,
  today, last 7/30 days, per agent) for pivoting in Excel or Notion.
- **Spend & cache** — project/working-directory attribution, period-over-period
  comparisons, browser-stored budgets, cache hit rate, and measurable hotspots.
- **Session explorer** — model changes, token categories, timeline, and expensive
  events when the source exposes stable per-event/session identifiers.
- **Data quality** — partial measurements, unknown pricing, missing models, and
  duplicate-resistant records are visible rather than silently treated as zero.
- **Unified filters** — period, timezone, agent, model, and project apply across
  applicable views. Saved views omit project values from their shareable URL state.
- **Privacy mode** — obscures titles and paths for screenshots. Session exports
  always sanitize titles, redact credentials, and reduce paths to project labels.

## Metric definitions and limitations

- All date ranges are half-open (`since <= timestamp < until`) and evaluated in
  the selected IANA timezone. An end date selected in the UI is inclusive; the
  API converts it to the following local midnight. A DST day may be 23 or 25
  hours, and Asia/Kathmandu uses its +05:45 boundary.
- **Total tokens = uncached input + cache read + cache write + visible output +
  reasoning.** Categories are normalized to avoid overlap. Cached context is
  real processed usage, so large cache-read totals do not by themselves mean a bug.
- Claude responses are keyed by API message ID and request ID, not the UUID of
  each content-block log line. Repeated snapshots count once; growing usage
  replaces the earlier snapshot. Per-step output accuracy depends on what the
  installed Claude version records in its JSONL logs.
- Codex JSONL `token_count.info.total_token_usage` values are cumulative.
  Only increases are counted. Cached input is subtracted from input, and
  reasoning is subtracted from output before being displayed separately.
  Repeated snapshots and server restarts do not add usage again. Counter resets
  establish a new baseline; usage across a reset cannot be reconstructed exactly.
  Quota-only/context-window events are not counted as measured token usage.
- OpenCode JSON message categories are already disjoint. `tokens.total` is
  optional and is never added to its component categories. Changes to a message
  replace its earlier usage snapshot instead of adding a second request.
- Costs are USD API-equivalent estimates from the versioned bundled table in
  `pricing.json`, not recorded invoices. Unknown models remain **unpriced**;
  only an explicitly verified zero rate is shown as free.
- Cache hit rate is `cache read / (input + cache read)` when both measurements
  are meaningful. Estimated savings remains unavailable unless an uncached
  comparison can be supported without inventing rates.
- Forecast headline and per-agent rows are independently fitted comparisons and
  are not additive. The UI exposes history size, assumptions, incomplete/low-
  confidence states, and does not claim backtest accuracy without held-out data.
- “Live” means default JSON log folders are polled and new detectable records
  are pushed while the server and browser are running. Missing folders are
  rescanned, including when an agent starts after tokenmaxxx.

## Budgets and alerts

Daily allowance settings and alert-deduplication keys live in the current
browser. They are advisory API-equivalent estimates. Notifications/sounds require
an explicit browser permission or interaction, run only while the page is active,
and have no guaranteed background delivery.

## Automatically discovered JSON logs

| Agent | Default paths |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex CLI | `~/.codex/sessions/**/*.jsonl`, `~/.codex/archived_sessions/**/*.jsonl` |
| OpenCode | `~/.local/share/opencode/storage/message/**/*.json` (usage), `storage/session/**/*.json` (metadata) |

Only JSON/JSONL files are read. SQLite agent databases are never imported.
OpenCode versions that keep usage only in SQLite have no compatible JSON usage
source; their usage will not appear. Other agents continue working normally.
Run tokenmaxxx on the machine where the agents write these files; the hosted
landing page cannot inspect files on your computer.

## Upgrading token accounting

On first startup after this change, the previous derived events and sessions are
preserved in `usage_events_before_json_accounting` and
`sessions_before_json_accounting` inside tokenmaxxx's own database. Active totals
are rebuilt from automatically discovered JSON logs. This avoids mixing older
UUID-counted Claude rows or cumulative SQLite thread totals with corrected events.
The migration is transactional and runs once. Original agent files are untouched.
History whose JSON logs are no longer present remains in the archive tables,
not in the new dashboard totals. Database-only OpenCode history is also archived.

## How it works

Each agent is a `UsageSource` (`src/server/sources/*.ts`) behind one shared
interface. Sources parse their native format into a normalized
`UsageEvent` (`{ agent, model, timestamp, inputTokens, outputTokens,
cacheWriteTokens, cacheReadTokens, reasoningTokens }`) — missing fields are
`0`. Events flow into a `bun:sqlite` database (single `usage_events` table)
and are broadcast over WebSocket to every connected browser tab. All views
are SQL `GROUP BY` queries over that one table.

- Server: `src/server/index.ts` — REST API + `/ws` WebSocket + static client
- Aggregator: `src/server/aggregator.ts` — query functions
- Pricing: `pricing.json` (USD per 1M tokens) + `src/server/pricing.ts`
- Client: React in `src/client/` — plain CSS, no UI/chart library

## Notes

- History is persisted in `~/.local/share/tokenmaxxx/usage.db` and
  survives restarts (re-backfilled events are deduplicated). Override with
  `TOKENMAXXX_DB_PATH`. On first run after a rename, an existing
  `~/.local/share/tokscale-web/usage.db` is copied over automatically.
- Server port: `PORT` (default `3000`).

## Commands

- `bun run dev` — development server with hot reload
- `bun run start` — production server
- `bun test` — unit tests
- `bun run build` — build static client to `dist/`

## Non-goals

No auth, no multi-user, no cloud sync, no packaging/distribution. Single
machine, single user, localhost only.
