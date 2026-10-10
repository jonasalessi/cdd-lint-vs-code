import { describe, expect, it } from "vitest";
import { parseReport } from "./parseReport";

type JsonObject = Record<string, unknown>;

function validUnit(): JsonObject {
  return {
    name: "Order",
    kind: "class",
    line: 1,
    col: 8,
    total: 16.5,
    limit: 10,
    exceeds: true,
    metrics: [{ metric: "code_branch", count: 4, score: 4 }],
  };
}

function validFile(): JsonObject {
  return { path: "src/order.ts", language: "typescript", units: [validUnit()] };
}

function validReport(): JsonObject {
  return {
    root: ".",
    blocked: true,
    filter: "all",
    explain: false,
    partial: false,
    elapsed_ms: 7,
    files: [validFile()],
    summary: { units: 1, violations: 1 },
  };
}

function reportWithFile(fileChanges: JsonObject): string {
  return JSON.stringify({ ...validReport(), files: [{ ...validFile(), ...fileChanges }] });
}

function reportWithUnit(unitChanges: JsonObject): string {
  return reportWithFile({ units: [{ ...validUnit(), ...unitChanges }] });
}

function reportWithMetric(metric: JsonObject): string {
  return reportWithUnit({ metrics: [metric] });
}

function withoutField(source: JsonObject, field: string): JsonObject {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== field));
}

describe("parseReport", () => {
  it("returns the report when each field that the extension reads is valid", () => {
    expect(parseReport(JSON.stringify(validReport()))).toEqual(validReport());
  });

  it("keeps a decimal total", () => {
    const report = parseReport(reportWithUnit({ total: 16.5 }));

    expect(report?.files[0]?.units[0]?.total).toBe(16.5);
  });

  it("accepts a report with no files", () => {
    const report = parseReport(JSON.stringify({ ...validReport(), files: [] }));

    expect(report?.files).toEqual([]);
  });

  it("accepts file warnings that are strings", () => {
    const report = parseReport(reportWithFile({ units: [], warnings: ["syntax error at 3:14"] }));

    expect(report?.files[0]?.warnings).toEqual(["syntax error at 3:14"]);
  });

  it.each(["", "Report written to cdd-report.json", "{", "null", "[]", '"text"'])(
    "rejects stdout that is not a JSON report: %j",
    (stdout) => {
      expect(parseReport(stdout)).toBeUndefined();
    },
  );

  it.each(["partial", "blocked", "files"])("rejects a report with no %s field", (field) => {
    expect(parseReport(JSON.stringify(withoutField(validReport(), field)))).toBeUndefined();
  });

  it.each(["path", "units"])("rejects a file with no %s field", (field) => {
    const report = { ...validReport(), files: [withoutField(validFile(), field)] };

    expect(parseReport(JSON.stringify(report))).toBeUndefined();
  });

  it.each(["name", "kind", "line", "total", "limit", "exceeds", "metrics"])(
    "rejects a unit with no %s field",
    (field) => {
      const report = reportWithFile({ units: [withoutField(validUnit(), field)] });

      expect(parseReport(report)).toBeUndefined();
    },
  );

  it.each(["metric", "count", "score"])("rejects a metric with no %s field", (field) => {
    const metric = withoutField({ metric: "code_branch", count: 4, score: 4 }, field);

    expect(parseReport(reportWithMetric(metric))).toBeUndefined();
  });

  it.each([
    ["partial", { partial: "false" }],
    ["blocked", { blocked: 0 }],
    ["files", { files: {} }],
  ])("rejects a report with a %s field of the wrong type", (_field, changes) => {
    expect(parseReport(JSON.stringify({ ...validReport(), ...changes }))).toBeUndefined();
  });

  it.each([
    ["path", { path: 1 }],
    ["units", { units: "none" }],
    ["warnings", { warnings: "syntax error" }],
    ["warnings item", { warnings: [1] }],
  ])("rejects a file with a %s of the wrong type", (_field, changes) => {
    expect(parseReport(reportWithFile(changes))).toBeUndefined();
  });

  it.each([
    ["name", { name: 1 }],
    ["kind", { kind: null }],
    ["line", { line: "1" }],
    ["total", { total: "16.5" }],
    ["limit", { limit: "10" }],
    ["exceeds", { exceeds: "true" }],
    ["metrics", { metrics: {} }],
  ])("rejects a unit with a %s field of the wrong type", (_field, changes) => {
    expect(parseReport(reportWithUnit(changes))).toBeUndefined();
  });

  it.each([
    ["metric", { metric: 1, count: 4, score: 4 }],
    ["count", { metric: "code_branch", count: "4", score: 4 }],
    ["score", { metric: "code_branch", count: 4, score: "4" }],
  ])("rejects a metric with a %s field of the wrong type", (_field, metric) => {
    expect(parseReport(reportWithMetric(metric))).toBeUndefined();
  });
});
