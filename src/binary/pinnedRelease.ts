export type PinnedAsset = {
  name: string;
  sha256: string;
};

export const pinnedVersion = "v0.1.0";

export const pinnedReleaseUrl = `https://github.com/jonasalessi/cdd-lint/releases/download/${pinnedVersion}`;

// Keys are `${process.platform}-${process.arch}`. Keep the values equal to scripts/fetch-cdd.mjs.
export const pinnedAssets: Readonly<Record<string, PinnedAsset>> = {
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
