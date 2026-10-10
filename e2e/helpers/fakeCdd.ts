import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as vscode from "vscode";
import { waitFor } from "./waitFor";

export type FakeResponse = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
};

export type FakeOccurrence = {
  metric: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
  count: number;
  score: number;
};

export type FakeUnit = {
  name: string;
  kind: string;
  line: number;
  col: number;
  total: number;
  limit: number;
  exceeds: boolean;
  metrics: { metric: string; count: number; score: number }[];
  occurrences?: FakeOccurrence[];
};

type ReportOptions = {
  blocked?: boolean;
  warnings?: string[];
};

const repositoryRoot = resolve(__dirname, "..", "..", "..");
const runPrefix = "check";

export const fakeCddPath = join(repositoryRoot, "e2e", "fake-cdd", "cdd");

let stateDir: string | undefined;

// Call it in suiteSetup. It makes the extension run the fake binary.
export async function installFakeCdd(): Promise<void> {
  stateDir = mkdtempSync(join(tmpdir(), "cdd-e2e-"));
  process.env.FAKE_CDD_RESPONSE = join(stateDir, "response.json");
  process.env.FAKE_CDD_LOG = join(stateDir, "calls.log");
  setFakeResponse({});
  resetCallLog();
  await setBinaryPath(fakeCddPath);
}

// Call it in suiteTeardown.
export async function uninstallFakeCdd(): Promise<void> {
  await setBinaryPath(undefined);
  delete process.env.FAKE_CDD_RESPONSE;
  delete process.env.FAKE_CDD_LOG;
  rmSync(requireStateDir(), { recursive: true, force: true });
  stateDir = undefined;
}

// cdd.binaryPath has the machine scope, so only the Global target has an effect.
export async function setBinaryPath(binaryPath: string | undefined): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("cdd");
  await configuration.update("binaryPath", binaryPath, vscode.ConfigurationTarget.Global);
}

// A second executable with a different path, for a test that changes cdd.binaryPath.
export function copyFakeCdd(): string {
  const copyPath = join(requireStateDir(), "cdd");
  copyFileSync(fakeCddPath, copyPath);
  chmodSync(copyPath, 0o755);
  return copyPath;
}

export function setFakeResponse(response: FakeResponse): void {
  writeFileSync(requireEnv("FAKE_CDD_RESPONSE"), JSON.stringify(response));
}

export function fakeUnit(name: string, line: number, fields: Partial<FakeUnit> = {}): FakeUnit {
  return {
    name,
    kind: "class",
    line,
    col: 1,
    total: 4,
    limit: 10,
    exceeds: false,
    metrics: [{ metric: "code_branch", count: 4, score: 4 }],
    ...fields,
  };
}

// The stdout of a run for one file. `relativePath` is relative to the configuration directory.
export function reportOf(relativePath: string, units: FakeUnit[], options: ReportOptions = {}) {
  const file = { path: relativePath, language: "typescript", units, warnings: options.warnings };
  return JSON.stringify({
    root: ".",
    blocked: options.blocked ?? false,
    filter: "all",
    explain: true,
    partial: false,
    elapsed_ms: 1,
    files: [file],
    summary: { units: units.length, violations: units.filter((unit) => unit.exceeds).length },
  });
}

export function resetCallLog(): void {
  writeFileSync(requireEnv("FAKE_CDD_LOG"), "");
}

// A run is a log line that starts with "check". The version lines are not runs.
export function readRuns(): string[] {
  const logPath = requireEnv("FAKE_CDD_LOG");
  const lines = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n") : [];
  return lines.filter((line) => line.startsWith(runPrefix));
}

export function runOf(relativePath: string): string {
  return `check ${relativePath} --all --explain --format json`;
}

// Waits until the call log has a minimum of `count` runs. Gives the runs.
export function waitForRuns(count: number): Promise<string[]> {
  return waitFor(`${count} runs in the call log, found ${readRuns().length}`, () => {
    const runs = readRuns();
    return runs.length >= count ? runs : undefined;
  });
}

function requireStateDir(): string {
  if (stateDir === undefined) {
    throw new Error("installFakeCdd was not called");
  }
  return stateDir;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set. Call installFakeCdd first.`);
  }
  return value;
}
