import { parseReport } from "./parseReport";
import type { CddReport, CddUnit } from "./report";
import type { RunResult } from "./runCddCheck";

export type RunOutcome =
  | { kind: "measured"; units: CddUnit[]; blocked: boolean }
  | { kind: "not-measured"; reason: "partial" }
  | { kind: "not-measured"; reason: "file-warnings"; warnings: string[] }
  | { kind: "not-applicable" }
  | { kind: "config-error" }
  | { kind: "failed" };

const errorLinePrefix = "cdd: ";
const missingConfigPrefix = "cdd: config: open";
const configErrorPrefix = "cdd: config:";
const invalidConfigText = "is invalid:";
const notApplicableTexts = [
  "is excluded by the configuration",
  "no configured language claims this file",
  "the directory of the configuration",
];

export function classifyRun(run: RunResult, relativePath: string): RunOutcome {
  if (run.wasKilled || run.startError !== undefined) {
    return { kind: "failed" };
  }
  const report = parseReport(run.stdout);
  return report
    ? classifyReport(report, relativePath)
    : classifyErrorLine(findErrorLine(run.stderr));
}

function classifyReport(report: CddReport, relativePath: string): RunOutcome {
  if (report.partial) {
    return { kind: "not-measured", reason: "partial" };
  }
  const fileEntry = report.files.find((file) => file.path === relativePath);
  if (fileEntry === undefined) {
    return { kind: "measured", units: [], blocked: false };
  }
  const warnings = fileEntry.warnings ?? [];
  return warnings.length > 0
    ? { kind: "not-measured", reason: "file-warnings", warnings }
    : { kind: "measured", units: fileEntry.units, blocked: report.blocked };
}

function findErrorLine(stderr: string): string {
  const errorLines = stderr.split(/\r?\n/).filter((line) => line.startsWith(errorLinePrefix));
  return errorLines.at(-1) ?? "";
}

function classifyErrorLine(errorLine: string): RunOutcome {
  if (notApplicableTexts.some((text) => errorLine.includes(text))) {
    return { kind: "not-applicable" };
  }
  if (errorLine.startsWith(missingConfigPrefix)) {
    return { kind: "failed" };
  }
  return isConfigError(errorLine) ? { kind: "config-error" } : { kind: "failed" };
}

function isConfigError(errorLine: string): boolean {
  return errorLine.startsWith(configErrorPrefix) || errorLine.includes(invalidConfigText);
}
