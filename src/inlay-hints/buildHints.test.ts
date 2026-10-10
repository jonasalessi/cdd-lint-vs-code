import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddUnit } from "../analysis/report";
import { buildHints, type Hint } from "./buildHints";

function unitOf(fields: Partial<CddUnit> = {}): CddUnit {
  return {
    name: "Order",
    kind: "class",
    line: 1,
    col: 14,
    total: 4,
    limit: 10,
    exceeds: false,
    metrics: [],
    ...fields,
  };
}

function recordOf(units: CddUnit[], fields: Partial<DocumentRecord> = {}): DocumentRecord {
  return { state: "measured", units, blocked: false, isStale: false, ...fields };
}

function hintsOf(record: DocumentRecord | undefined, lineCount = 10): Hint[] {
  return buildHints({ record, lineCount, showInlayHints: true });
}

function onlyHintOf(record: DocumentRecord): Hint {
  const hints = hintsOf(record);
  expect(hints).toHaveLength(1);
  return hints[0] as Hint;
}

describe("buildHints", () => {
  it("gives one hint for each unit, on the 0-based line of the unit", () => {
    const record = recordOf([unitOf({ line: 1 }), unitOf({ line: 7, name: "isPaid" })]);

    expect(hintsOf(record).map((hint) => hint.line)).toEqual([0, 6]);
  });

  it("formats the label as ICP: <total> / <limit>", () => {
    expect(onlyHintOf(recordOf([unitOf({ total: 4, limit: 10 })])).label).toBe("ICP: 4 / 10");
  });

  it("does not round a decimal total", () => {
    const hint = onlyHintOf(recordOf([unitOf({ total: 16.5, limit: 10, exceeds: true })]));

    expect(hint.label).toBe("ICP: 16.5 / 10");
    expect(hint.tooltipLines[1]).toBe("ICP 16.5 of limit 10");
  });

  it("starts the tooltip with the kind, the name and the score", () => {
    const hint = onlyHintOf(recordOf([unitOf({ kind: "func", name: "isPaid", total: 2 })]));

    expect(hint.tooltipLines).toEqual(["func isPaid", "ICP 2 of limit 10"]);
  });

  it("adds the excess line only when the unit exceeds its limit", () => {
    const hint = onlyHintOf(recordOf([unitOf({ total: 12, limit: 10, exceeds: true })]));

    expect(hint.tooltipLines).toEqual(["class Order", "ICP 12 of limit 10", "Over the limit by 2"]);
  });

  it("gives an excess of 0.3 for total 10.3 and limit 10", () => {
    const hint = onlyHintOf(recordOf([unitOf({ total: 10.3, limit: 10, exceeds: true })]));

    expect(hint.tooltipLines).toContain("Over the limit by 0.3");
  });

  it("adds one line for each metric with a count greater than 0", () => {
    const metrics = [
      { metric: "code_branch", count: 3, score: 3 },
      { metric: "coupling", count: 0, score: 0 },
      { metric: "condition", count: 2, score: 1.5 },
    ];

    const hint = onlyHintOf(recordOf([unitOf({ metrics })]));

    expect(hint.tooltipLines.slice(2)).toEqual(["code_branch: 3 (3)", "condition: 2 (1.5)"]);
  });

  it("ends the tooltip with the unsaved changes line only when the record is stale", () => {
    const metrics = [{ metric: "code_branch", count: 4, score: 4 }];

    const hint = onlyHintOf(recordOf([unitOf({ metrics })], { isStale: true }));

    expect(hint.tooltipLines).toEqual([
      "class Order",
      "ICP 4 of limit 10",
      "code_branch: 4 (4)",
      "Unsaved changes: the score is from the last saved version.",
    ]);
  });

  it("puts all tooltip lines in the order of the plan", () => {
    const unit = unitOf({
      total: 10.3,
      exceeds: true,
      metrics: [{ metric: "code_branch", count: 1, score: 10.3 }],
    });

    expect(onlyHintOf(recordOf([unit], { isStale: true })).tooltipLines).toEqual([
      "class Order",
      "ICP 10.3 of limit 10",
      "Over the limit by 0.3",
      "code_branch: 1 (10.3)",
      "Unsaved changes: the score is from the last saved version.",
    ]);
  });

  it("gives no hints for zero units", () => {
    expect(hintsOf(recordOf([]))).toEqual([]);
  });

  it("gives no hints for a document that has no record", () => {
    expect(hintsOf(undefined)).toEqual([]);
  });

  it("skips a unit whose line is not in the document", () => {
    const units = [
      unitOf({ line: 0, name: "BeforeFirstLine" }),
      unitOf({ line: 3, name: "LastLine" }),
      unitOf({ line: 4, name: "AfterLastLine" }),
    ];

    const hints = hintsOf(recordOf(units), 3);

    expect(hints.map((hint) => hint.tooltipLines[0])).toEqual(["class LastLine"]);
  });

  it("gives no hints when cdd.showInlayHints is false", () => {
    const source = { record: recordOf([unitOf()]), lineCount: 10 };

    expect(buildHints({ ...source, showInlayHints: false })).toEqual([]);
    expect(buildHints({ ...source, showInlayHints: true })).toHaveLength(1);
  });
});
