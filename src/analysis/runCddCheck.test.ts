import { execFile as nodeExecFile, type ExecFileException } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  runCddCheck,
  type CheckExecFile,
  type CheckExecFileCallback,
  type CheckRequest,
  type CheckRunOptions,
} from "./runCddCheck";

type FakeCall = {
  file: string;
  args: readonly string[];
  options: CheckRunOptions;
  finish: CheckExecFileCallback;
};

type ProcessEnd = {
  error?: Partial<ExecFileException>;
  stdout?: string;
  stderr?: string;
};

const binaryPath = join(tmpdir(), "bin", "cdd");
const configDir = join(tmpdir(), "project");
const relativePath = "src/order service.ts";

function request(signal = new AbortController().signal): CheckRequest {
  return { binaryPath, configDir, relativePath, signal };
}

function createPendingExecFile() {
  const calls: FakeCall[] = [];
  const execFile: CheckExecFile = (file, args, options, finish) => {
    calls.push({ file, args, options, finish });
  };
  return { execFile, calls };
}

function endingWith(end: ProcessEnd): CheckExecFile {
  return (_file, _args, _options, finish) => {
    const error = end.error ? Object.assign(new Error("run failed"), end.error) : null;
    finish(error, end.stdout ?? "", end.stderr ?? "");
  };
}

async function resultOf(end: ProcessEnd) {
  const checkRun = await runCddCheck(request(), endingWith(end));
  if (checkRun.kind === "aborted") {
    throw new Error("The run was aborted.");
  }
  return checkRun.result;
}

describe("runCddCheck", () => {
  describe("process start", () => {
    it("runs the binary with the exact argument list of plan section 2.1", async () => {
      const fake = createPendingExecFile();

      void runCddCheck(request(), fake.execFile);
      await Promise.resolve();

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.file).toBe(binaryPath);
      expect(fake.calls[0]?.args).toEqual([
        "check",
        relativePath,
        "--all",
        "--explain",
        "--format",
        "json",
      ]);
    });

    it("uses the configuration directory, no shell, and the 10 second limit", async () => {
      const fake = createPendingExecFile();
      const signal = new AbortController().signal;

      void runCddCheck(request(signal), fake.execFile);
      await Promise.resolve();

      expect(fake.calls[0]?.options).toEqual({
        cwd: configDir,
        timeout: 10_000,
        killSignal: "SIGKILL",
        signal,
        shell: false,
        windowsHide: true,
        encoding: "utf8",
      });
    });
  });

  describe("runner result of plan section 3.7", () => {
    it("gives exit code 0 with the two streams", async () => {
      const result = await resultOf({ stdout: "{}", stderr: "warning: slow\n" });

      expect(result).toEqual({
        stdout: "{}",
        stderr: "warning: slow\n",
        exitCode: 0,
        durationMs: expect.any(Number) as unknown,
        wasKilled: false,
        startError: undefined,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it.each([1, 2])("gives exit code %i with the two streams", async (exitCode) => {
      const result = await resultOf({
        error: { code: exitCode },
        stdout: "{}",
        stderr: "cdd: x\n",
      });

      expect(result).toMatchObject({ exitCode, stdout: "{}", stderr: "cdd: x\n" });
      expect(result).toMatchObject({ wasKilled: false, startError: undefined });
    });

    it("gives wasKilled when the process is killed at the time limit", async () => {
      const result = await resultOf({ error: { killed: true, signal: "SIGKILL" } });

      expect(result).toMatchObject({ wasKilled: true, exitCode: null, startError: undefined });
    });

    it.each(["ENOENT", "EACCES"])("gives the start error %s", async (code) => {
      const result = await resultOf({ error: { code } });

      expect(result.startError?.code).toBe(code);
      expect(result).toMatchObject({ wasKilled: false, exitCode: null });
    });

    it("gives no start error when the output is too large", async () => {
      const result = await resultOf({ error: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" } });

      expect(result).toMatchObject({ startError: undefined, wasKilled: false, exitCode: null });
    });

    it("gives no start error and no exit code when the process function throws", async () => {
      const throwingExecFile: CheckExecFile = () => {
        throw Object.assign(new Error("invalid argument"), { code: "ERR_INVALID_ARG_VALUE" });
      };

      const checkRun = await runCddCheck(request(), throwingExecFile);

      expect(checkRun).toMatchObject({
        kind: "completed",
        result: { exitCode: null, startError: undefined, wasKilled: false, stdout: "" },
      });
    });
  });

  describe("abort", () => {
    it("gives aborted, and no runner result, when the signal aborts during the run", async () => {
      const fake = createPendingExecFile();
      const controller = new AbortController();
      const pendingRun = runCddCheck(request(controller.signal), fake.execFile);

      controller.abort();
      const abortError = Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
        code: "ABORT_ERR",
      });
      fake.calls[0]?.finish(abortError, "", "");

      expect(await pendingRun).toEqual({ kind: "aborted" });
    });

    it("starts no process when the signal is aborted before the run", async () => {
      const fake = createPendingExecFile();
      const controller = new AbortController();
      controller.abort();

      expect(await runCddCheck(request(controller.signal), fake.execFile)).toEqual({
        kind: "aborted",
      });
      expect(fake.calls).toHaveLength(0);
    });
  });

  describe.skipIf(process.platform === "win32")("with the Node execFile function", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "cdd-run-check-")));

    function createScript(name: string, body: string): string {
      const scriptPath = join(directory, name);
      writeFileSync(scriptPath, `#!/bin/sh\n${body}\n`);
      chmodSync(scriptPath, 0o755);
      return scriptPath;
    }

    function runScript(scriptPath: string, signal = new AbortController().signal) {
      const scriptRequest = { binaryPath: scriptPath, configDir: directory, relativePath, signal };
      return runCddCheck(scriptRequest, nodeExecFile);
    }

    afterAll(() => rmSync(directory, { recursive: true, force: true }));

    it("passes the arguments with no shell and runs in the configuration directory", async () => {
      const echoScript = createScript("echo-cdd", 'pwd\nfor arg in "$@"; do echo "$arg"; done');

      const checkRun = await runScript(echoScript);

      expect(checkRun).toMatchObject({ kind: "completed", result: { exitCode: 0 } });
      expect(checkRun.kind === "completed" && checkRun.result.stdout.split("\n")).toEqual([
        directory,
        "check",
        relativePath,
        "--all",
        "--explain",
        "--format",
        "json",
        "",
      ]);
    });

    it("gives the exit code and the two streams of a failed run", async () => {
      const failingScript = createScript("fail-cdd", "echo 'cdd: no' >&2\nexit 1");

      expect(await runScript(failingScript)).toMatchObject({
        kind: "completed",
        result: { exitCode: 1, stdout: "", stderr: "cdd: no\n", wasKilled: false },
      });
    });

    it("gives aborted when the signal aborts a process that runs", async () => {
      const slowScript = createScript("slow-cdd", "exec sleep 30");
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);

      expect(await runScript(slowScript, controller.signal)).toEqual({ kind: "aborted" });
    });

    it("gives the start error ENOENT for a binary that does not exist", async () => {
      const checkRun = await runScript(join(directory, "missing"));

      expect(checkRun.kind === "completed" && checkRun.result.startError?.code).toBe("ENOENT");
    });

    it("gives the start error EACCES for a file with no execute permission", async () => {
      const plainFile = createScript("plain-cdd", "exit 0");
      chmodSync(plainFile, 0o644);

      const checkRun = await runScript(plainFile);

      expect(checkRun.kind === "completed" && checkRun.result.startError?.code).toBe("EACCES");
    });
  });
});
