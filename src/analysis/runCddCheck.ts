import type { ExecFileException } from "node:child_process";

export type CheckRequest = {
  binaryPath: string;
  configDir: string;
  relativePath: string;
  signal: AbortSignal;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  wasKilled: boolean;
  startError: NodeJS.ErrnoException | undefined;
};

export type CheckRun = { kind: "completed"; result: RunResult } | { kind: "aborted" };

export type CheckRunOptions = {
  cwd: string;
  timeout: number;
  killSignal: "SIGKILL";
  signal: AbortSignal;
  shell: false;
  windowsHide: boolean;
  encoding: "utf8";
};

export type CheckExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
) => void;

export type CheckExecFile = (
  file: string,
  args: readonly string[],
  options: CheckRunOptions,
  callback: CheckExecFileCallback,
) => unknown;

type ProcessOutput = {
  error: ExecFileException | null;
  stdout: string;
  stderr: string;
};

export const checkTimeLimitMs = 10_000;

const nodeErrorCodePrefix = "ERR_";

export async function runCddCheck(
  request: CheckRequest,
  execFile: CheckExecFile,
): Promise<CheckRun> {
  if (request.signal.aborted) {
    return { kind: "aborted" };
  }
  const startedAt = Date.now();
  const output = await execute(request, execFile);
  return request.signal.aborted
    ? { kind: "aborted" }
    : { kind: "completed", result: toRunResult(output, Date.now() - startedAt) };
}

export function checkArguments(relativePath: string): string[] {
  return ["check", relativePath, "--all", "--explain", "--format", "json"];
}

function execute(request: CheckRequest, execFile: CheckExecFile): Promise<ProcessOutput> {
  const args = checkArguments(request.relativePath);
  return new Promise((resolve) => {
    try {
      execFile(request.binaryPath, args, runOptionsOf(request), (error, stdout, stderr) =>
        resolve({ error, stdout, stderr }),
      );
    } catch (error) {
      resolve({ error: error as ExecFileException, stdout: "", stderr: "" });
    }
  });
}

function runOptionsOf(request: CheckRequest): CheckRunOptions {
  return {
    cwd: request.configDir,
    timeout: checkTimeLimitMs,
    killSignal: "SIGKILL",
    signal: request.signal,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
  };
}

function toRunResult(output: ProcessOutput, durationMs: number): RunResult {
  const { error, stdout, stderr } = output;
  return {
    stdout,
    stderr,
    exitCode: exitCodeOf(error),
    durationMs,
    wasKilled: error?.killed === true,
    startError: startErrorOf(error),
  };
}

function exitCodeOf(error: ExecFileException | null): number | null {
  if (error === null) {
    return 0;
  }
  return typeof error.code === "number" ? error.code : null;
}

// Node sets a system error code (ENOENT, EACCES) only when the process did not start.
function startErrorOf(error: ExecFileException | null): NodeJS.ErrnoException | undefined {
  const code = error?.code;
  const isStartError = typeof code === "string" && !code.startsWith(nodeErrorCodePrefix);
  return isStartError ? (error as NodeJS.ErrnoException) : undefined;
}
