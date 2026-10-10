import { stat } from "node:fs/promises";
import { isAbsolute, dirname, join, relative, sep } from "node:path";

export const configFileName = "cdd.config.yaml";

export type ConfigSearch = {
  documentPath: string;
  workspaceFolderPath: string;
};

export type ConfigSearchResult = { kind: "found"; configPath: string } | { kind: "no-config" };

export async function findConfig(search: ConfigSearch): Promise<ConfigSearchResult> {
  for (const directory of searchDirectories(search)) {
    const configPath = join(directory, configFileName);
    if (await isFile(configPath)) {
      return { kind: "found", configPath };
    }
  }
  return { kind: "no-config" };
}

// The nearest directory is first. The workspace folder root is last.
function searchDirectories(search: ConfigSearch): string[] {
  const root = search.workspaceFolderPath;
  const pathFromRoot = relative(root, dirname(search.documentPath));
  if (isOutsideRoot(pathFromRoot)) {
    return [];
  }
  const segments = pathFromRoot === "" ? [] : pathFromRoot.split(sep);
  const nested = segments.map((_, index) => join(root, ...segments.slice(0, index + 1)));
  return [root, ...nested].reverse();
}

function isOutsideRoot(pathFromRoot: string): boolean {
  return pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
