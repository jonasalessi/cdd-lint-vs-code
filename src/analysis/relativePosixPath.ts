import { relative, sep } from "node:path";

export function relativePosixPath(configDir: string, documentPath: string): string {
  return relative(configDir, documentPath).split(sep).join("/");
}
