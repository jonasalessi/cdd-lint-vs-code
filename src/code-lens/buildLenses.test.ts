import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddUnit } from "../analysis/report";
import { buildLenses, type UnitLens } from "./buildLenses";

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

function lensesOf(record: DocumentRecord | undefined, lineCount = 10): UnitLens[] {
  return buildLenses({ record, lineCount, showCodeLens: true, areDetailsShown: false });
}

function onlyLensOf(record: DocumentRecord): UnitLens {
  const lenses = lensesOf(record);
  expect(lenses).toHaveLength(1);
  return lenses[0] as UnitLens;
}

describe("buildLenses", () => {
  it("gives one lens for each unit, on the 0-based line of the unit", () => {
    const record = recordOf([unitOf({ line: 1 }), unitOf({ line: 7, name: "isPaid" })]);

    expect(lensesOf(record).map((lens) => lens.line)).toEqual([0, 6]);
  });

  it("formats the score title as ICP: <total> / <limit>", () => {
    expect(onlyLensOf(recordOf([unitOf({ total: 4, limit: 10 })])).scoreTitle).toBe("ICP: 4 / 10");
  });

  it("does not round a decimal total", () => {
    const lens = onlyLensOf(recordOf([unitOf({ total: 16.5, limit: 10, exceeds: true })]));

    expect(lens.scoreTitle).toBe("ICP: 16.5 / 10");
    expect(lens.tooltipLines[1]).toBe("ICP 16.5 of limit 10");
  });

  it("starts the tooltip with the kind, the name and the score", () => {
    const lens = onlyLensOf(recordOf([unitOf({ kind: "func", name: "isPaid", total: 2 })]));

    expect(lens.tooltipLines).toEqual(["func isPaid", "ICP 2 of limit 10"]);
  });

  it("adds the excess line only when the unit exceeds its limit", () => {
    const lens = onlyLensOf(recordOf([unitOf({ total: 12, limit: 10, exceeds: true })]));

    expect(lens.tooltipLines).toEqual(["class Order", "ICP 12 of limit 10", "Over the limit by 2"]);
  });

  it("gives an excess of 0.3 for total 10.3 and limit 10", () => {
    const lens = onlyLensOf(recordOf([unitOf({ total: 10.3, limit: 10, exceeds: true })]));

    expect(lens.tooltipLines).toContain("Over the limit by 0.3");
  });

  it("adds one line for each metric with a count greater than 0", () => {
    const metrics = [
      { metric: "code_branch", count: 3, score: 3 },
      { metric: "coupling", count: 0, score: 0 },
      { metric: "condition", count: 2, score: 1.5 },
    ];

    const lens = onlyLensOf(recordOf([unitOf({ metrics })]));

    expect(lens.tooltipLines.slice(2)).toEqual(["code_branch: 3 (3)", "condition: 2 (1.5)"]);
  });

  it("ends the tooltip with the unsaved changes line only when the record is stale", () => {
    const metrics = [{ metric: "code_branch", count: 4, score: 4 }];

    const lens = onlyLensOf(recordOf([unitOf({ metrics })], { isStale: true }));

    expect(lens.tooltipLines).toEqual([
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

    expect(onlyLensOf(recordOf([unit], { isStale: true })).tooltipLines).toEqual([
      "class Order",
      "ICP 10.3 of limit 10",
      "Over the limit by 0.3",
      "code_branch: 1 (10.3)",
      "Unsaved changes: the score is from the last saved version.",
    ]);
  });

  it("gives no lenses for zero units", () => {
    expect(lensesOf(recordOf([]))).toEqual([]);
  });

  it("gives no lenses for a document that has no record", () => {
    expect(lensesOf(undefined)).toEqual([]);
  });

  it("skips a unit whose line is not in the document", () => {
    const units = [
      unitOf({ line: 0, name: "BeforeFirstLine" }),
      unitOf({ line: 3, name: "LastLine" }),
      unitOf({ line: 4, name: "AfterLastLine" }),
    ];

    const lenses = lensesOf(recordOf(units), 3);

    expect(lenses.map((lens) => lens.tooltipLines[0])).toEqual(["class LastLine"]);
  });

  it("skips a unit whose ICP is 0", () => {
    const units = [
      unitOf({ line: 1, name: "Empty", total: 0 }),
      unitOf({ line: 2, name: "Order" }),
    ];

    expect(lensesOf(recordOf(units)).map((lens) => lens.tooltipLines[0])).toEqual(["class Order"]);
  });

  it("gives no lenses when cdd.showCodeLens is false", () => {
    const source = { record: recordOf([unitOf()]), lineCount: 10, areDetailsShown: false };

    expect(buildLenses({ ...source, showCodeLens: false })).toEqual([]);
    expect(buildLenses({ ...source, showCodeLens: true })).toHaveLength(1);
  });

  it("names the toggle by the state of the ICP details", () => {
    const source = { record: recordOf([unitOf()]), lineCount: 10, showCodeLens: true };

    expect(buildLenses({ ...source, areDetailsShown: false })[0]?.toggleTitle).toBe(
      "Show ICP Details",
    );
    expect(buildLenses({ ...source, areDetailsShown: true })[0]?.toggleTitle).toBe(
      "Hide ICP Details",
    );
  });
});
