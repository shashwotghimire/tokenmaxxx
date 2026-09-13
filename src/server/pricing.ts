import { readFileSync } from "node:fs";
import path from "node:path";
import type { UsageEvent } from "./sources/types";

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

interface PricingFile { unit: string; version: string; currency: "USD"; source: string; models: Record<string, ModelPrice> }

let table: PricingFile | null = null;

export function getPricingTable(): PricingFile {
  if (table) return table;
  const jsonPath = path.join(import.meta.dir, "..", "..", "pricing.json");
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as PricingFile;
  table = raw;
  return table;
}

export function priceForModel(model: string): ModelPrice | null {
  const t = getPricingTable();
  return t.models[model] ?? null;
}

/** Cost in USD for a normalized usage event. Rates are USD per 1M tokens. */
export function costForEvent(event: UsageEvent): number | null {
  const p = priceForModel(event.model);
  if (!p) return null;
  const perMillion = 1_000_000;
  return (
    (event.inputTokens * p.input +
      (event.outputTokens + event.reasoningTokens) * p.output +
      event.cacheWriteTokens * p.cacheWrite +
      event.cacheReadTokens * p.cacheRead) /
    perMillion
  );
}
export function pricingMetadata() { const { unit, version, currency, source } = getPricingTable(); return { unit, version, currency, source, methodology: "API-equivalent estimate; not a billed amount" }; }
