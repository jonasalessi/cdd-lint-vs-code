import { createWriteStream } from "node:fs";
import { chmod } from "node:fs/promises";
import type { Readable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { list, type ReadEntry } from "tar";
import yauzl from "yauzl";
import { binaryFileName } from "../binary/managedBinaryPath";

export type ExtractRequest = {
  archivePath: string;
  // The extension selects this path. An entry name is never a part of it.
  outputPath: string;
  platform: NodeJS.Platform;
};

type BinaryEntry<Source> = {
  isRegularFile: boolean;
  source: Source;
};

const binaryMode = 0o755;
const zipFileTypeMask = 0o170000;
const zipRegularFileTypes = [0, 0o100000];

export async function extractBinary(request: ExtractRequest): Promise<void> {
  const extract = request.archivePath.endsWith(".zip") ? extractFromZip : extractFromTar;
  await extract(request);
  await chmod(request.outputPath, binaryMode);
}

function isBinaryEntryName(entryName: string, platform: NodeJS.Platform): boolean {
  const fileName = binaryFileName(platform);
  return entryName === fileName || entryName === `./${fileName}`;
}

function onlyRegularEntry<Source>(entries: BinaryEntry<Source>[], platform: NodeJS.Platform) {
  const [entry] = entries;
  if (entry === undefined || entries.length > 1) {
    throw new Error(`The archive must have one ${binaryFileName(platform)} entry.`);
  }
  if (entry.isRegularFile) {
    return entry.source;
  }
  throw new Error(`The ${binaryFileName(platform)} entry of the archive is not a regular file.`);
}

function outputStreamOf(request: ExtractRequest) {
  return createWriteStream(request.outputPath, { mode: binaryMode });
}

async function extractFromTar(request: ExtractRequest): Promise<void> {
  const entries: BinaryEntry<Promise<void>>[] = [];
  await list({
    file: request.archivePath,
    onReadEntry: (entry) => {
      if (isBinaryEntryName(entry.path, request.platform)) {
        entries.push(readTarEntry(entry, entries.length === 0, request));
      }
    },
  });
  await onlyRegularEntry(entries, request.platform);
}

// tar gives the content of an entry only while it reads that entry, so the first entry is written
// before the check of the other entries. A later failure leaves the file to the staging cleanup.
function readTarEntry(
  entry: ReadEntry,
  isFirst: boolean,
  request: ExtractRequest,
): BinaryEntry<Promise<void>> {
  const isRegularFile = entry.type === "File";
  const shouldWrite = isRegularFile && isFirst;
  const source = shouldWrite ? finished(entry.pipe(outputStreamOf(request))) : Promise.resolve();
  return { isRegularFile, source };
}

async function extractFromZip(request: ExtractRequest): Promise<void> {
  const zipFile = await openZip(request.archivePath);
  try {
    const entries = (await readZipEntries(zipFile))
      .filter((entry) => isBinaryEntryName(entry.fileName, request.platform))
      .map((entry) => ({ isRegularFile: isRegularZipEntry(entry), source: entry }));
    const entry = onlyRegularEntry(entries, request.platform);
    await pipeline(await openZipEntry(zipFile, entry), outputStreamOf(request));
  } finally {
    zipFile.close();
  }
}

// The upper 16 bits hold the Unix file mode. An archive made on Windows has no mode (0).
function isRegularZipEntry(entry: yauzl.Entry): boolean {
  const fileType = (entry.externalFileAttributes >>> 16) & zipFileTypeMask;
  return zipRegularFileTypes.includes(fileType) && !entry.fileName.endsWith("/");
}

function openZip(archivePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { autoClose: false }, (error, zipFile) =>
      error ? reject(error) : resolve(zipFile),
    );
  });
}

function readZipEntries(zipFile: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zipFile.on("entry", (entry: yauzl.Entry) => entries.push(entry));
    zipFile.on("end", () => resolve(entries));
    zipFile.on("error", reject);
  });
}

function openZipEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}
