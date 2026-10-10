import { execFile as nodeExecFile } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  createExecFileFake,
  exitOneResponse,
  notExecutableResponse,
  timeoutResponse,
  validResponse,
  type FakeResponse,
} from "./execFileFake";
import { validateBinary, type ExecFileFunction } from "./validateBinary";

const binaryPath = join(tmpdir(), "bin", "cdd");

function validateWith(response: FakeResponse) {
  const fake = createExecFileFake();
  fake.respond(binaryPath, response);
  return validateBinary(binaryPath, fake.execFile);
}

describe("validateBinary", () => {
  it("runs the absolute path with the version argument and a 5 second limit", async () => {
    const fake = createExecFileFake();
    fake.respond(binaryPath, validResponse);

    await validateBinary(binaryPath, fake.execFile);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.file).toBe(binaryPath);
    expect(fake.calls[0]?.args).toEqual(["version"]);
    expect(fake.calls[0]?.options.timeout).toBe(5000);
  });

  it("gives a valid result with the version token", async () => {
    expect(await validateWith(validResponse)).toEqual({
      isValid: true,
      binaryPath,
      versionToken: "v0.1.0",
      isDevBuild: false,
    });
  });

  it("gives a valid result for a dev build and marks it", async () => {
    expect(await validateWith({ stdout: "cdd dev (unknown, unknown)\n" })).toEqual({
      isValid: true,
      binaryPath,
      versionToken: "dev",
      isDevBuild: true,
    });
  });

  describe("failure classes of plan section 3.5", () => {
    it("gives not-absolute for a relative path and starts no process", async () => {
      const fake = createExecFileFake();

      const validation = await validateBinary(join("bin", "cdd"), fake.execFile);

      expect(validation).toEqual({ isValid: false, failureClass: "not-absolute" });
      expect(fake.calls).toHaveLength(0);
    });

    it.each([
      ["not-found", "the file does not exist", { error: { code: "ENOENT" } }],
      ["not-found", "a part of the path is not a directory", { error: { code: "ENOTDIR" } }],
      ["not-executable", "the file has no execute permission", notExecutableResponse],
      ["not-executable", "the file has an unknown format", { error: { code: "ENOEXEC" } }],
      ["timeout", "the process was killed at the time limit", timeoutResponse],
      ["not-cdd", "the exit code is not 0", exitOneResponse],
      [
        "not-cdd",
        "the exit code is not 0 with a valid line",
        { ...validResponse, error: { code: 2 } },
      ],
      ["not-cdd", "the output does not match", { stdout: "git version 2.45.0\n" }],
      ["not-cdd", "the output is empty", { stdout: "" }],
      [
        "not-cdd",
        "the output is too large",
        { error: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" } },
      ],
      ["unsupported-version", "the release is earlier than v0.1.0", { stdout: "cdd v0.0.9\n" }],
    ] as const)("gives %s when %s", async (failureClass, _case, response) => {
      expect(await validateWith(response)).toEqual({ isValid: false, failureClass });
    });

    it("gives not-cdd when the process function throws", async () => {
      const throwingExecFile: ExecFileFunction = () => {
        throw Object.assign(new Error("invalid argument"), { code: "ERR_INVALID_ARG_VALUE" });
      };

      expect(await validateBinary(binaryPath, throwingExecFile)).toEqual({
        isValid: false,
        failureClass: "not-cdd",
      });
    });
  });

  describe.skipIf(process.platform === "win32")("with the Node execFile function", () => {
    const directory = mkdtempSync(join(tmpdir(), "cdd-validate-"));

    function createScript(name: string, mode: number): string {
      const scriptPath = join(directory, name);
      writeFileSync(scriptPath, "#!/bin/sh\necho 'cdd v0.1.0 (script)'\n");
      chmodSync(scriptPath, mode);
      return scriptPath;
    }

    afterAll(() => rmSync(directory, { recursive: true, force: true }));

    it("accepts an executable file that prints a supported version", async () => {
      const validation = await validateBinary(createScript("cdd", 0o755), nodeExecFile);

      expect(validation.isValid).toBe(true);
    });

    it("gives not-executable for a file with no execute permission", async () => {
      const validation = await validateBinary(createScript("cdd-plain", 0o644), nodeExecFile);

      expect(validation).toEqual({ isValid: false, failureClass: "not-executable" });
    });

    it("gives not-found for a file that does not exist", async () => {
      const validation = await validateBinary(join(directory, "missing"), nodeExecFile);

      expect(validation).toEqual({ isValid: false, failureClass: "not-found" });
    });
  });
});
