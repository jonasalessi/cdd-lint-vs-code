import { describe, expect, it } from "vitest";
import { classifyRun } from "./classifyRun";
import type { CddFile, CddReport, CddUnit } from "./report";
import type { RunResult } from "./runCddCheck";

const relativePath = "src/order.ts";

const unit: CddUnit = {
  name: "Order",
  kind: "class",
  line: 1,
  col: 8,
  total: 16.5,
  limit: 10,
  exceeds: true,
  metrics: [{ metric: "code_branch", count: 4, score: 4 }],
};

function fileEntry(changes: Partial<CddFile> = {}): CddFile {
  return { path: relativePath, language: "typescript", units: [unit], ...changes };
}

function reportJson(changes: Partial<CddReport> = {}): string {
  const report: CddReport = {
    root: ".",
    blocked: false,
    filter: "all",
    explain: false,
    partial: false,
    elapsed_ms: 7,
    files: [fileEntry()],
    summary: { units: 1, violations: 1 },
    ...changes,
  };
  return JSON.stringify(report);
}

function runResult(changes: Partial<RunResult> = {}): RunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 10,
    wasKilled: false,
    startError: undefined,
    ...changes,
  };
}

function classifyStderr(stderr: string) {
  return classifyRun(runResult({ stderr, exitCode: 1 }), relativePath);
}

describe("classifyRun", () => {
  describe("rule 1: the process was killed or did not start", () => {
    it("gives failed for a killed run, also with a valid report", () => {
      const run = runResult({ stdout: reportJson(), wasKilled: true, exitCode: null });

      expect(classifyRun(run, relativePath)).toEqual({ kind: "failed" });
    });

    it("gives failed for a start error", () => {
      const startError: NodeJS.ErrnoException = Object.assign(new Error("spawn cdd ENOENT"), {
        code: "ENOENT",
      });
      const run = runResult({ startError, exitCode: null });

      expect(classifyRun(run, relativePath)).toEqual({ kind: "failed" });
    });
  });

  describe("rule 2: valid report with partial true", () => {
    it("gives not-measured and ignores exit code 2", () => {
      const run = runResult({
        stdout: reportJson({ partial: true, files: [] }),
        stderr: "cdd: timeout of 1ns elapsed; 0 files analyzed, 0 skipped",
        exitCode: 2,
      });

      expect(classifyRun(run, relativePath)).toEqual({ kind: "not-measured", reason: "partial" });
    });

    it("has priority over the file entry", () => {
      const run = runResult({ stdout: reportJson({ partial: true }) });

      expect(classifyRun(run, relativePath)).toEqual({ kind: "not-measured", reason: "partial" });
    });
  });

  describe("rule 3: valid report with no file entry", () => {
    it("gives measured with zero units for an empty files array", () => {
      const run = runResult({ stdout: reportJson({ files: [] }) });

      expect(classifyRun(run, relativePath)).toEqual({
        kind: "measured",
        units: [],
        blocked: false,
      });
    });

    it("gives measured with zero units when only another path is in the report", () => {
      const run = runResult({
        stdout: reportJson({ files: [fileEntry({ path: "src/other.ts" })] }),
      });

      expect(classifyRun(run, relativePath)).toEqual({
        kind: "measured",
        units: [],
        blocked: false,
      });
    });
  });

  describe("rule 4: the file entry has warnings", () => {
    it("gives not-measured with the warnings", () => {
      const warnings = ["syntax error at 3:14"];
      const run = runResult({
        stdout: reportJson({ files: [fileEntry({ units: [], warnings })] }),
      });

      expect(classifyRun(run, relativePath)).toEqual({
        kind: "not-measured",
        reason: "file-warnings",
        warnings,
      });
    });

    it("does not apply to an empty warnings array", () => {
      const run = runResult({ stdout: reportJson({ files: [fileEntry({ warnings: [] })] }) });

      expect(classifyRun(run, relativePath).kind).toBe("measured");
    });
  });

  describe("rule 5: valid report, all other cases", () => {
    it("gives measured with the units and blocked false", () => {
      const run = runResult({ stdout: reportJson(), stderr: "warning: V6 [warning]: limit" });

      expect(classifyRun(run, relativePath)).toEqual({
        kind: "measured",
        units: [unit],
        blocked: false,
      });
    });

    it("gives measured with blocked true and ignores exit code 1", () => {
      const run = runResult({ stdout: reportJson({ blocked: true }), exitCode: 1 });

      expect(classifyRun(run, relativePath)).toEqual({
        kind: "measured",
        units: [unit],
        blocked: true,
      });
    });

    it("keeps a decimal total", () => {
      const outcome = classifyRun(runResult({ stdout: reportJson() }), relativePath);

      expect(outcome).toMatchObject({ units: [{ total: 16.5 }] });
    });
  });

  describe("rule 6: the error line names a file that the configuration does not cover", () => {
    it.each([
      "cdd: src/order.ts is excluded by the configuration",
      "cdd: src/order.ts: no configured language claims this file",
      "cdd: ../order.ts is outside ., the directory of the configuration",
    ])("gives not-applicable for %j", (errorLine) => {
      expect(classifyStderr(`${errorLine}\n`)).toEqual({ kind: "not-applicable" });
    });
  });

  describe("rule 7: the configuration was deleted during the run", () => {
    it("gives failed", () => {
      const stderr = "cdd: config: open cdd.config.yaml: no such file or directory\n";

      expect(classifyStderr(stderr)).toEqual({ kind: "failed" });
    });
  });

  describe("rule 8: the configuration is not valid", () => {
    it("gives config-error for YAML that the CLI cannot parse", () => {
      const stderr = "cdd: config: cdd.config.yaml: yaml: line 1: did not find expected ']'\n";

      expect(classifyStderr(stderr)).toEqual({ kind: "config-error" });
    });

    it("gives config-error when validation lines follow the error line", () => {
      const stderr = "cdd: cdd.config.yaml is invalid:\nV6 [error]: limit 0 must be >= 1\n";

      expect(classifyStderr(stderr)).toEqual({ kind: "config-error" });
    });
  });

  describe("rule 9: all other cases", () => {
    it("gives failed for an unknown error line", () => {
      const stderr = "cdd: src/order.ts: no such file or directory\n";

      expect(classifyStderr(stderr)).toEqual({ kind: "failed" });
    });

    it("gives failed when stderr has no error line", () => {
      expect(classifyStderr("warning: something\n")).toEqual({ kind: "failed" });
    });

    it("gives failed for stdout that is not JSON", () => {
      const run = runResult({ stdout: "Report written to cdd-report.json\n" });

      expect(classifyRun(run, relativePath)).toEqual({ kind: "failed" });
    });

    it("gives failed for a report that fails validation", () => {
      const invalidReport = reportJson().replace('"total":16.5', '"total":"16.5"');
      const run = runResult({ stdout: invalidReport });

      expect(invalidReport).toContain('"total":"16.5"');
      expect(classifyRun(run, relativePath)).toEqual({ kind: "failed" });
    });
  });

  it("uses the last error line of stderr", () => {
    const stderr = [
      "cdd: config: cdd.config.yaml: yaml: line 1",
      "warning: note",
      "cdd: src/order.ts is excluded by the configuration",
      "",
    ].join("\r\n");

    expect(classifyStderr(stderr)).toEqual({ kind: "not-applicable" });
  });
});
