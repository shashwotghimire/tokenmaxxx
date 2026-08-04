import { useCallback, useEffect, useRef, useState } from "react";

export interface UsageEvent {
  agent: string;
  model: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cost: number;
}

export type ConnectionState = "connecting" | "open" | "reconnecting";

const MIN_RETRY = 500;
const MAX_RETRY = 10_000;

export function useWebSocket(path = "/ws") {
  const [lastEvent, setLastEvent] = useState<UsageEvent | null>(null);
  const [sessionSeq, setSessionSeq] = useState(0);
  const [state, setState] = useState<ConnectionState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(MIN_RETRY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    setState((s) => (s === "connecting" ? s : "reconnecting"));
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${path}`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = MIN_RETRY;
      setState("open");
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (data.type === "usage" && data.event) {
          setLastEvent(data.event as UsageEvent);
        } else if (data.type === "session") {
          setSessionSeq((n) => n + 1);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setState("reconnecting");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(connect, retryRef.current);
      retryRef.current = Math.min(retryRef.current * 2, MAX_RETRY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastEvent, sessionSeq, state };
}

export type { UsageEvent as WsUsageEvent };
