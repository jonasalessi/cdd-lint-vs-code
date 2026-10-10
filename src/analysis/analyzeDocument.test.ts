import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { BinaryResolution, CacheClearCause } from "../binary/BinaryResolver";
import type { ConfigResolution } from "../config/ConfigResolver";
import {
  analyzeDocument,
  type AnalysisDependencies,
  type AnalysisResult,
  type AnalysisTarget,
} from "./analyzeDocument";
import { recordOfState } from "./documentRecord";
import type { CddUnit } from "./report";
import type { CheckRequest, CheckRun, RunResult } from "./runCddCheck";

const workspaceFolderPath = join("/", "workspace");
const configDir = join(workspaceFolderPath, "app");
const configPath = join(configDir, "cdd.config.yaml");
const documentPath = join(configDir, "src", "order service.ts");
const relativePath = "src/order service.ts";
const binaryPath = join("/", "opt", "bin", "cdd");
const configNotice = { configPath, workspaceFolderPath };

const unit: CddUnit = {
  name: "Order",
  kind: "class",
  line: 3,
  col: 1,
  total: 16.5,
  limit: 10,
  exceeds: true,
  metrics: [{ metric: "code_branch", count: 2, score: 2 }],
};

function reportWith(fileEntry: object, reportFields: object = {}): string {
  const files = [{ path: relativePath, language: "typescript", units: [], ...fileEntry }];
  return JSON.stringify({ blocked: false, partial: false, files, ...reportFields });
}

function completedRun(result: Partial<RunResult>): CheckRun {
  const completeResult: RunResult = {
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 12,
    wasKilled: false,
    startError: undefined,
    ...result,
  };
  return { kind: "completed", result: completeResult };
}

function startError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`spawn ${binaryPath} ${code}`), { code });
}

