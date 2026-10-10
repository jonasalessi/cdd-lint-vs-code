import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { findConfig, type ConfigSearch } from "./findConfig";
import { readOutputFile, type OutputFileSetting } from "./readOutputFile";

export type ConfigLog = {
  error: (message: string) => void;
};

export type ConfigResolverDependencies = {
  log: ConfigLog;
};

export type ConfigResolution =
  | { kind: "resolved"; configDir: string; configPath: string }
  | { kind: "no-config" }
  | { kind: "output-file-configured"; configPath: string }
  | { kind: "unparsable"; configPath: string };

export class ConfigResolver {
  private readonly cache = new Map<string, Promise<ConfigResolution>>();

  constructor(private readonly dependencies: ConfigResolverDependencies) {}

  resolve(search: ConfigSearch): Promise<ConfigResolution> {
    const cacheKey = cacheKeyOf(search);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const resolution = this.resolveUncached(search);
    this.cache.set(cacheKey, resolution);
    return resolution;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async resolveUncached(search: ConfigSearch): Promise<ConfigResolution> {
    const found = await findConfig(search);
    return found.kind === "found" ? this.resolveConfigFile(found.configPath) : found;
  }

  private async resolveConfigFile(configPath: string): Promise<ConfigResolution> {
    const outputFile = await readOutputFileOf(configPath);
    if (outputFile.kind === "unparsable") {
      this.dependencies.log.error(`Cannot read ${configPath}: ${outputFile.reason}`);
      return { kind: "unparsable", configPath };
    }
    return outputFile.kind === "set"
      ? { kind: "output-file-configured", configPath }
      : { kind: "resolved", configDir: dirname(configPath), configPath };
  }
}

// The workspace folder is part of the key because it limits the search.
function cacheKeyOf(search: ConfigSearch): string {
  return JSON.stringify([search.workspaceFolderPath, dirname(search.documentPath)]);
}

// A file that cannot be read has an unknown outputFile value, as a file that cannot be parsed.
async function readOutputFileOf(configPath: string): Promise<OutputFileSetting> {
  try {
    return readOutputFile(await readFile(configPath, "utf8"));
  } catch (error) {
    return { kind: "unparsable", reason: String(error) };
  }
}
