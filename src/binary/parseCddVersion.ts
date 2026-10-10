export type CddVersion =
  | { kind: "supported"; token: string; isDevBuild: boolean }
  | { kind: "unsupported-version"; token: string }
  | { kind: "not-cdd" };

type ReleaseNumbers = [number, number, number];

const versionLinePattern = /^cdd (\S+)( .*)?$/;
const releaseTokenPattern = /^v(\d+)\.(\d+)\.(\d+)/;
const minimumRelease: ReleaseNumbers = [0, 1, 0];

export function parseCddVersion(stdout: string): CddVersion {
  const firstLine = stdout.split(/\r?\n/)[0] ?? "";
  const token = versionLinePattern.exec(firstLine)?.[1];
  return token === undefined ? { kind: "not-cdd" } : classifyToken(token);
}

function classifyToken(token: string): CddVersion {
  if (token.startsWith("dev")) {
    return { kind: "supported", token, isDevBuild: true };
  }
  return isSupportedRelease(token)
    ? { kind: "supported", token, isDevBuild: false }
    : { kind: "unsupported-version", token };
}

function isSupportedRelease(token: string): boolean {
  const match = releaseTokenPattern.exec(token);
  return match !== null && isMinimumOrLater(match.slice(1, 4).map(Number));
}

function isMinimumOrLater(release: number[]): boolean {
  const firstDifference = minimumRelease
    .map((minimum, index) => (release[index] ?? 0) - minimum)
    .find((difference) => difference !== 0);
  return (firstDifference ?? 0) >= 0;
}
