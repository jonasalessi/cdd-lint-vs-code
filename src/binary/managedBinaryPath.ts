import { join } from "node:path";
import { pinnedVersion } from "./pinnedRelease";

export type ManagedBinaryLocation = {
  storageDir: string;
  platform: NodeJS.Platform;
};

export function binaryFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "cdd.exe" : "cdd";
}

export function managedBinaryPath(location: ManagedBinaryLocation): string {
  return join(location.storageDir, "bin", pinnedVersion, binaryFileName(location.platform));
}
