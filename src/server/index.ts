import { serve } from "bun";
import type { ServerWebSocket } from "bun";
import index from "../client/index.html";
import landing from "../client/landing.html";
import path from "node:path";
import { createClaudeCodeSource } from "./sources/claudeCode";
import { createOpencodeSource } from "./sources/opencode";
import { createCodexSource } from "./sources/codex";
import type { UsageEvent, UsageSource, SessionInfo } from "./sources/types";
import { getSummary,
  getDaily,
  getHourly,
  getModelBreakdown,
  getAgentBreakdown,
  getContributionGraph,
  getStats,
  getSessions,
  getAllEvents,
  handleEvent,
  handleSession,
  parseQueryDate,
} from "./aggregator";
import { eventsToCsv, sessionsToCsv } from "./export";
import { buildForecast } from "./forecast";
import { getSkills } from "./skills";
import { AGENTS } from "./sources/types";
import { getCacheAnalytics, getComparison, getDiagnostics, getProjects, getProjectTrends, getSessionDetail } from "./insights";
import { pricingMetadata } from "./pricing";
import { redactPath, sanitizeTitle } from "../shared/privacy";
import { dayRange, validTimeZone } from "../shared/time";
import { defaultLogRoots, listJsonFiles } from "./sources/jsonFiles";
import { selectRootRoute } from "./app-mode";

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const DIST = path.join(import.meta.dir, "..", "..", "dist");
const onRender = process.env.RENDER_SERVICE_ID !== undefined;
const dashboardEnabled =
  process.env.ENABLE_DASHBOARD === "true" || (process.env.ENABLE_DASHBOARD !== "false" && !onRender);

