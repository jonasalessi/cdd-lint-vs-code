import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { managedBinaryPath } from "../src/binary/managedBinaryPath";
import { validateBinary } from "../src/binary/validateBinary";
import { installManagedBinary } from "../src/install/installManagedBinary";
import { selectAsset, type InstallAsset } from "../src/install/selectAsset";

const isNetworkTestEnabled = process.env.CDD_NETWORK_TESTS === "1";
const networkTimeLimitMs = 90_000;

function pinnedAssetOfThisHost(): InstallAsset {
  const asset = selectAsset({ platform: process.platform, arch: process.arch });
  if (asset) {
    return asset;
  }
  throw new Error(`The pinned release has no asset for ${process.platform}-${process.arch}.`);
}

describe.skipIf(!isNetworkTestEnabled)("installManagedBinary with the pinned release", () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "cdd-install-contract-"));
  });

  afterEach(() => rm(storageDir, { recursive: true, force: true }));

  it(
    "downloads, verifies, installs and validates the asset of this platform",
    async () => {
      const dependencies = { storageDir, platform: process.platform, httpsGet, execFile };

      const outcome = await installManagedBinary(
        { asset: pinnedAssetOfThisHost(), signal: new AbortController().signal },
        dependencies,
      );

      expect(outcome).toEqual({ kind: "installed" });
      expect(await readdir(storageDir)).toEqual(["bin"]);
      expect(await validateBinary(managedBinaryPath(dependencies), execFile)).toMatchObject({
        isValid: true,
        versionToken: "v0.1.0",
      });
    },
    networkTimeLimitMs,
  );
});
