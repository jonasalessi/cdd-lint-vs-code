import type { DocumentRecord, RecordState } from "../analysis/documentRecord";
import type { CddUnit } from "../analysis/report";

export type StatusSeverity = "information" | "warning" | "error";

export type StatusCommandId =
  "cdd.createConfiguration" | "cdd.installBinary" | "cdd.selectBinary" | "cdd.showOutput";

export type StatusInput = {
  isSupported: boolean;
  isPipelineActive: boolean;
  isDirty: boolean;
  record: DocumentRecord | undefined;
};

export type StatusText = {
  text: string;
  severity: StatusSeverity;
  busy: boolean;
  commandId?: StatusCommandId;
};

export const statusCommandTitles: Record<StatusCommandId, string> = {
  "cdd.createConfiguration": "Create Configuration",
  "cdd.installBinary": "Install",
  "cdd.selectBinary": "Select Binary",
  "cdd.showOutput": "Show Output",
};

const statusOfState: Record<RecordState, (record: DocumentRecord) => StatusText> = {
  measured: statusOfMeasured,
  "not-applicable": () => information("CDD: file not in the CDD configuration"),
  "no-config": () => information("CDD: no cdd.config.yaml", "cdd.createConfiguration"),
  "no-binary": () => warning("CDD: binary not found", "cdd.installBinary"),
  "invalid-binary": () => warning("CDD: configured binary not valid", "cdd.selectBinary"),
  "output-file-configured": () =>
    warning("CDD: reporter.outputFile is not supported in the editor"),
  warning: (record) => warning(`CDD: ${record.detail ?? "analysis warning"}`),
  error: () => ({
    text: "CDD: analysis failed",
    severity: "error",
    busy: false,
    commandId: "cdd.showOutput",
  }),
};

// The status table of plan section 3.11. The first row that applies wins.
export function statusText(input: StatusInput): StatusText {
  if (!input.isSupported) {
    return information("CDD: file not supported");
  }
  if (input.isPipelineActive) {
    return { ...information("CDD: analyzing"), busy: true };
  }
  return input.record === undefined
    ? statusWithNoRecord(input.isDirty)
    : statusOfState[input.record.state](input.record);
}

function statusWithNoRecord(isDirty: boolean): StatusText {
  return information(isDirty ? "CDD: save the file to analyze" : "CDD: not analyzed");
}

function statusOfMeasured(record: DocumentRecord): StatusText {
  const highestUnit = unitWithHighestTotal(record.units);
  return information(
    highestUnit === undefined
      ? "CDD: no code units"
      : `CDD: max ICP ${String(highestUnit.total)} / ${String(highestUnit.limit)}`,
  );
}

function unitWithHighestTotal(units: readonly CddUnit[]): CddUnit | undefined {
  return units.reduce<CddUnit | undefined>(
    (highest, unit) => (highest !== undefined && highest.total >= unit.total ? highest : unit),
    undefined,
  );
}

function information(text: string, commandId?: StatusCommandId): StatusText {
  return withCommand({ text, severity: "information", busy: false }, commandId);
}

function warning(text: string, commandId?: StatusCommandId): StatusText {
  return withCommand({ text, severity: "warning", busy: false }, commandId);
}

function withCommand(status: StatusText, commandId: StatusCommandId | undefined): StatusText {
  return commandId === undefined ? status : { ...status, commandId };
}
