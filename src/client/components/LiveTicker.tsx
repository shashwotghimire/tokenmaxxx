import { useEffect, useRef, useState } from "react";
import type { UsageEvent } from "../hooks/useWebSocket";
import { formatCost, formatTokens } from "../format";

export function LiveTicker({ lastEvent, totals: session }: { lastEvent: UsageEvent | null; totals: UsageEvent | null }) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
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
        <div className="ticker-label">tokens since opening</div>
        <div className="ticker-value">{formatTokens(totalTokens)}</div>
      </div>
      <div>
        <div className="ticker-label">cost since opening</div>
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
