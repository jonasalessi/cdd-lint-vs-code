import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddUnit } from "../analysis/report";
import { buildDiagnostics, type IcpDiagnostic } from "./buildDiagnostics";

const lineTexts = ["export class Order {", "  isPaid(): boolean {", "\t\treturn true;", "", "   "];

function unitOf(fields: Partial<CddUnit> = {}): CddUnit {
  return {
    name: "Order",
    kind: "class",
    line: 1,
    col: 14,
    total: 12,
    limit: 10,
    exceeds: true,
    metrics: [],
    ...fields,
  };
}

function recordOf(units: CddUnit[], fields: Partial<DocumentRecord> = {}): DocumentRecord {
  return { state: "measured", units, blocked: false, isStale: false, ...fields };
}

function diagnosticsOf(record: DocumentRecord | undefined, texts = lineTexts): IcpDiagnostic[] {
  return buildDiagnostics({
    record,
    lineCount: texts.length,
    lineTextAt: (line) => texts[line] as string,
    showDiagnostics: true,
  });
}

function onlyDiagnosticOf(record: DocumentRecord): IcpDiagnostic {
  const diagnostics = diagnosticsOf(record);
  expect(diagnostics).toHaveLength(1);
  return diagnostics[0] as IcpDiagnostic;
}

describe("buildDiagnostics", () => {
  it("gives one diagnostic for each unit with exceeds true, and none for the other units", () => {
    const units = [
      unitOf({ line: 1, name: "Order" }),
      unitOf({ line: 2, name: "isPaid", total: 4, exceeds: false }),
      unitOf({ line: 3, name: "total" }),
    ];

    expect(diagnosticsOf(recordOf(units)).map((diagnostic) => diagnostic.line)).toEqual([0, 2]);
  });

  it("formats the message with the kind, the name, the score and the excess", () => {
    const unit = unitOf({ kind: "func", name: "isPaid", total: 16.5, limit: 10 });

    expect(onlyDiagnosticOf(recordOf([unit])).message).toBe(
      "func isPaid has ICP 16.5, limit 10 (over by 6.5).",
    );
  });

  it("formats the excess as the tooltip does: 0.3 for total 10.3 and limit 10", () => {
    const diagnostic = onlyDiagnosticOf(recordOf([unitOf({ total: 10.3, limit: 10 })]));

    expect(diagnostic.message).toBe("class Order has ICP 10.3, limit 10 (over by 0.3).");
  });

  it("gives the severity error when the record is blocked", () => {
    expect(onlyDiagnosticOf(recordOf([unitOf()], { blocked: true })).severity).toBe("error");
  });

  it("gives the severity warning when the record is not blocked", () => {
    expect(onlyDiagnosticOf(recordOf([unitOf()], { blocked: false })).severity).toBe("warning");
  });

  it("gives the source CDD and the code icp-limit", () => {
    expect(onlyDiagnosticOf(recordOf([unitOf()]))).toMatchObject({
      source: "CDD",
      code: "icp-limit",
    });
  });

  it("gives the range from the first non-whitespace character to the end of the line", () => {
    const units = [unitOf({ line: 1 }), unitOf({ line: 2 }), unitOf({ line: 3 })];

    const spans = diagnosticsOf(recordOf(units)).map((diagnostic) => [
      diagnostic.line,
      diagnostic.startCharacter,
      diagnostic.endCharacter,
    ]);

    expect(spans).toEqual([
      [0, 0, 20],
      [1, 2, 21],
      [2, 2, 14],
    ]);
  });

  it("gives an empty range at the end of a line that has no text", () => {
    const units = [unitOf({ line: 4 }), unitOf({ line: 5 })];

    const diagnostics = diagnosticsOf(recordOf(units));

    expect(diagnostics[0]).toMatchObject({ line: 3, startCharacter: 0, endCharacter: 0 });
    expect(diagnostics[1]).toMatchObject({ line: 4, startCharacter: 3, endCharacter: 3 });
  });

  it("skips a unit whose line is not in the document", () => {
    const units = [
      unitOf({ line: 0, name: "BeforeFirstLine" }),
      unitOf({ line: 2, name: "LastLine" }),
      unitOf({ line: 3, name: "AfterLastLine" }),
    ];

    const diagnostics = diagnosticsOf(recordOf(units), lineTexts.slice(0, 2));

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "class LastLine has ICP 12, limit 10 (over by 2).",
    ]);
  });

  it("keeps the diagnostics of a stale record", () => {
    expect(diagnosticsOf(recordOf([unitOf()], { isStale: true }))).toHaveLength(1);
  });

  it("gives no diagnostics for zero units", () => {
    expect(diagnosticsOf(recordOf([]))).toEqual([]);
  });

  it("gives no diagnostics for a document that has no record", () => {
    expect(diagnosticsOf(undefined)).toEqual([]);
  });

  it("gives no diagnostics when cdd.showDiagnostics is false", () => {
    const source = {
      record: recordOf([unitOf()]),
      lineCount: lineTexts.length,
      lineTextAt: (line: number) => lineTexts[line] as string,
    };

    expect(buildDiagnostics({ ...source, showDiagnostics: false })).toEqual([]);
    expect(buildDiagnostics({ ...source, showDiagnostics: true })).toHaveLength(1);
  });
});
