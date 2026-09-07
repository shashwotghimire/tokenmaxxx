import pricingTable from "../../../pricing.json";
import type { UsageEvent } from "./types";

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

function priceForModel(model: string): ModelPrice | null {
  return (pricingTable.models as Record<string, ModelPrice>)[model] ?? null;
}

/** Cost in USD for a normalized usage event. Rates are USD per 1M tokens. */
export function costForEvent(event: Omit<UsageEvent, "cost">): number {
  const p = priceForModel(event.model);
  if (!p) return 0;
  const perMillion = 1_000_000;
  return (
    (event.inputTokens * p.input +
      event.outputTokens * p.output +
      event.cacheWriteTokens * p.cacheWrite +
      event.cacheReadTokens * p.cacheRead) /
    perMillion
  );
}

export function withCost(event: Omit<UsageEvent, "cost">): UsageEvent {
  return { ...event, cost: costForEvent(event) };
}