function htmlResponse(file: string): Response {
  return new Response(Bun.file(path.join(DIST, file)), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function serveStatic(p: string): Promise<Response | null> {
  const base = path.basename(p);
  if (!/^chunk-[A-Za-z0-9_-]+\.(css|js|js\.map)$/.test(base)) return null;
  const file = Bun.file(path.join(DIST, base));
  if (!(await file.exists())) return null;
  const type = base.endsWith(".js.map") ? "application/json" : base.endsWith(".js") ? "text/javascript" : "text/css";
  return new Response(file, { headers: { "content-type": type } });
}

const clients = new Set<ServerWebSocket>();

function broadcast(payload: object) {
  const json = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

interface QueryOpts {
  agent?: string;
  since?: number;
  until?: number;
  days?: number;
  horizon?: number;
  model?: string;
  project?: string;
  timeZone?: string;
  date?: string;
  sessionId?: string;
  scenario?: "baseline" | "workdays" | "quiet" | "busy";
}

function queryOpts(url: URL): QueryOpts {
  const agent = url.searchParams.get("agent") ?? undefined;
  const timeZone = validTimeZone(url.searchParams.get("tz"));
  const sinceRaw = url.searchParams.get("since") ?? "";
  const untilRaw = url.searchParams.get("until") ?? "";
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? dayRange(sinceRaw, timeZone)?.since : parseQueryDate(sinceRaw);
  const until = /^\d{4}-\d{2}-\d{2}$/.test(untilRaw) ? dayRange(untilRaw, timeZone)?.until : parseQueryDate(untilRaw);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number(daysRaw) : undefined;
  const horizonRaw = url.searchParams.get("horizon");
  const horizon = horizonRaw ? Number(horizonRaw) : undefined;
  return { agent, since, until, days, horizon, model: url.searchParams.get("model") ?? undefined,
    project: url.searchParams.get("project") ?? undefined, timeZone,
    date: url.searchParams.get("date") ?? undefined, sessionId: url.searchParams.get("sessionId") ?? undefined,
    scenario: (["baseline","workdays","quiet","busy"].includes(url.searchParams.get("scenario") ?? "") ? url.searchParams.get("scenario") : "baseline") as QueryOpts["scenario"] };
}

function api(handler: (opts: QueryOpts) => unknown) {
  return (req: Request) => {
    if (!dashboardEnabled) return new Response("Not found", { status: 404 });
    try {
      return Response.json(handler(queryOpts(new URL(req.url))));
    } catch (e) {
      console.error(e);
      return Response.json({ error: String(e) }, { status: 500 });
    }
  };
}

function handleExport(req: Request, kind: "events" | "sessions"): Response {
  if (!dashboardEnabled) return new Response("Not found", { status: 404 });
  try {
    const url = new URL(req.url);
    const opts = queryOpts(url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(Number(limitRaw) || 100_000, 1_000_000)) : undefined;
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

    let body: string;
    let type: string;
    if (kind === "events") {
      const events = getAllEvents({ ...opts, limit });
      if (format === "csv") {
        body = eventsToCsv(events);
        type = "text/csv";
      } else {
        body = JSON.stringify(events, null, 2);
        type = "application/json";
      }
    } else {
      const sessions = getSessions({ ...opts, limit });
      if (format === "csv") {
        body = sessionsToCsv(sessions);
        type = "text/csv";
      } else {
        body = JSON.stringify(sessions.map((s) => ({ ...s, title: sanitizeTitle(s.title), cwd: redactPath(s.cwd) })), null, 2);
        type = "application/json";
      }
    }
    const file = kind === "events" ? "tokenmaxxx-events" : "tokenmaxxx-sessions";
    return new Response(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="${file}.${format}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

const sources: UsageSource[] = dashboardEnabled ? [createClaudeCodeSource(), createOpencodeSource(), createCodexSource()] : [];
const processStartedAt = Date.now();

const landingRoute = PROD ? () => htmlResponse("landing.html") : landing;
const dashboardRoute = dashboardEnabled
  ? PROD
    ? () => htmlResponse("index.html")
    : index
  : () => new Response(null, { status: 302, headers: { location: "/" } });
const rootRoute = selectRootRoute(dashboardEnabled, {
  landing: landingRoute,
  dashboard: dashboardRoute,
});

const server = serve({
  routes: {
    "/": rootRoute,

    "/dashboard": dashboardRoute,

    "/api/summary": {
      GET: api((opts) => getSummary(opts)),
    },

    "/api/daily": {
      GET: api((opts) => getDaily(opts)),
    },

    "/api/hourly": {
      GET: api((opts) => getHourly(opts)),
    },

    "/api/models": {
      GET: api((opts) => getModelBreakdown(opts)),
    },

    "/api/agents": {
      GET: api((opts) => getAgentBreakdown(opts)),
    },

    "/api/contributions": {
      GET: api((opts) => getContributionGraph(opts)),
    },

    "/api/stats": {
      GET: api((opts) => getStats(opts)),
    },
    "/api/projects": { GET: api((opts) => getProjects(opts)) },
    "/api/project-trends": { GET: api((opts) => getProjectTrends(opts)) },
    "/api/cache": { GET: api((opts) => getCacheAnalytics(opts)) },
    "/api/comparison": { GET: api((opts) => getComparison(opts)) },
    "/api/diagnostics": { GET: api(() => getDiagnostics()) },
    "/api/pricing": { GET: api(() => pricingMetadata()) },
    "/api/source-status": { GET: api(() => ({ origin: "server machine", mode: "server-watch", processStartedAt, lastRefresh: Date.now(), health: "running", sources: sources.map((s) => {
      try { const files = defaultLogRoots(s.id).reduce((n, root) => n + listJsonFiles(root).length, 0); return { id: s.id, files, state: files ? "watching JSON logs" : "no JSON logs found" }; }
      catch { return { id: s.id, files: 0, state: "unable to read JSON logs" }; }
    }), liveGuarantee: "New detectable records are pushed while server and browser are connected; field completeness depends on provider logs." })) },
    "/api/session-detail": { GET: api((opts) => opts.agent && opts.sessionId ? getSessionDetail(opts.agent, opts.sessionId) : null) },

    "/api/sessions": {
      GET: api((opts) => getSessions(opts)),
    },

    "/api/forecast": {
      GET: api((opts) => {
        const overall = buildForecast({ agent: opts.agent, horizon: opts.horizon, scenario: opts.scenario, timeZone: opts.timeZone });
        const agents: Record<string, ReturnType<typeof buildForecast>> = {};
        for (const id of Object.values(AGENTS)) {
          agents[id] = buildForecast({ agent: id, horizon: opts.horizon, scenario: opts.scenario, timeZone: opts.timeZone });
        }
        return { asOf: Date.now(), overall, agents };
      }),
    },

    "/api/skills": {
      GET: () => {
        if (!dashboardEnabled) return new Response("Not found", { status: 404 });
        return getSkills()
          .then((s) => Response.json(s))
          .catch((e) => {
            console.error(e);
            return Response.json({ error: String(e) }, { status: 500 });
          });
      },
    },

    "/api/export/events": {
      GET: (req) => handleExport(req, "events"),
    },

    "/api/export/sessions": {
      GET: (req) => handleExport(req, "sessions"),
    },
  },

  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) {
        return new Response(null, { status: 204 });
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (PROD && url.pathname.startsWith("/chunk-")) {
      return (await serveStatic(url.pathname)) ?? new Response("Not found", { status: 404 });
    }
    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    message() {
      // Server only pushes usage events; client messages are ignored.
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`tokenmaxxx running at ${server.url}`);
console.log(`  API: ${server.url}api/summary  |  WS: ws://localhost:${PORT}/ws`);
console.log(`Dashboard: ${dashboardEnabled ? "enabled" : "disabled (landing only)"}`);
if (dashboardEnabled) console.log(`Watching sources: ${sources.map((s) => s.id).join(", ")}`);

for (const source of sources) {
  source.watch(
    (event) => {
      const stored = handleEvent(event);
      if (stored.changed) broadcast({ type: "usage", event: stored.delta ?? stored });
    },
    (session: SessionInfo) => {
      handleSession(session);
      broadcast({ type: "session", session });
    }
  );
}
