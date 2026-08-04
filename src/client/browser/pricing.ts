import pricingTable from "../../../pricing.json";
import type { UsageEvent } from "./types";

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

type PricingTable = Record<string, ModelPrice>;

function priceForModel(model: string): ModelPrice {
  const t = pricingTable as PricingTable;
  return t[model] ?? t["default"]!;
}

/** Cost in USD for a normalized usage event. Rates are USD per 1M tokens. */
export function costForEvent(event: Omit<UsageEvent, "cost">): number {
  const p = priceForModel(event.model);
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
