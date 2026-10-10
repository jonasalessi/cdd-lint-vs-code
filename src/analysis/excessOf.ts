import type { CddUnit } from "./report";

// The amount over the limit, as the tooltip and the diagnostic message show it.
export function excessOf(unit: CddUnit): number {
  return Number((unit.total - unit.limit).toFixed(2));
}
