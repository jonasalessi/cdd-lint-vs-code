import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BinaryResolver, type CacheClearCause } from "./BinaryResolver";
import {
  createExecFileFake,
  exitOneResponse,
  notExecutableResponse,
  timeoutResponse,
  validResponse,
  type ExecFileFake,
  type FakeResponse,
} from "./execFileFake";
import { managedBinaryPath } from "./managedBinaryPath";

describe("BinaryResolver", () => {
  let root: string;
  let pathDirectory: string;
  let storageDir: string;
  let configuredPath: string;
  let cddOnPath: string;
  let cddLintOnPath: string;
  let managedPath: string;
  let binaryPathSetting: string;
  let fake: ExecFileFake;
  let infoMessages: string[];
  let warnMessages: string[];

  function createResolver(): BinaryResolver {
    return new BinaryResolver({
      execFile: fake.execFile,
      getBinaryPathSetting: () => binaryPathSetting,
      getPathValue: () => pathDirectory,
      platform: "linux",
      storageDir,
      log: {
        info: (message) => infoMessages.push(message),
        warn: (message) => warnMessages.push(message),
      },
    });
  }

  function putOnPath(filePath: string, response: FakeResponse): void {
    writeFileSync(filePath, "");
    fake.respond(filePath, response);
  }

  function startedFiles(): string[] {
    return fake.calls.map((call) => call.file);
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cdd-resolver-")));
    pathDirectory = join(root, "path");
    storageDir = join(root, "storage");
    mkdirSync(pathDirectory);
    configuredPath = join(root, "configured", "cdd");
    cddOnPath = join(pathDirectory, "cdd");
    cddLintOnPath = join(pathDirectory, "cdd-lint");
    managedPath = managedBinaryPath({ storageDir, platform: "linux" });
    binaryPathSetting = "";
    fake = createExecFileFake();
    infoMessages = [];
    warnMessages = [];
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe("the order of the four candidates", () => {
    beforeEach(() => {
      putOnPath(cddOnPath, validResponse);
      putOnPath(cddLintOnPath, validResponse);
      fake.respond(managedPath, validResponse);
      fake.respond(configuredPath, validResponse);
    });

    it("uses cdd.binaryPath first", async () => {
      binaryPathSetting = configuredPath;

      expect(await createResolver().resolve()).toEqual({
        kind: "resolved",
        binaryPath: configuredPath,
      });
      expect(startedFiles()).toEqual([configuredPath]);
    });

    it("uses cdd on PATH second", async () => {
      expect(await createResolver().resolve()).toEqual({ kind: "resolved", binaryPath: cddOnPath });
      expect(startedFiles()).toEqual([cddOnPath]);
    });

    it("uses cdd-lint on PATH third", async () => {
      rmSync(cddOnPath);

      expect(await createResolver().resolve()).toEqual({
        kind: "resolved",
        binaryPath: cddLintOnPath,
      });
      expect(startedFiles()).toEqual([cddLintOnPath]);
    });

    it("uses the managed binary last", async () => {
      rmSync(cddOnPath);
      rmSync(cddLintOnPath);

      expect(await createResolver().resolve()).toEqual({
        kind: "resolved",
        binaryPath: managedPath,
      });
      expect(startedFiles()).toEqual([managedPath]);
    });

    it("tries the three automatic candidates in order when each one is invalid", async () => {
      fake.respond(cddOnPath, exitOneResponse);
      fake.respond(cddLintOnPath, timeoutResponse);
      fake.respond(managedPath, notExecutableResponse);

      expect(await createResolver().resolve()).toEqual({ kind: "no-binary" });
      expect(startedFiles()).toEqual([cddOnPath, cddLintOnPath, managedPath]);
    });
  });

  describe("an invalid cdd.binaryPath", () => {
    beforeEach(() => {
      putOnPath(cddOnPath, validResponse);
      putOnPath(cddLintOnPath, validResponse);
      fake.respond(managedPath, validResponse);
    });

    it("stops the search", async () => {
      binaryPathSetting = configuredPath;
      fake.respond(configuredPath, exitOneResponse);

      expect(await createResolver().resolve()).toEqual({
        kind: "invalid-binary",
        failureClass: "not-cdd",
      });
      expect(startedFiles()).toEqual([configuredPath]);
    });

    it("gives not-absolute for a relative value and starts no process", async () => {
      binaryPathSetting = join("bin", "cdd");

      expect(await createResolver().resolve()).toEqual({
        kind: "invalid-binary",
        failureClass: "not-absolute",
      });
      expect(startedFiles()).toEqual([]);
    });

    it.each([
      ["not-found", { error: { code: "ENOENT" } }],
      ["not-executable", notExecutableResponse],
      ["timeout", timeoutResponse],
      ["not-cdd", { stdout: "git version 2.45.0\n" }],
      ["unsupported-version", { stdout: "cdd v0.0.9\n" }],
    ] as const)("gives the failure class %s", async (failureClass, response) => {
      binaryPathSetting = configuredPath;
      fake.respond(configuredPath, response);

      expect(await createResolver().resolve()).toEqual({ kind: "invalid-binary", failureClass });
    });
  });

  describe("an invalid automatic candidate", () => {
    it("continues from an invalid cdd on PATH to cdd-lint", async () => {
      putOnPath(cddOnPath, { stdout: "cdd v0.0.9\n" });
      putOnPath(cddLintOnPath, validResponse);

      expect(await createResolver().resolve()).toEqual({
        kind: "resolved",
        binaryPath: cddLintOnPath,
      });
      expect(startedFiles()).toEqual([cddOnPath, cddLintOnPath]);
    });

    it("logs the failure class of each invalid candidate", async () => {
      putOnPath(cddOnPath, { stdout: "cdd v0.0.9\n" });
      fake.respond(managedPath, timeoutResponse);

      await createResolver().resolve();

      expect(infoMessages).toEqual([
        `Binary candidate cdd on PATH (${cddOnPath}): unsupported-version`,
        "Binary candidate cdd-lint on PATH: not-found",
        `Binary candidate managed binary (${managedPath}): timeout`,
      ]);
    });

    it("gives no-binary when no candidate exists", async () => {
      expect(await createResolver().resolve()).toEqual({ kind: "no-binary" });
      expect(startedFiles()).toEqual([managedPath]);
    });
  });

  it("logs a warning for a dev build and uses it", async () => {
    putOnPath(cddOnPath, { stdout: "cdd dev (unknown, unknown)\n" });

    expect(await createResolver().resolve()).toEqual({ kind: "resolved", binaryPath: cddOnPath });
    expect(warnMessages).toEqual([
      `Binary candidate cdd on PATH (${cddOnPath}) is a development build: dev`,
    ]);
  });

  describe("the cache", () => {
    it("starts the process one time for two resolutions with no change", async () => {
      putOnPath(cddOnPath, validResponse);
      const resolver = createResolver();

      const first = await resolver.resolve();
      const second = await resolver.resolve();

      expect(second).toEqual(first);
      expect(fake.calls).toHaveLength(1);
    });

    it("does not cache a failed resolution", async () => {
      const resolver = createResolver();

      expect(await resolver.resolve()).toEqual({ kind: "no-binary" });
      putOnPath(cddOnPath, validResponse);

      expect(await resolver.resolve()).toEqual({ kind: "resolved", binaryPath: cddOnPath });
    });

    it("does not cache an invalid cdd.binaryPath", async () => {
      binaryPathSetting = configuredPath;
      const resolver = createResolver();

      await resolver.resolve();
      await resolver.resolve();

      expect(startedFiles()).toEqual([configuredPath, configuredPath]);
    });

    it("resolves again after the cache is cleared", async () => {
      putOnPath(cddOnPath, validResponse);
      fake.respond(configuredPath, validResponse);
      const resolver = createResolver();
      await resolver.resolve();

      binaryPathSetting = configuredPath;
      resolver.clearCache("setting-changed");

      expect(await resolver.resolve()).toEqual({ kind: "resolved", binaryPath: configuredPath });
    });

    it("does not cache a resolution that started before the cache was cleared", async () => {
      putOnPath(cddOnPath, validResponse);
      fake.respond(configuredPath, validResponse);
      const resolver = createResolver();

      const staleResolution = resolver.resolve();
      binaryPathSetting = configuredPath;
      resolver.clearCache("setting-changed");
      await staleResolution;

      expect(await resolver.resolve()).toEqual({ kind: "resolved", binaryPath: configuredPath });
    });

    it("tells each listener the cause of a cache clear", () => {
      const causes: CacheClearCause[] = [];
      const resolver = createResolver();
      resolver.onDidClearCache((cause) => causes.push(cause));

      resolver.clearCache("setting-changed");
      resolver.clearCache("run-start-failed");

      expect(causes).toEqual(["setting-changed", "run-start-failed"]);
    });

    it("does not tell a listener after its subscription is disposed", () => {
      const causes: CacheClearCause[] = [];
      const resolver = createResolver();
      const subscription = resolver.onDidClearCache((cause) => causes.push(cause));

      subscription.dispose();
      resolver.clearCache("installation-completed");

      expect(causes).toEqual([]);
    });
  });
});
