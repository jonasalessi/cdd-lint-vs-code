import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddOccurrence, CddUnit } from "../analysis/report";

export type UnitOccurrence = {
  unit: CddUnit;
  occurrence: CddOccurrence;
};

// A stale record gives no occurrences: an edit moves the constructs, and the record keeps the
// positions of the saved content.
export function scoredOccurrencesOf(record: DocumentRecord | undefined): UnitOccurrence[] {
  if (record === undefined || record.isStale) {
    return [];
  }
  return record.units.flatMap((unit) =>
    (unit.occurrences ?? [])
      .filter((occurrence) => occurrence.score > 0)
      .map((occurrence) => ({ unit, occurrence })),
  );
}
