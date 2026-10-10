import { findOnPath } from "./findOnPath";
import { managedBinaryPath } from "./managedBinaryPath";
import {
  validateBinary,
  type BinaryFailureClass,
  type BinaryValidation,
  type ExecFileFunction,
} from "./validateBinary";

export type BinaryLog = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type BinaryResolverDependencies = {
  execFile: ExecFileFunction;
  getBinaryPathSetting: () => string;
  getPathValue: () => string;
  platform: NodeJS.Platform;
  storageDir: string;
  log: BinaryLog;
};

export type BinaryResolution =
  | { kind: "resolved"; binaryPath: string }
  | { kind: "invalid-binary"; failureClass: BinaryFailureClass }
  | { kind: "no-binary" };

// "setting-changed" and "installation-completed" are trigger 6 of plan section 3.4.
export type CacheClearCause = "setting-changed" | "installation-completed" | "run-start-failed";

export type CacheClearListener = (cause: CacheClearCause) => void;

export type CacheClearSubscription = { dispose: () => void };

type Candidate = {
  label: string;
  locate: () => Promise<string | undefined>;
};

export class BinaryResolver {
  private cachedBinaryPath: string | undefined;
  private cacheGeneration = 0;
  private readonly listeners = new Set<CacheClearListener>();

  constructor(private readonly dependencies: BinaryResolverDependencies) {}

  async resolve(): Promise<BinaryResolution> {
    if (this.cachedBinaryPath !== undefined) {
      return { kind: "resolved", binaryPath: this.cachedBinaryPath };
    }
    const generation = this.cacheGeneration;
    const resolution = await this.resolveUncached();
    this.cacheWhenCurrent(resolution, generation);
    return resolution;
  }

  clearCache(cause: CacheClearCause): void {
    this.cachedBinaryPath = undefined;
    this.cacheGeneration += 1;
    this.listeners.forEach((listener) => listener(cause));
  }

  onDidClearCache(listener: CacheClearListener): CacheClearSubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  // A resolution that started before a cache clear can hold a path that is no longer correct.
  private cacheWhenCurrent(resolution: BinaryResolution, generation: number): void {
    if (resolution.kind === "resolved" && generation === this.cacheGeneration) {
      this.cachedBinaryPath = resolution.binaryPath;
    }
  }

  private resolveUncached(): Promise<BinaryResolution> {
    const configuredPath = this.dependencies.getBinaryPathSetting();
    return configuredPath === "" ? this.discover() : this.resolveConfigured(configuredPath);
  }

  private async resolveConfigured(configuredPath: string): Promise<BinaryResolution> {
    const validation = await this.validate("cdd.binaryPath", configuredPath);
    return validation.isValid
      ? { kind: "resolved", binaryPath: validation.binaryPath }
      : { kind: "invalid-binary", failureClass: validation.failureClass };
  }

  private async discover(): Promise<BinaryResolution> {
    for (const candidate of this.discoveryCandidates()) {
      const validation = await this.validateCandidate(candidate);
      if (validation.isValid) {
        return { kind: "resolved", binaryPath: validation.binaryPath };
      }
    }
    return { kind: "no-binary" };
  }

  private discoveryCandidates(): Candidate[] {
    const { platform, storageDir } = this.dependencies;
    return [
      { label: "cdd on PATH", locate: () => this.findOnPath("cdd") },
      { label: "cdd-lint on PATH", locate: () => this.findOnPath("cdd-lint") },
      {
        label: "managed binary",
        locate: () => Promise.resolve(managedBinaryPath({ storageDir, platform })),
      },
    ];
  }

  private findOnPath(name: string): Promise<string | undefined> {
    const { getPathValue, platform } = this.dependencies;
    return findOnPath({ name, pathValue: getPathValue(), platform });
  }

  private async validateCandidate(candidate: Candidate): Promise<BinaryValidation> {
    const candidatePath = await candidate.locate();
    if (candidatePath === undefined) {
      this.dependencies.log.info(`Binary candidate ${candidate.label}: not-found`);
      return { isValid: false, failureClass: "not-found" };
    }
    return this.validate(candidate.label, candidatePath);
  }

  private async validate(label: string, candidatePath: string): Promise<BinaryValidation> {
    const validation = await validateBinary(candidatePath, this.dependencies.execFile);
    this.logValidation(`Binary candidate ${label} (${candidatePath})`, validation);
    return validation;
  }

  private logValidation(subject: string, validation: BinaryValidation): void {
    const { log } = this.dependencies;
    if (validation.isValid && validation.isDevBuild) {
      log.warn(`${subject} is a development build: ${validation.versionToken}`);
    } else if (validation.isValid) {
      log.info(`${subject}: valid, ${validation.versionToken}`);
    } else {
      log.info(`${subject}: ${validation.failureClass}`);
    }
  }
}
