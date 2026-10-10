import type { DocumentRecord } from "../analysis/documentRecord";
import { excessOf } from "../analysis/excessOf";
import type { CddUnit } from "../analysis/report";

export type DiagnosticSource = {
  record: DocumentRecord | undefined;
  lineCount: number;
  // The text of a 0-based line of the document.
  lineTextAt: (line: number) => string;
  showDiagnostics: boolean;
};

export type IcpSeverity = "error" | "warning";

export type IcpDiagnostic = {
  // 0-based line of the document.
  line: number;
  startCharacter: number;
  endCharacter: number;
  severity: IcpSeverity;
  message: string;
  source: "CDD";
  code: "icp-limit";
};

type LineSpan = Pick<IcpDiagnostic, "line" | "startCharacter" | "endCharacter">;

export function buildDiagnostics(source: DiagnosticSource): IcpDiagnostic[] {
  const { record, lineCount, lineTextAt, showDiagnostics } = source;
  if (record === undefined || !showDiagnostics) {
    return [];
  }
  const severity = severityOf(record);
  return record.units
    .filter((unit) => unit.exceeds && isLineOfDocument(unit.line - 1, lineCount))
    .map((unit) => diagnosticOf(unit, severity, lineTextAt(unit.line - 1)));
}

function severityOf(record: DocumentRecord): IcpSeverity {
  return record.blocked ? "error" : "warning";
}

function isLineOfDocument(line: number, lineCount: number): boolean {
  return line >= 0 && line < lineCount;
}

function diagnosticOf(unit: CddUnit, severity: IcpSeverity, lineText: string): IcpDiagnostic {
  return {
    ...lineSpanOf(unit.line - 1, lineText),
    severity,
    message: messageOf(unit),
    source: "CDD",
    code: "icp-limit",
  };
}

function lineSpanOf(line: number, lineText: string): LineSpan {
  const firstTextCharacter = lineText.search(/\S/);
  const hasText = firstTextCharacter >= 0;
  return {
    line,
    startCharacter: hasText ? firstTextCharacter : lineText.length,
    endCharacter: lineText.length,
  };
}

function messageOf(unit: CddUnit): string {
  const score = `ICP ${String(unit.total)}, limit ${String(unit.limit)}`;
  return `${unit.kind} ${unit.name} has ${score} (over by ${String(excessOf(unit))}).`;
}
