import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { binaryFileName, managedBinaryPath } from "../binary/managedBinaryPath";
import { pinnedVersion } from "../binary/pinnedRelease";
import { validateBinary, type ExecFileFunction } from "../binary/validateBinary";
import { downloadAsset, type DownloadProgress, type HttpsGetFunction } from "./downloadAsset";
import { extractBinary } from "./extractBinary";
import type { InstallAsset } from "./selectAsset";
import { verifyChecksum } from "./verifyChecksum";

export type InstallDependencies = {
  storageDir: string;
  platform: NodeJS.Platform;
  httpsGet: HttpsGetFunction;
  execFile: ExecFileFunction;
};

export type InstallRequest = {
  asset: InstallAsset;
  signal: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
};

export type InstallOutcome =
  { kind: "installed" } | { kind: "cancelled" } | { kind: "failed"; reason: string };

type Staging = InstallDependencies & { stagingDir: string };

// Steps 1 to 6 of plan section 3.8. Nothing in <storageDir>/bin changes before step 6.
export async function installManagedBinary(
  request: InstallRequest,
  dependencies: InstallDependencies,
): Promise<InstallOutcome> {
  try {
    await installThroughStaging(request, dependencies);
    return { kind: "installed" };
  } catch (error) {
    return request.signal.aborted
      ? { kind: "cancelled" }
      : { kind: "failed", reason: reasonOf(error) };
  }
}

async function installThroughStaging(
  request: InstallRequest,
  dependencies: InstallDependencies,
): Promise<void> {
  const stagingDir = await createStagingDir(dependencies.storageDir);
  try {
    const stagedBinaryPath = await stageBinary(request, { ...dependencies, stagingDir });
    request.signal.throwIfAborted();
    await activate(stagedBinaryPath, dependencies);
  } finally {
    await removeIgnoringErrors(stagingDir);
  }
  await removeOtherVersions(dependencies.storageDir);
}

async function createStagingDir(storageDir: string): Promise<string> {
  await mkdir(storageDir, { recursive: true });
  return mkdtemp(join(storageDir, "staging-"));
}

async function stageBinary(request: InstallRequest, staging: Staging): Promise<string> {
  const archivePath = await downloadVerifiedArchive(request, staging);
  request.signal.throwIfAborted();
  const stagedBinaryPath = join(staging.stagingDir, binaryFileName(staging.platform));
  await extractBinary({ archivePath, outputPath: stagedBinaryPath, platform: staging.platform });
  request.signal.throwIfAborted();
  await assertValidBinary(stagedBinaryPath, staging.execFile);
  return stagedBinaryPath;
}

async function downloadVerifiedArchive(request: InstallRequest, staging: Staging): Promise<string> {
  const { asset, signal, onProgress } = request;
  const archivePath = join(staging.stagingDir, archiveFileNameOf(asset));
  await downloadAsset(
    { url: asset.url, destinationPath: archivePath, signal, onProgress },
    staging.httpsGet,
  );
  await assertChecksum(archivePath, asset);
  return archivePath;
}

function archiveFileNameOf(asset: InstallAsset): string {
  return asset.name.endsWith(".zip") ? "archive.zip" : "archive.tar.gz";
}

async function assertChecksum(archivePath: string, asset: InstallAsset): Promise<void> {
  const isExpected = await verifyChecksum(archivePath, asset.sha256);
  if (!isExpected) {
    throw new Error(`The SHA-256 of ${asset.name} is not equal to the expected value.`);
  }
}

async function assertValidBinary(binaryPath: string, execFile: ExecFileFunction): Promise<void> {
  const validation = await validateBinary(binaryPath, execFile);
  if (!validation.isValid) {
    throw new Error(`The downloaded binary is not valid: ${validation.failureClass}.`);
  }
}

async function activate(stagedBinaryPath: string, dependencies: InstallDependencies) {
  const targetPath = managedBinaryPath(dependencies);
  await mkdir(dirname(targetPath), { recursive: true });
  await removeInvalidTarget(targetPath, dependencies.execFile);
  await rename(stagedBinaryPath, targetPath);
}

async function removeInvalidTarget(targetPath: string, execFile: ExecFileFunction) {
  const validation = await validateBinary(targetPath, execFile);
  if (!validation.isValid) {
    await rm(targetPath, { recursive: true, force: true });
  }
}

async function removeOtherVersions(storageDir: string): Promise<void> {
  const binDir = join(storageDir, "bin");
  const entries = await readdir(binDir, { withFileTypes: true }).catch(() => []);
  const otherDirs = entries.filter((entry) => entry.isDirectory() && entry.name !== pinnedVersion);
  await Promise.all(otherDirs.map((entry) => removeIgnoringErrors(join(binDir, entry.name))));
}

async function removeIgnoringErrors(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
