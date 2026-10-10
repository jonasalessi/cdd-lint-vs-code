import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecFileFunction } from "../binary/validateBinary";
import type { ArchiveEntry } from "./archiveFixtures";
import { createHttpsGetFake } from "./httpsGetFake";
import { installManagedBinary, type InstallOutcome } from "./installManagedBinary";
import {
  binaryContent,
  cdnUrl,
  everyBinaryIsValid,
  goodTarEntries,
  goodZipEntries,
  noBinaryIsValid,
  onlyStagedBinaryIsValid,
  serveTarGz,
  serveZip,
  storageContentOf,
  withWrongChecksum,
  writeStorageFile,
  type ServedArchive,
} from "./installTestSupport";

type Installation = {
  outcome: InstallOutcome;
  requestedUrls: string[];
};

type InstallOptions = {
  execFile?: ExecFileFunction;
  platform?: NodeJS.Platform;
};

const existingStorage = {
  "bin/v0.1.0/cdd": "existing managed binary",
  "bin/v0.0.9/cdd": "older managed binary",
};

describe("installManagedBinary", () => {
  let tempDir: string;
  let storageDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cdd-install-"));
    storageDir = join(tempDir, "globalStorage");
  });

  afterEach(() => rm(tempDir, { recursive: true, force: true }));

  async function install(served: ServedArchive, options: InstallOptions = {}) {
    const fake = createHttpsGetFake(served.routes);
    const outcome = await installManagedBinary(
      { asset: served.asset, signal: new AbortController().signal },
      {
        storageDir,
        platform: options.platform ?? "linux",
        httpsGet: fake.httpsGet,
        execFile: options.execFile ?? onlyStagedBinaryIsValid,
      },
    );
    return { outcome, requestedUrls: fake.requestedUrls } satisfies Installation;
  }

  async function writeExistingStorage(): Promise<void> {
    for (const [relativePath, content] of Object.entries(existingStorage)) {
      await writeStorageFile(storageDir, relativePath, content);
    }
  }

  async function expectFailureThatInstallsNothing(served: ServedArchive, reason: string) {
    const emptyStorage = await install(served);
    expect(emptyStorage.outcome).toEqual({ kind: "failed", reason });
    expect(await storageContentOf(storageDir)).toEqual({});

    await writeExistingStorage();
    const before = await storageContentOf(storageDir);
    const filledStorage = await install(served);
    expect(filledStorage.outcome).toEqual({ kind: "failed", reason });
    expect(await storageContentOf(storageDir)).toEqual(before);
  }

  describe("a successful installation", () => {
    it("creates bin/v0.1.0/cdd from the .tar.gz asset and removes the staging directory", async () => {
      const { outcome, requestedUrls } = await install(serveTarGz(goodTarEntries));

      expect(outcome).toEqual({ kind: "installed" });
      expect(requestedUrls).toEqual([serveTarGz(goodTarEntries).asset.url, cdnUrl]);
      expect(await storageContentOf(storageDir)).toEqual({
        "bin/": "",
        "bin/v0.1.0/": "",
        "bin/v0.1.0/cdd": binaryContent,
      });
    });

    it("creates bin/v0.1.0/cdd.exe from the .zip asset", async () => {
      const { outcome } = await install(serveZip(goodZipEntries), { platform: "win32" });

      expect(outcome).toEqual({ kind: "installed" });
      expect(await storageContentOf(storageDir)).toEqual({
        "bin/": "",
        "bin/v0.1.0/": "",
        "bin/v0.1.0/cdd.exe": binaryContent,
      });
    });

    it.skipIf(process.platform === "win32")("sets the mode 0755", async () => {
      await install(serveTarGz(goodTarEntries));

      const { mode } = await stat(join(storageDir, "bin", "v0.1.0", "cdd"));
      expect(mode & 0o777).toBe(0o755);
    });

    it("removes the other directories of bin/ and replaces an invalid managed binary", async () => {
      await writeExistingStorage();
      await writeStorageFile(storageDir, "bin/v0.0.8/nested/cdd", "oldest");
      await writeStorageFile(storageDir, "bin/notes.txt", "a file, not a directory");

      const { outcome } = await install(serveTarGz(goodTarEntries));

      expect(outcome).toEqual({ kind: "installed" });
      expect(await storageContentOf(storageDir)).toEqual({
        "bin/": "",
        "bin/notes.txt": "a file, not a directory",
        "bin/v0.1.0/": "",
        "bin/v0.1.0/cdd": binaryContent,
      });
    });

    it("replaces a directory at the target path", async () => {
      await writeStorageFile(storageDir, "bin/v0.1.0/cdd/file", "the target is a directory");

      const { outcome } = await install(serveTarGz(goodTarEntries));

      expect(outcome).toEqual({ kind: "installed" });
      expect(await storageContentOf(storageDir)).toMatchObject({
        "bin/v0.1.0/cdd": binaryContent,
      });
    });

    it("keeps the files of the storage directory that are not in bin/", async () => {
      await writeStorageFile(storageDir, "other/state.json", "{}");

      await install(serveTarGz(goodTarEntries));

      expect(await storageContentOf(storageDir)).toMatchObject({ "other/state.json": "{}" });
    });
  });

  describe("a failure before step 6", () => {
    it("stops at a wrong checksum, and bin/ does not change", async () => {
      await expectFailureThatInstallsNothing(
        withWrongChecksum(serveTarGz(goodTarEntries)),
        "The SHA-256 of cdd_test.tar.gz is not equal to the expected value.",
      );
    });

    it.each([
      "https://evilgithubusercontent.com/asset",
      "https://github.com.evil.example/asset",
      "http://release-assets.githubusercontent.com/asset",
    ])("rejects a redirect to %s and requests nothing there", async (location) => {
      const served = serveTarGz(goodTarEntries);
      const archive = served.routes[cdnUrl];
      const routes = { [served.asset.url]: { status: 302, location }, [location]: archive! };

      await expectFailureThatInstallsNothing(
        { ...served, routes },
        `The download URL ${location} is not allowed.`,
      );
    });

    it("requests only the first URL when the redirect is not allowed", async () => {
      const served = serveTarGz(goodTarEntries);
      const location = "https://evil.example/asset";
      const routes = { [served.asset.url]: { status: 302, location } };

      const { requestedUrls } = await install({ ...served, routes });

      expect(requestedUrls).toEqual([served.asset.url]);
    });

    it.each<[string, ArchiveEntry[], string]>([
      [
        "an entry ../cdd",
        [{ name: "../cdd", content: binaryContent }],
        "The archive must have one cdd entry.",
      ],
      [
        "a cdd entry that is a symlink",
        [{ name: "./cdd", symlinkTarget: "/bin/sh" }],
        "The cdd entry of the archive is not a regular file.",
      ],
    ])("installs nothing from a .tar.gz with %s", async (_label, entries, reason) => {
      await expectFailureThatInstallsNothing(serveTarGz(entries), reason);
      expect(await storageContentOf(tempDir)).not.toHaveProperty("cdd");
    });

    it("installs nothing from a .zip with an entry ../cdd.exe", async () => {
      const served = serveZip([{ name: "../cdd.exe", content: binaryContent }]);

      const { outcome } = await install(served, { platform: "win32" });

      expect(outcome).toMatchObject({ kind: "failed" });
      expect(await storageContentOf(tempDir)).toEqual({ "globalStorage/": "" });
    });

    it("installs nothing from a .zip where cdd.exe is a symlink", async () => {
      const served = serveZip([{ name: "cdd.exe", symlinkTarget: "C:\\Windows\\cmd.exe" }]);

      const { outcome } = await install(served, { platform: "win32" });

      expect(outcome).toEqual({
        kind: "failed",
        reason: "The cdd.exe entry of the archive is not a regular file.",
      });
      expect(await storageContentOf(storageDir)).toEqual({});
    });

    it("leaves an existing managed binary in place when the validation of step 5 fails", async () => {
      await writeExistingStorage();
      const before = await storageContentOf(storageDir);

      const { outcome } = await install(serveTarGz(goodTarEntries), { execFile: noBinaryIsValid });

      expect(outcome).toEqual({
        kind: "failed",
        reason: "The downloaded binary is not valid: not-cdd.",
      });
      expect(await storageContentOf(storageDir)).toEqual(before);
    });

    it("does not create bin/ when the validation of step 5 fails", async () => {
      await install(serveTarGz(goodTarEntries), { execFile: noBinaryIsValid });

      expect(await storageContentOf(storageDir)).toEqual({});
    });

    it("reports the HTTP status of a failed download", async () => {
      const served = serveTarGz(goodTarEntries);

      const { outcome } = await install({
        ...served,
        routes: { [served.asset.url]: { status: 404 } },
      });

      expect(outcome).toEqual({
        kind: "failed",
        reason: "The download failed with HTTP status 404.",
      });
    });
  });

  describe("a cancellation", () => {
    async function stagingDirsOf(): Promise<string[]> {
      const content = await storageContentOf(storageDir);
      return Object.keys(content).filter((key) => /^staging-[^/]+\/$/.test(key));
    }

    it("removes the staging directory and changes nothing in bin/", async () => {
      await writeExistingStorage();
      const before = await storageContentOf(storageDir);
      const cancellation = new AbortController();
      const fake = createHttpsGetFake({});

      const installation = installManagedBinary(
        { asset: serveTarGz(goodTarEntries).asset, signal: cancellation.signal },
        { storageDir, platform: "linux", httpsGet: fake.httpsGet, execFile: everyBinaryIsValid },
      );
      await vi.waitFor(() => expect(fake.requestedUrls).toHaveLength(1));
      expect(await stagingDirsOf()).toHaveLength(1);
      cancellation.abort();

      expect(await installation).toEqual({ kind: "cancelled" });
      expect(await storageContentOf(storageDir)).toEqual(before);
    });

    it("during the validation of step 5 does not activate the staged binary", async () => {
      const cancellation = new AbortController();
      const served = serveTarGz(goodTarEntries);
      const cancelDuringValidation: ExecFileFunction = (file, args, options, callback) => {
        cancellation.abort();
        return everyBinaryIsValid(file, args, options, callback);
      };

      const outcome = await installManagedBinary(
        { asset: served.asset, signal: cancellation.signal },
        {
          storageDir,
          platform: "linux",
          httpsGet: createHttpsGetFake(served.routes).httpsGet,
          execFile: cancelDuringValidation,
        },
      );

      expect(outcome).toEqual({ kind: "cancelled" });
      expect(await storageContentOf(storageDir)).toEqual({});
    });
  });
});
