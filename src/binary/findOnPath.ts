import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export type PathSearch = {
  name: string;
  pathValue: string;
  platform: NodeJS.Platform;
};

export async function findOnPath(search: PathSearch): Promise<string | undefined> {
  const fileName = executableFileName(search);
  for (const directory of searchDirectories(search)) {
    const candidatePath = join(directory, fileName);
    if (await isFile(candidatePath)) {
      return candidatePath;
    }
  }
  return undefined;
}

function executableFileName(search: PathSearch): string {
  return search.platform === "win32" ? `${search.name}.exe` : search.name;
}

// An empty or relative entry means the working directory. It is never searched.
function searchDirectories(search: PathSearch): string[] {
  const delimiter = search.platform === "win32" ? ";" : ":";
  return search.pathValue.split(delimiter).filter((directory) => isAbsolute(directory));
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
