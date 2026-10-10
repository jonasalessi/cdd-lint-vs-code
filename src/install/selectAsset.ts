import { pinnedAssets, pinnedReleaseUrl, type PinnedAsset } from "../binary/pinnedRelease";

export type InstallHost = {
  platform: NodeJS.Platform;
  arch: string;
};

export type AssetTable = Readonly<Record<string, PinnedAsset>>;

export type InstallAsset = PinnedAsset & { url: string };

export function selectAsset(
  host: InstallHost,
  assets: AssetTable = pinnedAssets,
): InstallAsset | undefined {
  const asset = assets[hostKeyOf(host)];
  return asset && { ...asset, url: `${pinnedReleaseUrl}/${asset.name}` };
}

export function noAssetMessage(host: InstallHost): string {
  return `No prebuilt CDD binary exists for ${hostKeyOf(host)}. Install it with "go install github.com/jonasalessi/cdd-lint@latest", then run "CDD: Select Binary".`;
}

function hostKeyOf(host: InstallHost): string {
  return `${host.platform}-${host.arch}`;
}
