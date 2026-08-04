import { serve } from "bun";
import type { ServerWebSocket } from "bun";
import index from "../client/index.html";
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
  handleEvent,
  handleSession,
  parseQueryDate,
} from "./aggregator";
import { buildForecast } from "./forecast";
import { AGENTS } from "./sources/types";

const PORT = Number(process.env.PORT || 3000);

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
}

function queryOpts(url: URL): QueryOpts {
  const agent = url.searchParams.get("agent") ?? undefined;
  const since = parseQueryDate(url.searchParams.get("since") ?? "");
  const until = parseQueryDate(url.searchParams.get("until") ?? "");
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number(daysRaw) : undefined;
  const horizonRaw = url.searchParams.get("horizon");
  const horizon = horizonRaw ? Number(horizonRaw) : undefined;
  return { agent, since, until, days, horizon };
}

function api(handler: (opts: QueryOpts) => unknown) {
  return (req: Request) => {
    try {
      return Response.json(handler(queryOpts(new URL(req.url))));
    } catch (e) {
      console.error(e);
      return Response.json({ error: String(e) }, { status: 500 });
    }
  };
}

const sources: UsageSource[] = [createClaudeCodeSource(), createOpencodeSource(), createCodexSource()];

const server = serve({
  routes: {
    "/": index,

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

    "/api/sessions": {
      GET: api((opts) => getSessions(opts)),
    },

    "/api/forecast": {
      GET: api((opts) => {
        const overall = buildForecast({ agent: opts.agent, horizon: opts.horizon });
        const agents: Record<string, ReturnType<typeof buildForecast>> = {};
        for (const id of Object.values(AGENTS)) {
          agents[id] = buildForecast({ agent: id, horizon: opts.horizon });
        }
        return { asOf: Date.now(), overall, agents };
      }),
    },
  },

  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) {
        return;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
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
console.log(`Watching sources: ${sources.map((s) => s.id).join(", ")}`);

for (const source of sources) {
  source.watch(
    (event) => {
      const stored = handleEvent(event);
      broadcast({ type: "usage", event: stored });
    },
    (session: SessionInfo) => {
      handleSession(session);
      broadcast({ type: "session", session });
    }
  );
}
