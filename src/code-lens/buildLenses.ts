import type { DocumentRecord } from "../analysis/documentRecord";
import { excessOf } from "../analysis/excessOf";
import type { CddMetric, CddUnit } from "../analysis/report";

export type LensSource = {
  record: DocumentRecord | undefined;
  lineCount: number;
  showCodeLens: boolean;
  areDetailsShown: boolean;
};

// The two lenses of one code unit: the score, and the toggle of the ICP details.
export type UnitLens = {
  // 0-based line of the document.
  line: number;
  scoreTitle: string;
  tooltipLines: string[];
  toggleTitle: string;
};

const staleLine = "Unsaved changes: the score is from the last saved version.";

export function buildLenses(source: LensSource): UnitLens[] {
  const { record, lineCount, showCodeLens, areDetailsShown } = source;
  if (record === undefined || !showCodeLens) {
    return [];
  }
  const toggleTitle = areDetailsShown ? "Hide ICP Details" : "Show ICP Details";
  return record.units
    .filter((unit) => hasComplexity(unit) && isLineOfDocument(unit.line - 1, lineCount))
    .map((unit) => ({ ...scoreOf(unit, record.isStale), toggleTitle }));
}

function hasComplexity(unit: CddUnit): boolean {
  return unit.total > 0;
}

function isLineOfDocument(line: number, lineCount: number): boolean {
  return line >= 0 && line < lineCount;
}

function scoreOf(unit: CddUnit, isStale: boolean): Omit<UnitLens, "toggleTitle"> {
  return {
    line: unit.line - 1,
    scoreTitle: `ICP: ${String(unit.total)} / ${String(unit.limit)}`,
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
