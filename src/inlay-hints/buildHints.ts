import type { DocumentRecord } from "../analysis/documentRecord";
import { excessOf } from "../analysis/excessOf";
import type { CddMetric, CddUnit } from "../analysis/report";

export type HintSource = {
  record: DocumentRecord | undefined;
  lineCount: number;
  showInlayHints: boolean;
};

export type Hint = {
  // 0-based line of the document.
  line: number;
  label: string;
  tooltipLines: string[];
};

const staleLine = "Unsaved changes: the score is from the last saved version.";

export function buildHints(source: HintSource): Hint[] {
  const { record, lineCount, showInlayHints } = source;
  if (record === undefined || !showInlayHints) {
    return [];
  }
  return record.units
    .filter((unit) => isLineOfDocument(unit.line - 1, lineCount))
    .map((unit) => hintOf(unit, record.isStale));
}

function isLineOfDocument(line: number, lineCount: number): boolean {
  return line >= 0 && line < lineCount;
}

function hintOf(unit: CddUnit, isStale: boolean): Hint {
  return {
    line: unit.line - 1,
    label: `ICP: ${String(unit.total)} / ${String(unit.limit)}`,
    tooltipLines: tooltipLinesOf(unit, isStale),
  };
}

function tooltipLinesOf(unit: CddUnit, isStale: boolean): string[] {
  return [
    `${unit.kind} ${unit.name}`,
    `ICP ${String(unit.total)} of limit ${String(unit.limit)}`,
    ...(unit.exceeds ? [`Over the limit by ${String(excessOf(unit))}`] : []),
    ...unit.metrics.filter((metric) => metric.count > 0).map(metricLineOf),
    ...(isStale ? [staleLine] : []),
  ];
}

function metricLineOf(metric: CddMetric): string {
  return `${metric.metric}: ${String(metric.count)} (${String(metric.score)})`;
}
