import { describe, expect, it } from "vitest";
import type { RunOutcome } from "./classifyRun";
import { describeRun, describeRunFailure, type ClassifiedRun } from "./describeRun";
import type { RunResult } from "./runCddCheck";

const request = {
  binaryPath: "/opt/bin/cdd",
  configDir: "/project/app",
  relativePath: "src/order service.ts",
  signal: new AbortController().signal,
};

function classifiedRun(outcome: RunOutcome, result: Partial<RunResult> = {}): ClassifiedRun {
  const completeResult: RunResult = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 12,
    wasKilled: false,
    startError: undefined,
    ...result,
  };
  return { request, result: completeResult, outcome };
}

describe("describeRun", () => {
  it("names the binary, the working directory, the arguments, the duration, the exit code and the outcome", () => {
    const run = classifiedRun({ kind: "measured", units: [], blocked: false }, { exitCode: 1 });

    expect(describeRun(run)).toBe(
      'Run /opt/bin/cdd ["check","src/order service.ts","--all","--explain","--format","json"] ' +
        "in /project/app: 12 ms, exit code 1, outcome measured",
    );
  });

  it("names a run that has no exit code", () => {
    const run = classifiedRun({ kind: "failed" }, { exitCode: null, wasKilled: true });

    expect(describeRun(run)).toContain("exit code none, outcome failed");
  });
});

describe("describeRunFailure", () => {
  it.each<RunOutcome>([{ kind: "failed" }, { kind: "config-error" }])(
    "gives the stderr for the outcome %j",
    (outcome) => {
      const run = classifiedRun(outcome, { stderr: "cdd: config: bad.yaml: yaml: line 2\n" });

      expect(describeRunFailure(run)).toBe(
        "stderr of the run: cdd: config: bad.yaml: yaml: line 2",
      );
    },
  );

  it("gives the start error of a run that did not start", () => {
    const startError = Object.assign(new Error("spawn /opt/bin/cdd ENOENT"), { code: "ENOENT" });

    const failure = describeRunFailure(classifiedRun({ kind: "failed" }, { startError }));

    expect(failure).toBe("stderr of the run: spawn /opt/bin/cdd ENOENT");
  });

  it.each<RunOutcome>([
    { kind: "measured", units: [], blocked: false },
    { kind: "not-applicable" },
    { kind: "not-measured", reason: "partial" },
  ])("gives nothing for the outcome %j", (outcome) => {
    const run = classifiedRun(outcome, { stderr: "warning: something\n" });

    expect(describeRunFailure(run)).toBeUndefined();
  });
});
