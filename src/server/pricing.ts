import { readFileSync } from "node:fs";
import path from "node:path";
import type { UsageEvent } from "./sources/types";

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

type PricingTable = Record<string, ModelPrice>;

let table: PricingTable | null = null;

export function getPricingTable(): PricingTable {
  if (table) return table;
  const jsonPath = path.join(import.meta.dir, "..", "..", "pricing.json");
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as PricingTable;
  table = raw;
  return table;
}

export function priceForModel(model: string): ModelPrice {
  const t = getPricingTable();
  return t[model] ?? t["default"]!;
}

/** Cost in USD for a normalized usage event. Rates are USD per 1M tokens. */
export function costForEvent(event: UsageEvent): number {
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
