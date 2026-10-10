import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { validVersionOutput } from "../binary/execFileFake";
import type { ExecFileFunction } from "../binary/validateBinary";
import { buildTarGz, buildZip, type ArchiveEntry } from "./archiveFixtures";
import type { FakeRoute } from "./httpsGetFake";
import type { AssetTable, InstallAsset } from "./selectAsset";

// Test support for the installation tests: a served archive, its asset, and the storage content.

export type ServedArchive = {
  asset: InstallAsset;
  assets: AssetTable;
  routes: Record<string, FakeRoute>;
};

export const binaryContent = "#!/bin/sh\necho cdd v0.1.0\n";
export const cdnUrl = "https://release-assets.githubusercontent.com/asset?token=1";

const releaseUrl = "https://github.com/jonasalessi/cdd-lint/releases/download/v0.1.0";

export const goodTarEntries: ArchiveEntry[] = [
  { name: "./cdd", content: binaryContent },
  { name: "./LICENSE", content: "license" },
];

export const goodZipEntries: ArchiveEntry[] = [
  { name: "cdd.exe", content: binaryContent },
  { name: "LICENSE", content: "license" },
];

export function serveTarGz(entries: ArchiveEntry[]): ServedArchive {
  return serve("linux-x64", "cdd_test.tar.gz", buildTarGz(entries));
}

export function serveZip(entries: ArchiveEntry[]): ServedArchive {
  return serve("win32-x64", "cdd_test.zip", buildZip(entries));
}

export function withWrongChecksum(served: ServedArchive): ServedArchive {
  const asset = { ...served.asset, sha256: "0".repeat(64) };
  const [hostKey] = Object.keys(served.assets);
  return { ...served, asset, assets: { [hostKey ?? ""]: asset } };
}

export const everyBinaryIsValid: ExecFileFunction = (_file, _args, _options, callback) =>
  callback(null, validVersionOutput, "");

export const noBinaryIsValid: ExecFileFunction = (_file, _args, _options, callback) =>
  callback(Object.assign(new Error("exit 1"), { code: 1 }), "", "");

export const onlyStagedBinaryIsValid: ExecFileFunction = (file, args, options, callback) =>
  (file.includes("staging-") ? everyBinaryIsValid : noBinaryIsValid)(file, args, options, callback);

export async function writeStorageFile(storageDir: string, relativePath: string, content: string) {
  const filePath = join(storageDir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

// Relative POSIX path of each file and each empty directory, with the file content.
export async function storageContentOf(storageDir: string): Promise<Record<string, string>> {
  const entries = await readdir(storageDir, { withFileTypes: true, recursive: true });
  const content: Record<string, string> = {};
  for (const entry of entries) {
    const entryPath = join(entry.parentPath, entry.name);
    const key = relative(storageDir, entryPath).split("\\").join("/");
    content[entry.isDirectory() ? `${key}/` : key] = entry.isDirectory()
      ? ""
      : await readFile(entryPath, "utf8");
  }
  return content;
}

function serve(hostKey: string, name: string, archive: Buffer): ServedArchive {
  const url = `${releaseUrl}/${name}`;
  const sha256 = createHash("sha256").update(archive).digest("hex");
  return {
    asset: { name, sha256, url },
    assets: { [hostKey]: { name, sha256 } },
    routes: {
      [url]: { status: 302, location: cdnUrl },
      [cdnUrl]: { status: 200, body: archive },
    },
  };
}
