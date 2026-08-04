# tokenmaxxx

A super-minimal, **local-only** web dashboard for real-time AI coding token
usage across Claude Code, OpenCode, and Codex CLI. Inspired by the
[`tokscale`](https://github.com/junhoyeo/tokscale) CLI — but browser only,
no CLI, no TUI, no accounts, no cloud.

## Setup

```sh
bun install
bun run dev
```

Then open `http://localhost:3000` — a landing page that links to the live
dashboard at `/dashboard`. That's it — no configuration needed if your agents
log to their default locations.

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

(Docker Desktop converts the Windows paths to the VM automatically; WSL2
users can just run the bash version.)

Mount your agent logs read-only at their container paths (`/root/.claude`,
`/root/.local/share/opencode/opencode.db`, `/root/.codex`) or point the sources
at them with `TOKENMAXXX_CLAUDE_PATH`, `TOKENMAXXX_OPENCODE_DB`,
`TOKENMAXXX_CODEX_DB`. The SQLite database persists in `/data`.

## Browser mode (no server data)

When the site has no server-side data (e.g. a hosted deployment), visitors can
click **Connect logs** on the dashboard and select their own agent logs:
Claude Code's `~/.claude/projects` folder, `opencode.db`, or `state_*.sqlite`.
Everything is parsed **in the browser** with `sql.js` — nothing is uploaded.
Note this only works in browsers with the File System Access API or file
picker support, and the one-click permission is per session.

## What it shows

- **Live ticker** — session token + cost totals, updated within ~1–2s of a
  new log line.
- **Overview** — today's input / output / cache-read / cache-write /
  reasoning tokens and cost, plus a GitHub-style contribution heatmap.
- **Models** — token & cost breakdown per model.
- **Agents** — token & cost breakdown per agent (Claude Code / OpenCode /
  Codex).
- **Daily** — per-day totals with today / week / 30-day / custom date-range
  filters.
- **Hourly** — per-hour totals for a selected day.
- **Stats** — totals, streaks, busiest day/hour, top model, top agent.

## Expected log paths (all optional)

| Agent       | Default path                                             | Env var to override          |
| ----------- | -------------------------------------------------------- | ---------------------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`                          | `TOKENMAXXX_CLAUDE_PATH`     |
| OpenCode    | `~/.local/share/opencode/opencode.db` (SQLite)           | `TOKENMAXXX_OPENCODE_DB`     |
| Codex CLI   | `~/.codex/state_*.sqlite` (SQLite, `threads` table)      | `TOKENMAXXX_CODEX_DB`        |

Any source whose files are missing is skipped with a warning naming the
expected path; the others keep working. The app also runs with **zero**
sources present (seeded/mock data can be added by pointing an env var at a
file you control).

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

- Codex reports only a per-thread total token count (no input/output
  split), so its events are attributed as input tokens.
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
