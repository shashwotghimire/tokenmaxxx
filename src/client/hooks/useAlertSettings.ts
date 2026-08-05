import { useCallback, useEffect, useState } from "react";
import type { AlertConfig } from "../sound";

const STORAGE_KEY = "tokenmaxxx:alerts";

export const DEFAULT_ALERTS: AlertConfig = { enabled: false, threshold: 1, mode: "both", repeat: 1 };

function loadAlerts(): AlertConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERTS;
    const p = JSON.parse(raw) as Partial<AlertConfig>;
    return {
      enabled: !!p.enabled,
      threshold: Number(p.threshold) || DEFAULT_ALERTS.threshold,
      mode: p.mode === "beep" || p.mode === "voice" ? p.mode : DEFAULT_ALERTS.mode,
      repeat: Math.min(3, Math.max(1, Number(p.repeat) || DEFAULT_ALERTS.repeat)),
    };
  } catch {
    return DEFAULT_ALERTS;
  }
}

export function useAlertSettings() {
  const [settings, setSettings] = useState<AlertConfig>(loadAlerts);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable; alerts just won't persist
    }
  }, [settings]);

  const update = useCallback((patch: Partial<AlertConfig>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const snooze = useCallback((hours: number) => {
    setSnoozedUntil(Date.now() + hours * 3_600_000);
  }, []);

  const clearSnooze = useCallback(() => setSnoozedUntil(null), []);

  return { settings, update, snoozedUntil, snooze, clearSnooze };
}
