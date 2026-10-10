import type { CacheClearCause } from "../binary/BinaryResolver";

export type VisibilityChange = {
  previousUris: ReadonlySet<string>;
  visibleUris: readonly string[];
  hasRecord: (uri: string) => boolean;
};

const binaryTriggerCauses: CacheClearCause[] = ["setting-changed", "installation-completed"];

// Trigger 2 of plan section 3.4.
export function documentsToAnalyzeOnVisibilityChange(change: VisibilityChange): string[] {
  const enteredUris = [...new Set(change.visibleUris)].filter(
    (uri) => !change.previousUris.has(uri),
  );
  return enteredUris.filter((uri) => !change.hasRecord(uri));
}

// Trigger 6 of plan section 3.4. A run that cannot start clears the cache but is not a trigger.
export function isBinaryTrigger(cause: CacheClearCause): boolean {
  return binaryTriggerCauses.includes(cause);
}
