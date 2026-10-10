import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddOccurrence, CddUnit } from "../analysis/report";

export function occurrenceOf(fields: Partial<CddOccurrence> = {}): CddOccurrence {
  return {
    metric: "code_branch",
    line: 4,
    col: 5,
    end_line: 4,
    end_col: 20,
    count: 1,
    score: 1,
    ...fields,
  };
}

export function unitOf(occurrences: CddOccurrence[], fields: Partial<CddUnit> = {}): CddUnit {
  return {
    name: "Order",
    kind: "class",
    line: 1,
    col: 14,
    total: 8,
    limit: 7,
    exceeds: true,
    metrics: [],
    occurrences,
    ...fields,
  };
}

export function recordOf(units: CddUnit[], fields: Partial<DocumentRecord> = {}): DocumentRecord {
  return { state: "measured", units, blocked: false, isStale: false, ...fields };
}
