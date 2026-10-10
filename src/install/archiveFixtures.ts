import { crc32, gzipSync } from "node:zlib";
import { Header } from "tar";

// Test support: builds small archives in memory. The archive libraries that create files
// refuse the entry names and entry types that the extraction tests need.

export type ArchiveEntry = {
  name: string;
  content?: string;
  symlinkTarget?: string;
};

type ZipRecord = {
  localPart: Buffer;
  centralHeader: Buffer;
};

const tarBlockSize = 512;
const zipVersion = 20;
const zipMadeOnUnix = (3 << 8) | zipVersion;
const zipRegularFileMode = 0o100755;
const zipSymlinkMode = 0o120777;

export function buildTarGz(entries: ArchiveEntry[]): Buffer {
  const endOfArchive = Buffer.alloc(2 * tarBlockSize);
  return gzipSync(Buffer.concat([...entries.map(tarEntryOf), endOfArchive]));
}

export function buildZip(entries: ArchiveEntry[]): Buffer {
  const records: ZipRecord[] = [];
  let offset = 0;
  for (const entry of entries) {
    const record = zipRecordOf(entry, offset);
    records.push(record);
    offset += record.localPart.length;
  }
  const centralDirectory = Buffer.concat(records.map((record) => record.centralHeader));
  const end = zipEndOf(records.length, centralDirectory.length, offset);
  return Buffer.concat([...records.map((record) => record.localPart), centralDirectory, end]);
}

function tarEntryOf(entry: ArchiveEntry): Buffer {
  const content = Buffer.from(entry.symlinkTarget === undefined ? (entry.content ?? "") : "");
  const header = new Header({
    path: entry.name,
    type: entry.symlinkTarget === undefined ? "File" : "SymbolicLink",
    linkpath: entry.symlinkTarget,
    size: content.length,
    mode: 0o755,
    mtime: new Date(0),
  });
  header.encode();
  return Buffer.concat([header.block ?? Buffer.alloc(0), padToTarBlock(content)]);
}

function padToTarBlock(content: Buffer): Buffer {
  const paddedLength = Math.ceil(content.length / tarBlockSize) * tarBlockSize;
  return Buffer.concat([content, Buffer.alloc(paddedLength - content.length)]);
}

function zipRecordOf(entry: ArchiveEntry, localHeaderOffset: number): ZipRecord {
  const name = Buffer.from(entry.name);
  const content = Buffer.from(entry.symlinkTarget ?? entry.content ?? "");
  const shared = zipSharedFieldsOf(name, content);
  const mode = entry.symlinkTarget === undefined ? zipRegularFileMode : zipSymlinkMode;
  return {
    localPart: Buffer.concat([zipLocalStart(), shared, Buffer.alloc(2), name, content]),
    centralHeader: Buffer.concat([
      zipCentralStart(),
      shared,
      zipCentralTailOf(mode, localHeaderOffset),
      name,
    ]),
  };
}

// The fields that the local header and the central header share:
// flags, method (0 is stored), time, date, CRC-32, compressed size, size, name length.
function zipSharedFieldsOf(name: Buffer, content: Buffer): Buffer {
  const shared = Buffer.alloc(22);
  shared.writeUInt32LE(crc32(content), 8);
  shared.writeUInt32LE(content.length, 12);
  shared.writeUInt32LE(content.length, 16);
  shared.writeUInt16LE(name.length, 20);
  return shared;
}

function zipLocalStart(): Buffer {
  const start = Buffer.alloc(6);
  start.writeUInt32LE(0x04034b50, 0);
  start.writeUInt16LE(zipVersion, 4);
  return start;
}

function zipCentralStart(): Buffer {
  const start = Buffer.alloc(8);
  start.writeUInt32LE(0x02014b50, 0);
  start.writeUInt16LE(zipMadeOnUnix, 4);
  start.writeUInt16LE(zipVersion, 6);
  return start;
}

// Extra length, comment length, disk number, internal attributes, external attributes, offset.
function zipCentralTailOf(mode: number, localHeaderOffset: number): Buffer {
  const tail = Buffer.alloc(16);
  tail.writeUInt32LE((mode << 16) >>> 0, 8);
  tail.writeUInt32LE(localHeaderOffset, 12);
  return tail;
}

function zipEndOf(entryCount: number, directorySize: number, directoryOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(directoryOffset, 16);
  return end;
}
