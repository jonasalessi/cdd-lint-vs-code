import type { ExecFileException } from "node:child_process";
import type { ExecFileFunction, VersionRunOptions } from "./validateBinary";

// Test double of execFile. A path with no response does not exist.

export type FakeResponse = {
  stdout?: string;
  error?: Partial<ExecFileException>;
};

export type FakeCall = {
  file: string;
  args: readonly string[];
  options: VersionRunOptions;
};

export type ExecFileFake = {
  execFile: ExecFileFunction;
  calls: FakeCall[];
  respond: (file: string, response: FakeResponse) => void;
};

export const validVersionOutput = "cdd v0.1.0 (8646c46, 2026-09-24T19:55:54Z)\n";

export const validResponse: FakeResponse = { stdout: validVersionOutput };
export const notFoundResponse: FakeResponse = { error: { code: "ENOENT" } };
export const notExecutableResponse: FakeResponse = { error: { code: "EACCES" } };
export const timeoutResponse: FakeResponse = { error: { killed: true, signal: "SIGKILL" } };
export const exitOneResponse: FakeResponse = { error: { code: 1 } };

export function createExecFileFake(): ExecFileFake {
  const responses = new Map<string, FakeResponse>();
  const calls: FakeCall[] = [];
  const execFile: ExecFileFunction = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const response = responses.get(file) ?? notFoundResponse;
    callback(toError(response), response.stdout ?? "", "");
  };
  return { execFile, calls, respond: (file, response) => responses.set(file, response) };
}

function toError(response: FakeResponse): ExecFileException | null {
  return response.error ? Object.assign(new Error("version run failed"), response.error) : null;
}
