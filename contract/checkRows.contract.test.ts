import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyRun, type RunOutcome } from "../src/analysis/classifyRun";
import { parseReport } from "../src/analysis/parseReport";
import type { RunResult } from "../src/analysis/runCddCheck";
import { runCompletedCheck } from "./completedCheck";
import { copyFixture, removeFixtureCopy } from "./fixtureCopy";

type FixtureRun = {
  fixture: string;
  relativePath: string;
  configDir?: string;
};

type ReportRow = FixtureRun & {
  row: string;
  exitCode: number;
  outcome: unknown;
};

type ErrorRow = FixtureRun & {
  row: string;
  errorLine: RegExp;
  outcome: RunOutcome;
};

type ClassifiedRun = { run: RunResult; outcome: RunOutcome };

const orderUnit = { name: "Order", kind: "class", line: 1 };
const anyNumber = expect.any(Number) as unknown;

const reportRows: ReportRow[] = [
  {
    row: "violation, blocking",
    fixture: "violation-blocking",
    relativePath: "src/order.ts",
    exitCode: 1,
    outcome: {
      kind: "measured",
      blocked: true,
      units: [{ ...orderUnit, exceeds: true, limit: 7, total: anyNumber }],
    },
  },
  {
    row: "violation, not blocking",
    fixture: "violation-not-blocking",
    relativePath: "src/order.ts",
    exitCode: 0,
    outcome: {
      kind: "measured",
      blocked: false,
      units: [{ ...orderUnit, exceeds: true, limit: 3, total: anyNumber }],
    },
  },
  {
    row: "no violation",
    fixture: "no-violation",
    relativePath: "src/order.ts",
    exitCode: 0,
    outcome: {
      kind: "measured",
      blocked: false,
      units: [{ ...orderUnit, exceeds: false, limit: 10, total: anyNumber }],
    },
  },
  {
    row: "source file with a syntax error",
    fixture: "syntax-error",
    relativePath: "src/broken.ts",
    exitCode: 0,
    outcome: {
      kind: "not-measured",
      reason: "file-warnings",
      warnings: [expect.stringMatching(/^syntax error at \d+:\d+$/)],
    },
  },
  {
    row: "file with no code units",
    fixture: "no-code-units",
    relativePath: "src/empty.ts",
    exitCode: 0,
    outcome: { kind: "measured", units: [], blocked: false },
  },
  {
    row: "timeout of the configuration",
    fixture: "config-timeout",
    relativePath: "src/order.ts",
    exitCode: 2,
    outcome: { kind: "not-measured", reason: "partial" },
  },
];

const errorRows: ErrorRow[] = [
  {
    row: "file excluded by exclude",
    fixture: "file-excluded",
    relativePath: "src/excluded/order.ts",
    errorLine: /^cdd: src\/excluded\/order\.ts is excluded by the configuration$/,
    outcome: { kind: "not-applicable" },
  },
  {
    row: "language not configured",
    fixture: "language-not-configured",
    relativePath: "src/main.go",
    errorLine: /^cdd: src\/main\.go: no configured language claims this file$/,
    outcome: { kind: "not-applicable" },
  },
  {
    row: "file outside the configuration directory",
    fixture: "file-outside-config-dir",
    configDir: "project",
    relativePath: "../order.ts",
    errorLine: /^cdd: \.\.\/order\.ts is outside \., the directory of the configuration$/,
    outcome: { kind: "not-applicable" },
  },
  {
    row: "file does not exist",
    fixture: "file-missing",
    relativePath: "src/missing.ts",
    errorLine: /^cdd: src\/missing\.ts: /,
    outcome: { kind: "failed" },
  },
  {
    row: "configuration missing",
    fixture: "config-missing",
    relativePath: "src/order.ts",
    errorLine: /^cdd: config: open cdd\.config\.yaml: /,
    outcome: { kind: "failed" },
  },
  {
    row: "configuration is invalid YAML",
    fixture: "config-invalid-yaml",
    relativePath: "src/order.ts",
    errorLine: /^cdd: config: cdd\.config\.yaml: yaml: /,
    outcome: { kind: "config-error" },
  },
  {
    row: "configuration fails validation",
    fixture: "config-fails-validation",
    relativePath: "src/order.ts",
    errorLine: /^cdd: cdd\.config\.yaml is invalid:$/,
    outcome: { kind: "config-error" },
  },
];

