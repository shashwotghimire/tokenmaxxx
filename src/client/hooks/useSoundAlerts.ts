import { useEffect, useRef } from "react";
import type { UsageEvent } from "./useWebSocket";
import { fireAlert, type AlertConfig } from "../sound";

export function useSoundAlerts(lastEvent: UsageEvent | null, settings: AlertConfig, snoozedUntil: number | null) {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (!settings.enabled) return;
    if (snoozedUntil && Date.now() < snoozedUntil) return;
    if (lastEvent.cost < settings.threshold) return;
    const key = `${lastEvent.timestamp}:${lastEvent.agent}:${lastEvent.model}:${lastEvent.cost}`;
    if (handled.current === key) return;
    handled.current = key;

    fireAlert(lastEvent, settings);
  }, [lastEvent, settings.enabled, settings.threshold, settings.mode, settings.repeat, snoozedUntil]);
}
