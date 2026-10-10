import { describe, expect, it } from "vitest";
import { noAssetMessage, selectAsset } from "./selectAsset";

const releaseUrl = "https://github.com/jonasalessi/cdd-lint/releases/download/v0.1.0";

const rows = [
  {
    platform: "darwin",
    arch: "x64",
    name: "cdd_v0.1.0_darwin_amd64.tar.gz",
    sha256: "78fb6ad260e76da2f6fa147858712268c3fd8128fb491de11b887a10e633ba75",
  },
  {
    platform: "darwin",
    arch: "arm64",
    name: "cdd_v0.1.0_darwin_arm64.tar.gz",
    sha256: "b82b1c0aa7498a103a2bf30cd15aec640f9fb4c62ff5b834610c787c76886bc3",
  },
  {
    platform: "linux",
    arch: "x64",
    name: "cdd_v0.1.0_linux_amd64.tar.gz",
    sha256: "e0d258fc3891a04b2052ebbeee4ebbb9e9889e658d4fff45634715c9c3b6f715",
  },
  {
    platform: "linux",
    arch: "arm64",
    name: "cdd_v0.1.0_linux_arm64.tar.gz",
    sha256: "e3438b1938d0ddd726e9733eafb5f3d4edc6fe5081751f412e6ad84db1a8193f",
  },
  {
    platform: "win32",
    arch: "x64",
    name: "cdd_v0.1.0_windows_amd64.zip",
    sha256: "f91850567973bba4a5aa8ce39f812cedee9a76c6699d55bfd3570ce1515fcc91",
  },
] as const;

describe("selectAsset", () => {
  it.each(rows)("maps $platform/$arch to $name", ({ platform, arch, name, sha256 }) => {
    expect(selectAsset({ platform, arch })).toEqual({
      name,
      sha256,
      url: `${releaseUrl}/${name}`,
    });
  });

  it.each([
    { platform: "win32", arch: "arm64" },
    { platform: "linux", arch: "ia32" },
    { platform: "freebsd", arch: "x64" },
  ] as const)("maps $platform/$arch to no asset", (host) => {
    expect(selectAsset(host)).toBeUndefined();
  });

  it("reads the asset from the table that the caller supplies", () => {
    const assets = { "linux-x64": { name: "test.tar.gz", sha256: "abc" } };

    expect(selectAsset({ platform: "linux", arch: "x64" }, assets)).toEqual({
      name: "test.tar.gz",
      sha256: "abc",
      url: `${releaseUrl}/test.tar.gz`,
    });
  });
});

describe("noAssetMessage", () => {
  it("names the platform and the architecture", () => {
    expect(noAssetMessage({ platform: "win32", arch: "arm64" })).toBe(
      'No prebuilt CDD binary exists for win32-arm64. Install it with "go install github.com/jonasalessi/cdd-lint@latest", then run "CDD: Select Binary".',
    );
  });
});
