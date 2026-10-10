import { execFile, type ExecFileException } from "node:child_process";

// Test-only runner for commands that are not "check", for example "version".

type ProcessRequest = {
  binaryPath: string;
  cwd: string;
  args: string[];
};

type ProcessOutput = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const timeLimitMs = 10_000;

export function runCdd(request: ProcessRequest): Promise<ProcessOutput> {
  const options = { cwd: request.cwd, timeout: timeLimitMs, shell: false };
  return new Promise((resolve) => {
    execFile(request.binaryPath, request.args, options, (error, stdout, stderr) =>
      resolve({ exitCode: exitCodeOf(error), stdout, stderr }),
    );
  });
}

function exitCodeOf(error: ExecFileException | null): number | null {
  if (error === null) {
    return 0;
  }
  return typeof error.code === "number" ? error.code : null;
}
