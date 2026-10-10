import { parse } from "yaml";

export type OutputFileSetting =
  { kind: "not-set" } | { kind: "set" } | { kind: "unparsable"; reason: string };

export function readOutputFile(configText: string): OutputFileSetting {
  try {
    return settingOf(parse(configText));
  } catch (error) {
    return { kind: "unparsable", reason: String(error) };
  }
}

function settingOf(config: unknown): OutputFileSetting {
  const outputFile = outputFileOf(config);
  const isSet = outputFile !== undefined && outputFile !== null;
  return isSet ? { kind: "set" } : { kind: "not-set" };
}

function outputFileOf(config: unknown): unknown {
  const reporter = isRecord(config) ? config.reporter : undefined;
  return isRecord(reporter) ? reporter.outputFile : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
