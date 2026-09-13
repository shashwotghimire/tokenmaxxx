export function budgetState(spend: number, allowance: number) {
  const configured = Number.isFinite(allowance) && allowance > 0;
  return { configured, remaining: configured ? Math.max(0, allowance - Math.max(0, spend)) : null, exceeded: configured && spend >= allowance, ratio: configured ? Math.max(0, spend) / allowance : null };
}
export function budgetAlertKey(date: string, allowance: number, period: "daily" | "monthly" = "daily") { return `tokenmaxxx:budget-alert:${period}:${date}:${allowance.toFixed(2)}`; }
