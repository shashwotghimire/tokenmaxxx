import { maybeBrowserApi } from "./browser/store";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function formatCost(n: number): string {
  if (n < 0.01) return "$" + n.toFixed(4);
  return "$" + n.toFixed(2);
}

export async function fetchJSON<T>(url: string): Promise<T> {
  const u = new URL(url, typeof location === "undefined" ? "http://localhost" : location.origin);
  if (typeof location !== "undefined") {
    const global = new URLSearchParams(location.search);
    for (const key of ["agent", "model", "project", "since", "until", "tz"]) if (!u.searchParams.has(key) && global.has(key)) u.searchParams.set(key, global.get(key)!);
  }
  const requestUrl = u.pathname + u.search;
  const local = maybeBrowserApi(requestUrl);
  if (local !== null) return local as T;
  const res = await fetch(requestUrl);
  if (!res.ok) throw new Error(`GET ${requestUrl} failed: ${res.status}`);
  return (await res.json()) as T;
}
