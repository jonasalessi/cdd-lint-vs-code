import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pinnedAssets, pinnedReleaseUrl, pinnedVersion } from "./pinnedRelease";

const fetchScript = readFileSync(resolve(__dirname, "../../scripts/fetch-cdd.mjs"), "utf8");

describe("pinnedRelease", () => {
  it("pins release v0.1.0", () => {
    expect(pinnedVersion).toBe("v0.1.0");
    expect(pinnedReleaseUrl).toBe(
      "https://github.com/jonasalessi/cdd-lint/releases/download/v0.1.0",
    );
  });

  it("has one asset for each platform and architecture pair of plan section 2.5", () => {
    expect(Object.keys(pinnedAssets)).toEqual([
      "darwin-x64",
      "darwin-arm64",
      "linux-x64",
      "linux-arm64",
      "win32-x64",
    ]);
  });

  it.each(Object.entries(pinnedAssets))(
    "holds the same %s values as scripts/fetch-cdd.mjs",
    (host, asset) => {
      const scriptEntry = `"${host}": {\n    name: "${asset.name}",\n    sha256: "${asset.sha256}",\n  }`;

      expect(fetchScript).toContain(scriptEntry);
    },
  );
});
