import type { BinaryResolution, BinaryResolver } from "../binary/BinaryResolver";
import type { BinaryFailureClass } from "../binary/validateBinary";
import type { ConfigResolution, ConfigResolver } from "../config/ConfigResolver";
import { classifyRun } from "./classifyRun";
import { describeRun, describeRunFailure, type ClassifiedRun } from "./describeRun";
import { recordOfOutcome, recordOfState, type DocumentRecord } from "./documentRecord";
import { relativePosixPath } from "./relativePosixPath";
import type { CheckRequest, CheckRun, RunResult } from "./runCddCheck";

export type AnalysisTarget = {
  documentPath: string;
  workspaceFolderPath: string;
  signal: AbortSignal;
};

// The workspace folder gives the relative path that the messages of plan section 3.11 show.
export type ConfigNotice = {
  configPath: string;
  workspaceFolderPath: string;
};

export type AnalysisNotifications = {
  noBinary: () => void;
  invalidBinary: (failureClass: BinaryFailureClass) => void;
  configNotValid: (notice: ConfigNotice) => void;
  outputFileConfigured: (notice: ConfigNotice) => void;
};

export type AnalysisLog = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type AnalysisDependencies = {
  configResolver: Pick<ConfigResolver, "resolve">;
  binaryResolver: Pick<BinaryResolver, "resolve" | "clearCache">;
  runCheck: (request: CheckRequest) => Promise<CheckRun>;
  notify: AnalysisNotifications;
  log: AnalysisLog;
};

export type AnalysisResult = { kind: "record"; record: DocumentRecord } | { kind: "aborted" };

type ResolvedConfig = ConfigResolution & { kind: "resolved" };
type ConfigProblem = Exclude<ConfigResolution, ResolvedConfig>;
type BinaryProblem = Exclude<BinaryResolution, { kind: "resolved" }>;
type ResolvedRun = { target: AnalysisTarget; config: ResolvedConfig; binaryPath: string };

const startErrorCodes = ["ENOENT", "EACCES"];

export async function analyzeDocument(
  target: AnalysisTarget,
  dependencies: AnalysisDependencies,
): Promise<AnalysisResult> {
  try {
    const record = await runPipeline(target, dependencies);
    return record === undefined ? { kind: "aborted" } : { kind: "record", record };
  } catch (error) {
    dependencies.log.error(`The analysis of ${target.documentPath} failed: ${String(error)}`);
    return { kind: "record", record: recordOfState("error") };
  }
}

// The result undefined means that the pipeline was aborted.
async function runPipeline(
  target: AnalysisTarget,
  dependencies: AnalysisDependencies,
): Promise<DocumentRecord | undefined> {
  const { documentPath, workspaceFolderPath } = target;
  const config = await dependencies.configResolver.resolve({ documentPath, workspaceFolderPath });
  if (target.signal.aborted) {
    return undefined;
  }
  return config.kind === "resolved"
    ? analyzeWithConfig(target, config, dependencies)
    : recordOfConfigProblem(config, target, dependencies.notify);
}

function recordOfConfigProblem(
  config: ConfigProblem,
  target: AnalysisTarget,
  notify: AnalysisNotifications,
): DocumentRecord {
  if (config.kind === "no-config") {
    return recordOfState("no-config");
  }
  const notice = { configPath: config.configPath, workspaceFolderPath: target.workspaceFolderPath };
  if (config.kind === "output-file-configured") {
    notify.outputFileConfigured(notice);
    return recordOfState("output-file-configured");
  }
  notify.configNotValid(notice);
  return recordOfState("error");
}

async function analyzeWithConfig(
  target: AnalysisTarget,
  config: ResolvedConfig,
  dependencies: AnalysisDependencies,
): Promise<DocumentRecord | undefined> {
  const binary = await dependencies.binaryResolver.resolve();
  if (target.signal.aborted) {
    return undefined;
  }
  return binary.kind === "resolved"
    ? runAndClassify({ target, config, binaryPath: binary.binaryPath }, dependencies)
    : recordOfBinaryProblem(binary, dependencies.notify);
}

function recordOfBinaryProblem(
  binary: BinaryProblem,
  notify: AnalysisNotifications,
): DocumentRecord {
  if (binary.kind === "invalid-binary") {
    notify.invalidBinary(binary.failureClass);
  } else {
    notify.noBinary();
  }
  return recordOfState(binary.kind);
}

async function runAndClassify(
  resolved: ResolvedRun,
  dependencies: AnalysisDependencies,
): Promise<DocumentRecord | undefined> {
  const request = checkRequestOf(resolved);
  const run = await dependencies.runCheck(request);
  if (run.kind === "aborted") {
    return undefined;
  }
  const outcome = classifyRun(run.result, request.relativePath);
  reportRun({ request, result: run.result, outcome }, resolved, dependencies);
  return recordOfOutcome(outcome);
}

function checkRequestOf(resolved: ResolvedRun): CheckRequest {
  const { target, config, binaryPath } = resolved;
  const relativePath = relativePosixPath(config.configDir, target.documentPath);
  return { binaryPath, configDir: config.configDir, relativePath, signal: target.signal };
}

function reportRun(
  run: ClassifiedRun,
  resolved: ResolvedRun,
  dependencies: AnalysisDependencies,
): void {
  logRun(run, dependencies.log);
  if (didNotStart(run.result)) {
    dependencies.binaryResolver.clearCache("run-start-failed");
  }
  if (run.outcome.kind === "config-error") {
    dependencies.notify.configNotValid(configNoticeOf(resolved));
  }
}

function logRun(run: ClassifiedRun, log: AnalysisLog): void {
  log.info(describeRun(run));
  const failure = describeRunFailure(run);
  if (failure !== undefined) {
    log.error(failure);
  }
}

function didNotStart(result: RunResult): boolean {
  return startErrorCodes.includes(result.startError?.code ?? "");
}

function configNoticeOf(resolved: ResolvedRun): ConfigNotice {
  const { config, target } = resolved;
  return { configPath: config.configPath, workspaceFolderPath: target.workspaceFolderPath };
}
