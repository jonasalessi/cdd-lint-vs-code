import type { RunOutcome } from "./classifyRun";
import { checkArguments, type CheckRequest, type RunResult } from "./runCddCheck";

export type ClassifiedRun = {
  request: CheckRequest;
  result: RunResult;
  outcome: RunOutcome;
};

const outcomesWithStderr = ["failed", "config-error"];

export function describeRun(run: ClassifiedRun): string {
  const { request, result, outcome } = run;
  const argumentList = JSON.stringify(checkArguments(request.relativePath));
  const exitCode = result.exitCode ?? "none";
  return (
    `Run ${request.binaryPath} ${argumentList} in ${request.configDir}: ` +
    `${result.durationMs} ms, exit code ${exitCode}, outcome ${outcome.kind}`
  );
}

export function describeRunFailure(run: ClassifiedRun): string | undefined {
  if (!outcomesWithStderr.includes(run.outcome.kind)) {
    return undefined;
  }
  const startError = run.result.startError?.message ?? "";
  return `stderr of the run: ${[run.result.stderr.trimEnd(), startError].filter(Boolean).join("\n")}`;
}
