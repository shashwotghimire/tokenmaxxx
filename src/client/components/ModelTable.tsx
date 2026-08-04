import { BreakdownTable } from "./BreakdownTable";

export function ModelTable({ refreshKey }: { refreshKey: string }) {
  return <BreakdownTable refreshKey={refreshKey} kind="model" />;
}
