import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddOccurrence } from "../analysis/report";
import { buildLineDetails, type LineDetail } from "./buildLineDetails";
import { occurrenceOf, recordOf, unitOf } from "./occurrenceFixtures";

function detailsOf(record: DocumentRecord | undefined, lineCount = 20): LineDetail[] {
  return buildLineDetails({ record, lineCount, showDetails: true });
}

function detailsOfOccurrences(occurrences: CddOccurrence[]): LineDetail[] {
  return detailsOf(recordOf([unitOf(occurrences)]));
}

describe("buildLineDetails", () => {
  it("gives one detail on the 0-based first line of an occurrence", () => {
    const details = detailsOfOccurrences([occurrenceOf({ line: 4, end_line: 10 })]);

    expect(details).toEqual([{ line: 3, label: "+1 ICP · 1 code_branch" }]);
  });

  it("groups the occurrences of one line into one label, in the order of the report", () => {
    const details = detailsOfOccurrences([
      occurrenceOf({ line: 5, metric: "code_branch" }),
      occurrenceOf({ line: 5, metric: "condition" }),
      occurrenceOf({ line: 5, metric: "condition" }),
    ]);

    expect(details).toEqual([{ line: 4, label: "+3 ICP · 1 code_branch, 2 condition" }]);
  });

  it("adds decimal scores with no rounding error", () => {
    const details = detailsOfOccurrences([
      occurrenceOf({ metric: "external_coupling", score: 0.1 }),
      occurrenceOf({ metric: "external_coupling", score: 0.2 }),
    ]);

    expect(details[0]?.label).toBe("+0.3 ICP · 2 external_coupling");
  });

  it("sorts the details by line across units", () => {
    const record = recordOf([
      unitOf([occurrenceOf({ line: 9 })], { name: "isPaid" }),
      unitOf([occurrenceOf({ line: 2 }), occurrenceOf({ line: 5 })]),
    ]);

    expect(detailsOf(record).map((detail) => detail.line)).toEqual([1, 4, 8]);
  });

  it("skips an occurrence with a score of 0", () => {
    const details = detailsOfOccurrences([
      occurrenceOf({ line: 4, score: 0 }),
      occurrenceOf({ line: 6 }),
    ]);

    expect(details.map((detail) => detail.line)).toEqual([5]);
  });

  it("skips an occurrence whose line is not in the document", () => {
    const occurrences = [
      occurrenceOf({ line: 0 }),
      occurrenceOf({ line: 3 }),
      occurrenceOf({ line: 4 }),
    ];

    const details = detailsOf(recordOf([unitOf(occurrences)]), 3);

    expect(details.map((detail) => detail.line)).toEqual([2]);
  });

  it("gives no details for a unit that has no occurrences field", () => {
    expect(detailsOf(recordOf([unitOf([], { occurrences: undefined })]))).toEqual([]);
  });

  it("gives no details for a document that has no record", () => {
    expect(detailsOf(undefined)).toEqual([]);
  });

  it("gives no details for a stale record", () => {
    const record = recordOf([unitOf([occurrenceOf()])], { isStale: true });

    expect(detailsOf(record)).toEqual([]);
  });

  it("gives no details when the details are switched off", () => {
    const source = { record: recordOf([unitOf([occurrenceOf()])]), lineCount: 20 };

    expect(buildLineDetails({ ...source, showDetails: false })).toEqual([]);
    expect(buildLineDetails({ ...source, showDetails: true })).toHaveLength(1);
  });
});
