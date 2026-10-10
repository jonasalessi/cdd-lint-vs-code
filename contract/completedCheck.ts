import { execFile } from "node:child_process";
import { runCddCheck, type RunResult } from "../src/analysis/runCddCheck";
import { cddBinaryPath } from "./cddBinaryPath";

export type CheckTarget = {
  configDir: string;
  relativePath: string;
};

export async function runCompletedCheck(target: CheckTarget): Promise<RunResult> {
  const signal = new AbortController().signal;
  const checkRun = await runCddCheck({ binaryPath: cddBinaryPath(), ...target, signal }, execFile);
  if (checkRun.kind === "completed") {
    return checkRun.result;
  }
  throw new Error("The run was aborted.");
}
