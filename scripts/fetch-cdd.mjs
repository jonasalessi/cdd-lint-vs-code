// Usage: node scripts/fetch-cdd.mjs [output directory]
// Prints the path of the binary on stdout. All other messages go to stderr.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { extract as extractTar } from "tar";
import yauzl from "yauzl";

const version = "v0.1.0";
const releaseUrl = `https://github.com/jonasalessi/cdd-lint/releases/download/${version}`;
const defaultOutputDirectory = ".cdd-bin";

// Keep these values equal to section 2.5 of the plan and to src/binary/pinnedRelease.ts.
const assets = {
  "darwin-x64": {
    name: "cdd_v0.1.0_darwin_amd64.tar.gz",
    sha256: "78fb6ad260e76da2f6fa147858712268c3fd8128fb491de11b887a10e633ba75",
  },
  "darwin-arm64": {
    name: "cdd_v0.1.0_darwin_arm64.tar.gz",
    sha256: "b82b1c0aa7498a103a2bf30cd15aec640f9fb4c62ff5b834610c787c76886bc3",
  },
  "linux-x64": {
    name: "cdd_v0.1.0_linux_amd64.tar.gz",
    sha256: "e0d258fc3891a04b2052ebbeee4ebbb9e9889e658d4fff45634715c9c3b6f715",
  },
  "linux-arm64": {
    name: "cdd_v0.1.0_linux_arm64.tar.gz",
    sha256: "e3438b1938d0ddd726e9733eafb5f3d4edc6fe5081751f412e6ad84db1a8193f",
  },
  "win32-x64": {
    name: "cdd_v0.1.0_windows_amd64.zip",
    sha256: "f91850567973bba4a5aa8ce39f812cedee9a76c6699d55bfd3570ce1515fcc91",
  },
};

function selectAsset() {
  const host = `${process.platform}-${process.arch}`;
  const asset = assets[host];
  if (!asset) {
    throw new Error(`No prebuilt CDD binary exists for ${host}.`);
  }
  return asset;
}

async function download(asset, archivePath) {
  const response = await fetch(`${releaseUrl}/${asset.name}`);
  if (!response.ok) {
    throw new Error(`Download of ${asset.name} failed with status ${response.status}.`);
  }
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
}

async function verifyChecksum(asset, archivePath) {
  const actual = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  if (actual !== asset.sha256) {
    throw new Error(`SHA-256 of ${asset.name} is ${actual}, expected ${asset.sha256}.`);
  }
}

function isTarBinaryEntry(entryPath, entry) {
  return entry.type === "File" && (entryPath === "./cdd" || entryPath === "cdd");
}

async function extractFromTar(archivePath, outputDirectory) {
  await extractTar({ file: archivePath, cwd: outputDirectory, filter: isTarBinaryEntry });
  return join(outputDirectory, "cdd");
}

function openZip(archivePath) {
  return new Promise((resolveOpen, rejectOpen) => {
    yauzl.open(archivePath, { lazyEntries: false, autoClose: false }, (error, zipFile) =>
      error ? rejectOpen(error) : resolveOpen(zipFile),
    );
  });
}

function findZipBinaryEntry(zipFile) {
  return new Promise((resolveEntry, rejectEntry) => {
    let binaryEntry;
    zipFile.on("entry", (entry) => {
      if (entry.fileName === "cdd.exe") binaryEntry = entry;
    });
    zipFile.on("end", () => resolveEntry(binaryEntry));
    zipFile.on("error", rejectEntry);
  });
}

function openZipEntry(zipFile, entry) {
  return new Promise((resolveStream, rejectStream) => {
    zipFile.openReadStream(entry, (error, stream) =>
      error ? rejectStream(error) : resolveStream(stream),
    );
  });
}

async function extractFromZip(archivePath, outputDirectory) {
  const zipFile = await openZip(archivePath);
  try {
    return await extractZipBinary(zipFile, outputDirectory);
  } finally {
    zipFile.close();
  }
}

async function extractZipBinary(zipFile, outputDirectory) {
  const binaryEntry = await findZipBinaryEntry(zipFile);
  if (!binaryEntry) {
    throw new Error("The archive has no cdd.exe entry.");
  }
  const binaryPath = join(outputDirectory, "cdd.exe");
  await pipeline(await openZipEntry(zipFile, binaryEntry), createWriteStream(binaryPath));
  return binaryPath;
}

function extractBinary(archivePath, outputDirectory) {
  const extract = archivePath.endsWith(".zip") ? extractFromZip : extractFromTar;
  return extract(archivePath, outputDirectory);
}

async function fetchBinary(asset, outputDirectory) {
  const stagingDirectory = await mkdtemp(join(outputDirectory, "staging-"));
  try {
    const archivePath = join(stagingDirectory, asset.name);
    await download(asset, archivePath);
    await verifyChecksum(asset, archivePath);
    return await extractBinary(archivePath, outputDirectory);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

const asset = selectAsset();
const outputDirectory = resolve(process.argv[2] ?? defaultOutputDirectory, version);
await mkdir(outputDirectory, { recursive: true });
console.error(`Downloading ${asset.name}`);
const binaryPath = await fetchBinary(asset, outputDirectory);
await chmod(binaryPath, 0o755);
console.error(`SHA-256 verified: ${asset.sha256}`);
console.log(binaryPath);
