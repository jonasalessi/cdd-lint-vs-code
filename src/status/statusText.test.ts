import { describe, expect, it } from "vitest";
import { recordOfState, type DocumentRecord } from "../analysis/documentRecord";
import type { CddUnit } from "../analysis/report";
import { statusText, type StatusInput } from "./statusText";

function unit(name: string, total: number, limit: number): CddUnit {
  return {
    name,
    kind: "class",
    line: 1,
    col: 1,
    total,
    limit,
    exceeds: total > limit,
    metrics: [],
  };
}

function inputWith(fields: Partial<StatusInput>): StatusInput {
  return {
    isSupported: true,
    isPipelineActive: false,
    isDirty: false,
    record: undefined,
    ...fields,
  };
}

function statusOfRecord(record: DocumentRecord) {
  return statusText(inputWith({ record }));
}

describe("statusText", () => {
  it("row 1: a document that is not supported", () => {
    const status = statusText(
      inputWith({ isSupported: false, isPipelineActive: true, record: recordOfState("error") }),
    );

    expect(status).toEqual({
      text: "CDD: file not supported",
      severity: "information",
      busy: false,
    });
  });

  it("row 2: an active pipeline is busy and wins over the record", () => {
    const status = statusText(
      inputWith({ isPipelineActive: true, isDirty: true, record: recordOfState("error") }),
    );

    expect(status).toEqual({ text: "CDD: analyzing", severity: "information", busy: true });
  });

  it("row 3: no record and a dirty document", () => {
    expect(statusText(inputWith({ isDirty: true }))).toEqual({
      text: "CDD: save the file to analyze",
      severity: "information",
      busy: false,
    });
  });

  it("row 4: no record and a clean document", () => {
    expect(statusText(inputWith({}))).toEqual({
      text: "CDD: not analyzed",
      severity: "information",
      busy: false,
    });
  });

  it("row 5: measured with units shows the highest total and the limit of that unit", () => {
    const units = [unit("Order", 4, 10), unit("Invoice", 16.5, 12), unit("Price", 9, 20)];

    expect(statusOfRecord({ ...recordOfState("measured"), units })).toEqual({
      text: "CDD: max ICP 16.5 / 12",
      severity: "information",
      busy: false,
    });
  });

  it("row 5 also applies to a dirty document with a record", () => {
    const record = { ...recordOfState("measured"), units: [unit("Order", 4, 10)], isStale: true };

    expect(statusText(inputWith({ isDirty: true, record })).text).toBe("CDD: max ICP 4 / 10");
  });

  it("row 6: measured with zero units", () => {
    expect(statusOfRecord(recordOfState("measured"))).toEqual({
      text: "CDD: no code units",
      severity: "information",
      busy: false,
    });
  });

  it("row 7: not-applicable", () => {
    expect(statusOfRecord(recordOfState("not-applicable"))).toEqual({
      text: "CDD: file not in the CDD configuration",
      severity: "information",
      busy: false,
    });
  });

  it("row 8: no-config", () => {
    expect(statusOfRecord(recordOfState("no-config"))).toEqual({
      text: "CDD: no cdd.config.yaml",
      severity: "information",
      busy: false,
    });
  });

  it("row 9: no-binary has the command cdd.installBinary", () => {
    expect(statusOfRecord(recordOfState("no-binary"))).toEqual({
      text: "CDD: binary not found",
      severity: "warning",
      busy: false,
      commandId: "cdd.installBinary",
    });
  });

  it("row 10: invalid-binary has the command cdd.selectBinary", () => {
    expect(statusOfRecord(recordOfState("invalid-binary"))).toEqual({
      text: "CDD: configured binary not valid",
      severity: "warning",
      busy: false,
      commandId: "cdd.selectBinary",
    });
  });

  it("row 11: output-file-configured", () => {
    expect(statusOfRecord(recordOfState("output-file-configured"))).toEqual({
      text: "CDD: reporter.outputFile is not supported in the editor",
      severity: "warning",
      busy: false,
    });
  });

  it("row 12: warning shows the detail", () => {
    const record = { ...recordOfState("warning"), detail: "syntax error at 3:14" };

    expect(statusOfRecord(record)).toEqual({
      text: "CDD: syntax error at 3:14",
      severity: "warning",
      busy: false,
    });
  });

  it("row 13: error has the command cdd.showOutput", () => {
    expect(statusOfRecord(recordOfState("error"))).toEqual({
      text: "CDD: analysis failed",
      severity: "error",
      busy: false,
      commandId: "cdd.showOutput",
    });
  });
});
