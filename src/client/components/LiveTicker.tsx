import { useEffect, useRef, useState } from "react";
import type { UsageEvent } from "../hooks/useWebSocket";
import { formatCost, formatTokens } from "../format";

function addEvent(acc: UsageEvent | null, e: UsageEvent): UsageEvent {
  if (!acc) return { ...e };
  return {
    ...acc,
    inputTokens: acc.inputTokens + e.inputTokens,
    outputTokens: acc.outputTokens + e.outputTokens,
    cacheWriteTokens: acc.cacheWriteTokens + e.cacheWriteTokens,
    cacheReadTokens: acc.cacheReadTokens + e.cacheReadTokens,
    reasoningTokens: acc.reasoningTokens + e.reasoningTokens,
    cost: acc.cost + e.cost,
  };
}

export function LiveTicker({ lastEvent }: { lastEvent: UsageEvent | null }) {
  const [session, setSession] = useState<UsageEvent | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    setSession((s) => addEvent(s, lastEvent));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 700);
  }, [lastEvent]);

  const totalTokens =
    (session?.inputTokens ?? 0) +
    (session?.outputTokens ?? 0) +
    (session?.cacheWriteTokens ?? 0) +
    (session?.cacheReadTokens ?? 0) +
    (session?.reasoningTokens ?? 0);

  return (
    <section className={`ticker ${flash ? "ticker-flash" : ""}`}>
      <div>
        <div className="ticker-label">session tokens</div>
        <div className="ticker-value">{formatTokens(totalTokens)}</div>
      </div>
      <div>
        <div className="ticker-label">session cost</div>
        <div className="ticker-value">{formatCost(session?.cost ?? 0)}</div>
      </div>
      <div className="ticker-agent">
        <div className="ticker-label">last event</div>
        <div className="ticker-meta">
          {lastEvent ? (
            <>
              <span className={`badge badge-${lastEvent.agent}`}>{lastEvent.agent}</span>
              <span className="ticker-model">{lastEvent.model}</span>
              <span>+{formatTokens(lastEvent.inputTokens + lastEvent.outputTokens + lastEvent.cacheReadTokens + lastEvent.cacheWriteTokens + lastEvent.reasoningTokens)}</span>
            </>
          ) : (
            "waiting for usage…"
          )}
        </div>
      </div>
    </section>
  );
}
