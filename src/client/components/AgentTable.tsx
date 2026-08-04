import { BreakdownTable } from "./BreakdownTable";

export function AgentTable({ refreshKey }: { refreshKey: string }) {
  return <BreakdownTable refreshKey={refreshKey} kind="agent" />;
}
