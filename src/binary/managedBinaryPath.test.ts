import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { managedBinaryPath } from "./managedBinaryPath";

const storageDir = join("/", "storage", "jonasalessi.cdd-lint-vscode");

describe("managedBinaryPath", () => {
  it.each(["darwin", "linux"] as const)("is bin/v0.1.0/cdd on %s", (platform) => {
    const expectedPath = join(storageDir, "bin", "v0.1.0", "cdd");

    expect(managedBinaryPath({ storageDir, platform })).toBe(expectedPath);
  });

  it("is bin/v0.1.0/cdd.exe on Windows", () => {
    const expectedPath = join(storageDir, "bin", "v0.1.0", "cdd.exe");

    expect(managedBinaryPath({ storageDir, platform: "win32" })).toBe(expectedPath);
  });
});