describe("analyzeDocument", () => {
  let configResolution: ConfigResolution;
  let binaryResolution: BinaryResolution;
  let checkRun: CheckRun;
  let abortController: AbortController;
  let checkRequests: CheckRequest[];
  let cacheClearCauses: CacheClearCause[];
  let notifications: unknown[][];
  let infoLines: string[];
  let errorLines: string[];

  function dependencies(): AnalysisDependencies {
    return {
      configResolver: { resolve: () => Promise.resolve(configResolution) },
      binaryResolver: {
        resolve: () => Promise.resolve(binaryResolution),
        clearCache: (cause) => cacheClearCauses.push(cause),
      },
      runCheck: (request) => {
        checkRequests.push(request);
        return Promise.resolve(checkRun);
      },
      notify: {
        noBinary: () => notifications.push(["noBinary"]),
        invalidBinary: (failureClass) => notifications.push(["invalidBinary", failureClass]),
        configNotValid: (notice) => notifications.push(["configNotValid", notice]),
        outputFileConfigured: (notice) => notifications.push(["outputFileConfigured", notice]),
      },
      log: {
        info: (message) => infoLines.push(message),
        error: (message) => errorLines.push(message),
      },
    };
  }

  function target(): AnalysisTarget {
    return { documentPath, workspaceFolderPath, signal: abortController.signal };
  }

  function analyze(): Promise<AnalysisResult> {
    return analyzeDocument(target(), dependencies());
  }

  async function recordOfAnalysis() {
    const result = await analyze();
    return result.kind === "record" ? result.record : undefined;
  }

  beforeEach(() => {
    configResolution = { kind: "resolved", configDir, configPath };
    binaryResolution = { kind: "resolved", binaryPath };
    checkRun = completedRun({ stdout: reportWith({ units: [unit] }) });
    abortController = new AbortController();
    checkRequests = [];
    cacheClearCauses = [];
    notifications = [];
    infoLines = [];
    errorLines = [];
  });

  describe("step 1: the configuration", () => {
    it("sets no-config and starts no run", async () => {
      configResolution = { kind: "no-config" };

      expect(await recordOfAnalysis()).toEqual(recordOfState("no-config"));
      expect(checkRequests).toEqual([]);
      expect(notifications).toEqual([]);
    });

    it("sets output-file-configured, starts no run, and notifies", async () => {
      configResolution = { kind: "output-file-configured", configPath };

      expect(await recordOfAnalysis()).toEqual(recordOfState("output-file-configured"));
      expect(checkRequests).toEqual([]);
      expect(notifications).toEqual([["outputFileConfigured", configNotice]]);
    });

    it("sets error for a configuration that cannot be parsed, starts no run, and notifies", async () => {
      configResolution = { kind: "unparsable", configPath };

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(checkRequests).toEqual([]);
      expect(notifications).toEqual([["configNotValid", configNotice]]);
    });

    it("does not resolve the binary when the configuration sets the record", async () => {
      configResolution = { kind: "no-config" };
      const withFailingBinaryResolver = dependencies();
      withFailingBinaryResolver.binaryResolver.resolve = () => {
        throw new Error("the binary must not be resolved");
      };

      const result = await analyzeDocument(target(), withFailingBinaryResolver);

      expect(result).toEqual({ kind: "record", record: recordOfState("no-config") });
    });
  });

  describe("step 2: the binary", () => {
    it("sets no-binary and starts no run", async () => {
      binaryResolution = { kind: "no-binary" };

      expect(await recordOfAnalysis()).toEqual(recordOfState("no-binary"));
      expect(checkRequests).toEqual([]);
      expect(notifications).toEqual([["noBinary"]]);
    });

    it("sets invalid-binary and starts no run", async () => {
      binaryResolution = { kind: "invalid-binary", failureClass: "not-cdd" };

      expect(await recordOfAnalysis()).toEqual(recordOfState("invalid-binary"));
      expect(checkRequests).toEqual([]);
      expect(notifications).toEqual([["invalidBinary", "not-cdd"]]);
    });
  });

  describe("step 3: the run", () => {
    it("runs the binary in the configuration directory with the relative POSIX path", async () => {
      await analyze();

      expect(checkRequests).toEqual([
        { binaryPath, configDir, relativePath, signal: abortController.signal },
      ]);
    });

    it("sets measured with the units and blocked", async () => {
      checkRun = completedRun({
        stdout: reportWith({ units: [unit] }, { blocked: true }),
        exitCode: 1,
      });

      expect(await recordOfAnalysis()).toEqual({
        state: "measured",
        units: [unit],
        blocked: true,
        isStale: false,
      });
      expect(notifications).toEqual([]);
    });

    it("sets not-applicable", async () => {
      const stderr = `cdd: ${relativePath} is excluded by the configuration\n`;
      checkRun = completedRun({ stderr, exitCode: 1 });

      expect(await recordOfAnalysis()).toEqual(recordOfState("not-applicable"));
      expect(notifications).toEqual([]);
    });

    it("sets warning with the first warning of the file", async () => {
      checkRun = completedRun({ stdout: reportWith({ warnings: ["syntax error at 3:14"] }) });

      expect(await recordOfAnalysis()).toEqual({
        ...recordOfState("warning"),
        detail: "syntax error at 3:14",
      });
      expect(notifications).toEqual([]);
    });

    it("sets error for a partial report", async () => {
      checkRun = completedRun({ stdout: reportWith({}, { partial: true }), exitCode: 2 });

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(notifications).toEqual([]);
    });

    it("sets error for a failed run", async () => {
      checkRun = completedRun({ stderr: "panic: unexpected\n", exitCode: 2 });

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(notifications).toEqual([]);
    });

    it("sets error for a configuration error and notifies", async () => {
      const stderr = "cdd: cdd.config.yaml is invalid:\nV3 [error]: limit\n";
      checkRun = completedRun({ stderr, exitCode: 1 });

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(notifications).toEqual([["configNotValid", configNotice]]);
    });
  });

  describe("failed runs show no notification", () => {
    const failedRuns: [string, Partial<RunResult>][] = [
      ["a run that was killed", { exitCode: null, wasKilled: true }],
      ["a run that cannot start", { exitCode: null, startError: startError("ENOENT") }],
      [
        "a configuration that was deleted during the run",
        { stderr: "cdd: config: open cdd.config.yaml: no such file or directory\n", exitCode: 1 },
      ],
    ];

    it.each(failedRuns)("%s", async (_name, result) => {
      checkRun = completedRun(result);

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(notifications).toEqual([]);
    });
  });

  describe("a run that cannot start", () => {
    it.each(["ENOENT", "EACCES"])("clears the binary cache for %s and sets error", async (code) => {
      checkRun = completedRun({ exitCode: null, startError: startError(code) });

      expect(await recordOfAnalysis()).toEqual(recordOfState("error"));
      expect(cacheClearCauses).toEqual(["run-start-failed"]);
      expect(checkRequests).toHaveLength(1);
    });

    it("keeps the binary cache for a run that started", async () => {
      checkRun = completedRun({ stderr: "panic: unexpected\n", exitCode: 2 });

      await analyze();

      expect(cacheClearCauses).toEqual([]);
    });
  });

  describe("logging", () => {
    it("logs the run with its outcome", async () => {
      await analyze();

      expect(infoLines).toEqual([
        `Run ${binaryPath} ["check","${relativePath}","--all","--format","json"] ` +
          `in ${configDir}: 12 ms, exit code 0, outcome measured`,
      ]);
      expect(errorLines).toEqual([]);
    });

    it("logs the stderr of a failed run", async () => {
      checkRun = completedRun({ stderr: "panic: unexpected\n", exitCode: 2 });

      await analyze();

      expect(errorLines).toEqual(["stderr of the run: panic: unexpected"]);
    });

    it("logs the stderr of a run with a configuration error", async () => {
      checkRun = completedRun({ stderr: "cdd: config: a.yaml: yaml: line 2\n", exitCode: 1 });

      await analyze();

      expect(errorLines).toEqual(["stderr of the run: cdd: config: a.yaml: yaml: line 2"]);
    });
  });

  describe("an aborted pipeline", () => {
    it("gives no record and logs nothing when the run was aborted", async () => {
      checkRun = { kind: "aborted" };

      expect(await analyze()).toEqual({ kind: "aborted" });
      expect(infoLines).toEqual([]);
      expect(errorLines).toEqual([]);
      expect(notifications).toEqual([]);
    });

    it("gives no record and no notification when it was aborted before the configuration step ended", async () => {
      configResolution = { kind: "unparsable", configPath };
      abortController.abort();

      expect(await analyze()).toEqual({ kind: "aborted" });
      expect(notifications).toEqual([]);
    });

    it("starts no run when it was aborted before the binary step ended", async () => {
      const withAbortDuringBinaryStep = dependencies();
      withAbortDuringBinaryStep.binaryResolver.resolve = () => {
        abortController.abort();
        return Promise.resolve(binaryResolution);
      };

      const result = await analyzeDocument(target(), withAbortDuringBinaryStep);

      expect(result).toEqual({ kind: "aborted" });
      expect(checkRequests).toEqual([]);
    });
  });

  describe("an unexpected error", () => {
    it("sets error and logs the error", async () => {
      const withFailingConfigResolver = dependencies();
      withFailingConfigResolver.configResolver.resolve = () => Promise.reject(new Error("EIO"));

      const result = await analyzeDocument(target(), withFailingConfigResolver);

      expect(result).toEqual({ kind: "record", record: recordOfState("error") });
      expect(errorLines).toEqual([`The analysis of ${documentPath} failed: Error: EIO`]);
    });
  });
});
