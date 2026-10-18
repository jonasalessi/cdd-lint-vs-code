import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOnPath } from "./findOnPath";

describe("findOnPath", () => {
  const startDirectory = process.cwd();
  let root: string;

  function createDirectory(name: string): string {
    const directory = join(root, name);
    mkdirSync(directory);
    return directory;
  }

  function createFile(directory: string, fileName: string): string {
    const filePath = join(directory, fileName);
    writeFileSync(filePath, "");
    return filePath;
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "cdd-find-on-path-")));
  });

  afterEach(() => {
    process.chdir(startDirectory);
    rmSync(root, { recursive: true, force: true });
  });

  // A POSIX PATH value cannot hold a Windows drive path such as C:\, because ":" is its delimiter.
  describe.skipIf(process.platform === "win32")("on POSIX", () => {
    it("finds a file with the exact name and returns its absolute path", async () => {
      const emptyDirectory = createDirectory("empty");
      const binaryPath = createFile(createDirectory("bin"), "cdd");
      const pathValue = `${emptyDirectory}:${join(root, "bin")}`;

      expect(await findOnPath({ name: "cdd", pathValue, platform: "linux" })).toBe(binaryPath);
    });

    it("returns the file of the first directory that has one", async () => {
      const firstPath = createFile(createDirectory("first"), "cdd");
      createFile(createDirectory("second"), "cdd");
      const pathValue = `${join(root, "first")}:${join(root, "second")}`;

      expect(await findOnPath({ name: "cdd", pathValue, platform: "darwin" })).toBe(firstPath);
    });

    it("does not find a file with another name", async () => {
      const directory = createDirectory("bin");
      createFile(directory, "cdd.exe");
      createFile(directory, "cdd-lint");

      expect(await findOnPath({ name: "cdd", pathValue: directory, platform: "linux" })).toBe(
        undefined,
      );
    });

    it("does not find a directory with the name", async () => {
      const directory = createDirectory("bin");
      mkdirSync(join(directory, "cdd"));

      expect(await findOnPath({ name: "cdd", pathValue: directory, platform: "linux" })).toBe(
        undefined,
      );
    });

    it("does not search the working directory for an empty or relative entry", async () => {
      createFile(createDirectory("work"), "cdd");
      process.chdir(join(root, "work"));

      expect(await findOnPath({ name: "cdd", pathValue: ":.:", platform: "linux" })).toBe(
        undefined,
      );
    });

    it("finds nothing with an empty PATH value", async () => {
      expect(await findOnPath({ name: "cdd", pathValue: "", platform: "linux" })).toBe(undefined);
    });
  });

  describe("on Windows", () => {
    it("finds cdd.exe", async () => {
      const emptyDirectory = createDirectory("empty");
      const binaryPath = createFile(createDirectory("bin"), "cdd.exe");
      const pathValue = `${emptyDirectory};${join(root, "bin")}`;

      expect(await findOnPath({ name: "cdd", pathValue, platform: "win32" })).toBe(binaryPath);
    });

    it("does not find cdd.cmd or a file with no extension", async () => {
      const directory = createDirectory("bin");
      createFile(directory, "cdd.cmd");
      createFile(directory, "cdd");

      expect(await findOnPath({ name: "cdd", pathValue: directory, platform: "win32" })).toBe(
        undefined,
      );
    });

    it("does not search a directory that is not in pathValue", async () => {
      const emptyDirectory = createDirectory("empty");
      createFile(createDirectory("work"), "cdd.exe");
      process.chdir(join(root, "work"));
      const pathValue = `${emptyDirectory};;.`;

      expect(await findOnPath({ name: "cdd", pathValue, platform: "win32" })).toBe(undefined);
    });
  });
});
