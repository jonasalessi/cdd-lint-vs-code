import type { ExecFileException } from "node:child_process";
import { isAbsolute } from "node:path";
import { parseCddVersion } from "./parseCddVersion";

export type BinaryFailureClass =
  "not-absolute" | "not-found" | "not-executable" | "timeout" | "not-cdd" | "unsupported-version";

export type BinaryValidation =
  | { isValid: true; binaryPath: string; versionToken: string; isDevBuild: boolean }
  | { isValid: false; failureClass: BinaryFailureClass };

export type VersionRunOptions = {
  timeout: number;
  killSignal: "SIGKILL";
  windowsHide: boolean;
  encoding: "utf8";
};

export type ExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
) => void;

export type ExecFileFunction = (
  file: string,
  args: readonly string[],
  options: VersionRunOptions,
  callback: ExecFileCallback,
) => unknown;

type VersionRun = {
  error: ExecFileException | null;
  stdout: string;
};

export const versionTimeLimitMs = 5_000;

const versionRunOptions: VersionRunOptions = {
  timeout: versionTimeLimitMs,
  killSignal: "SIGKILL",
  windowsHide: true,
  encoding: "utf8",
};
const notFoundCodes = ["ENOENT", "ENOTDIR"];
const nodeErrorCodePrefix = "ERR_";

export async function validateBinary(
  binaryPath: string,
  execFile: ExecFileFunction,
): Promise<BinaryValidation> {
  if (isAbsolute(binaryPath)) {
    return validateVersionRun(binaryPath, await runVersion(binaryPath, execFile));
  }
  return invalid("not-absolute");
}

function runVersion(binaryPath: string, execFile: ExecFileFunction): Promise<VersionRun> {
  return new Promise((resolve) => {
    try {
      execFile(binaryPath, ["version"], versionRunOptions, (error, stdout) =>
        resolve({ error, stdout }),
      );
    } catch (error) {
      resolve({ error: error as ExecFileException, stdout: "" });
    }
  });
}

function validateVersionRun(binaryPath: string, run: VersionRun): BinaryValidation {
  if (run.error !== null) {
    return invalid(failureClassOf(run.error));
  }
  const version = parseCddVersion(run.stdout);
  return version.kind === "supported"
    ? { isValid: true, binaryPath, versionToken: version.token, isDevBuild: version.isDevBuild }
    : invalid(version.kind);
}

function failureClassOf(error: ExecFileException): BinaryFailureClass {
  if (error.killed === true) {
    return "timeout";
  }
  return isStartError(error.code) ? startFailureClassOf(error.code) : "not-cdd";
}

// Node sets a system error code (ENOENT, EACCES) only when the process did not start.
function isStartError(code: ExecFileException["code"]): code is string {
  return typeof code === "string" && !code.startsWith(nodeErrorCodePrefix);
}

function startFailureClassOf(code: string): BinaryFailureClass {
  return notFoundCodes.includes(code) ? "not-found" : "not-executable";
}

function invalid(failureClass: BinaryFailureClass): BinaryValidation {
  return { isValid: false, failureClass };
}
