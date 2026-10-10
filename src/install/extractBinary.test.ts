import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTarGz, buildZip, type ArchiveEntry } from "./archiveFixtures";
import { extractBinary } from "./extractBinary";

const binaryContent = "#!/bin/sh\necho cdd v0.1.0\n";
const otherEntries: ArchiveEntry[] = [
  { name: "./LICENSE", content: "license" },
  { name: "./README.md", content: "readme" },
];

type ArchiveFormat = {
  label: string;
  archiveName: string;
  platform: NodeJS.Platform;
  binaryName: string;
  build: (entries: ArchiveEntry[]) => Buffer;
};

const formats: ArchiveFormat[] = [
  {
    label: ".tar.gz",
    archiveName: "archive.tar.gz",
    platform: "linux",
    binaryName: "cdd",
    build: buildTarGz,
  },
  {
    label: ".zip",
    archiveName: "archive.zip",
    platform: "win32",
    binaryName: "cdd.exe",
    build: buildZip,
  },
];

describe.each(formats)("extractBinary from $label", (format) => {
  let parentDir: string;
  let workDir: string;
  let outputPath: string;

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), "cdd-extract-"));
    workDir = join(parentDir, "work");
    outputPath = join(workDir, "staged-binary");
    await mkdir(workDir);
  });

  afterEach(() => rm(parentDir, { recursive: true, force: true }));

  async function extract(entries: ArchiveEntry[]): Promise<void> {
    const archivePath = join(workDir, format.archiveName);
    await writeFile(archivePath, format.build(entries));
    await extractBinary({ archivePath, outputPath, platform: format.platform });
  }

  it.each([format.binaryName, `./${format.binaryName}`])(
    "writes the entry %s to the output path",
    async (entryName) => {
      await extract([...otherEntries, { name: entryName, content: binaryContent }]);

      expect(await readFile(outputPath, "utf8")).toBe(binaryContent);
      expect((await readdir(workDir)).sort()).toEqual([format.archiveName, "staged-binary"]);
    },
  );

  it.skipIf(process.platform === "win32")("sets the mode 0755", async () => {
    await extract([{ name: format.binaryName, content: binaryContent }]);

    expect((await stat(outputPath)).mode & 0o777).toBe(0o755);
  });

  it("extracts nothing from an archive with the entry ../" + format.binaryName, async () => {
    const result = extract([...otherEntries, { name: `../${format.binaryName}`, content: "x" }]);

    await expect(result).rejects.toThrow();
    expect(await readdir(workDir)).toEqual([format.archiveName]);
    expect(await readdir(parentDir)).toEqual(["work"]);
  });

  it("extracts nothing when the binary entry is a symlink", async () => {
    const result = extract([{ name: format.binaryName, symlinkTarget: "/etc/passwd" }]);

    await expect(result).rejects.toThrow("is not a regular file");
    expect(await readdir(workDir)).toEqual([format.archiveName]);
  });

  it("rejects an archive with no binary entry", async () => {
    await expect(extract(otherEntries)).rejects.toThrow(
      `The archive must have one ${format.binaryName} entry.`,
    );
  });

  it("rejects an archive with a binary entry in a subdirectory only", async () => {
    const result = extract([{ name: `bin/${format.binaryName}`, content: binaryContent }]);

    await expect(result).rejects.toThrow("The archive must have one");
  });

  it("rejects an archive with two binary entries", async () => {
    const result = extract([
      { name: format.binaryName, content: binaryContent },
      { name: `./${format.binaryName}`, content: "second" },
    ]);

    await expect(result).rejects.toThrow("The archive must have one");
  });

  it("rejects a regular binary entry that follows a symlink entry of the same name", async () => {
    const result = extract([
      { name: format.binaryName, symlinkTarget: "/etc/passwd" },
      { name: format.binaryName, content: binaryContent },
    ]);

    await expect(result).rejects.toThrow();
  });

  it("rejects a file that is not an archive", async () => {
    const archivePath = join(workDir, format.archiveName);
    await writeFile(archivePath, "this is not an archive");

    const result = extractBinary({ archivePath, outputPath, platform: format.platform });

    await expect(result).rejects.toThrow();
  });
});
