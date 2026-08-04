import { useState, type MouseEvent, type ReactNode } from "react";
import { formatCost, formatTokens } from "../format";

export interface ChartTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export function useChartTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);

  const show = (e: MouseEvent, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content });
  const move = (e: MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
  const hide = () => setTip(null);

  const node = tip ? (
    <div className="chart-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      {tip.content}
    </div>
  ) : null;

  return { show, move, hide, node };
}

export function UsageTooltip({ heading, totals }: { heading: string; totals: ChartTotals }) {
  const rows: [string, string][] = [
    ["input", formatTokens(totals.inputTokens)],
    ["output", formatTokens(totals.outputTokens)],
    ["cache read", formatTokens(totals.cacheReadTokens)],
    ["cache write", formatTokens(totals.cacheWriteTokens)],
    ["reasoning", formatTokens(totals.reasoningTokens)],
  ];
  return (
    <>
      <div className="chart-tooltip-head">{heading}</div>
      <div className="chart-tooltip-grid">
        {rows.map(([label, value]) => (
          <div className="chart-tooltip-item" key={label}>
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="chart-tooltip-item chart-tooltip-total">
          <span>total</span>
          <span>{formatTokens(totals.totalTokens)}</span>
        </div>
        <div className="chart-tooltip-item chart-tooltip-cost">
          <span>cost</span>
          <span>{formatCost(totals.cost)}</span>
        </div>
      </div>
    </>
  );
}

export function hoverHandlers(
  tip: ReturnType<typeof useChartTooltip>,
  content: ReactNode
): {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseLeave: () => void;
} {
  return {
    onMouseEnter: (e) => tip.show(e, content),
    onMouseMove: (e) => tip.move(e),
    onMouseLeave: tip.hide,
  };
}