function orderRun(fixture: string): FixtureRun {
  return { fixture, relativePath: "src/order.ts" };
}

async function runInFixtureCopy(fixtureRun: FixtureRun): Promise<RunResult> {
  const copyDir = await copyFixture(fixtureRun.fixture);
  try {
    return await runCompletedCheck({
      configDir: join(copyDir, fixtureRun.configDir ?? "."),
      relativePath: fixtureRun.relativePath,
    });
  } finally {
    await removeFixtureCopy(copyDir);
  }
}

async function classifyFixture(fixtureRun: FixtureRun): Promise<ClassifiedRun> {
  const run = await runInFixtureCopy(fixtureRun);
  return { run, outcome: classifyRun(run, fixtureRun.relativePath) };
}

function cddLines(stderr: string): string[] {
  return stderr.split(/\r?\n/).filter((line) => line.startsWith("cdd: "));
}

describe("cdd check, rows of plan section 2.2 with a report on stdout", () => {
  it.each(reportRows)("$row", async (reportRow) => {
    const { run, outcome } = await classifyFixture(reportRow);

    expect(run.exitCode).toBe(reportRow.exitCode);
    expect(parseReport(run.stdout)).toBeDefined();
    expect(outcome).toMatchObject(reportRow.outcome as object);
  });

  it("violation, blocking: the report has blocked true", async () => {
    const run = await runInFixtureCopy(orderRun("violation-blocking"));

    expect(parseReport(run.stdout)).toMatchObject({ blocked: true, partial: false });
    expect(cddLines(run.stderr)).toEqual([]);
  });

  it("violation, blocking: each unit has the occurrences of --explain", async () => {
    const run = await runInFixtureCopy(orderRun("violation-blocking"));

    const occurrences = parseReport(run.stdout)?.files[0]?.units[0]?.occurrences ?? [];

    // Line 4 of the fixture is "    for (const item of items) {", and the loop ends on line 10.
    expect(occurrences[0]).toMatchObject({
      metric: "code_branch",
      line: 4,
      col: 5,
      end_line: 10,
      end_col: 6,
      count: 1,
      score: 1,
    });
    expect(occurrences.map((occurrence) => occurrence.metric).sort()).toEqual([
      ...Array<string>(4).fill("code_branch"),
      ...Array<string>(4).fill("condition"),
    ]);
  });

  it("violation, not blocking: a warning line on stderr is not a failure", async () => {
    const run = await runInFixtureCopy(orderRun("violation-not-blocking"));

    expect(run.stderr).toMatch(/^warning: /);
    expect(cddLines(run.stderr)).toEqual([]);
  });

  it("file with no code units: the report has an empty files array", async () => {
    const run = await runInFixtureCopy({ fixture: "no-code-units", relativePath: "src/empty.ts" });

    expect(parseReport(run.stdout)?.files).toEqual([]);
  });

  it("timeout of the configuration: the report is partial and stderr has an error line", async () => {
    const run = await runInFixtureCopy(orderRun("config-timeout"));

    expect(parseReport(run.stdout)?.partial).toBe(true);
    expect(cddLines(run.stderr).at(-1)).toMatch(/^cdd: timeout of .+ elapsed; /);
  });
});

describe("cdd check, rows of plan section 2.2 with an error", () => {
  it.each(errorRows)("$row", async (errorRow) => {
    const { run, outcome } = await classifyFixture(errorRow);

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe("");
    expect(cddLines(run.stderr).at(-1)).toMatch(errorRow.errorLine);
    expect(outcome).toEqual(errorRow.outcome);
  });

  it("configuration fails validation: V lines follow the error line", async () => {
    const run = await runInFixtureCopy(orderRun("config-fails-validation"));

    expect(run.stderr).toMatch(/^V\d+ \[error\]: /m);
  });
});

describe("cdd check, row of plan section 2.2 with reporter.outputFile", () => {
  it("reporter.outputFile is set: stdout is not a valid report", async () => {
    const run = await runInFixtureCopy(orderRun("output-file-configured"));

    expect(parseReport(run.stdout)).toBeUndefined();
  });
});
