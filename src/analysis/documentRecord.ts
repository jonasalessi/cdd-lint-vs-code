import type { RunOutcome } from "./classifyRun";
import type { CddUnit } from "./report";

export type RecordState =
  | "measured"
  | "not-applicable"
  | "warning"
  | "error"
  | "no-config"
  | "no-binary"
  | "invalid-binary"
  | "output-file-configured";

export type DocumentRecord = {
  state: RecordState;
  detail?: string;
  units: CddUnit[];
  blocked: boolean;
  isStale: boolean;
};

export function recordOfState(state: RecordState): DocumentRecord {
  return { state, units: [], blocked: false, isStale: false };
}

export function recordOfOutcome(outcome: RunOutcome): DocumentRecord {
  switch (outcome.kind) {
    case "measured":
      return { ...recordOfState("measured"), units: outcome.units, blocked: outcome.blocked };
    case "not-applicable":
      return recordOfState("not-applicable");
    case "not-measured":
      return recordOfNotMeasured(outcome);
    default:
      return recordOfState("error");
  }
}

function recordOfNotMeasured(outcome: RunOutcome & { kind: "not-measured" }): DocumentRecord {
  return outcome.reason === "file-warnings"
    ? { ...recordOfState("warning"), detail: outcome.warnings[0] }
    : recordOfState("error");
}
