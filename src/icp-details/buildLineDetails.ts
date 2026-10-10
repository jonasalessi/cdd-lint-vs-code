import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddOccurrence } from "../analysis/report";
import { scoredOccurrencesOf } from "./scoredOccurrences";

export type LineDetailSource = {
  record: DocumentRecord | undefined;
  lineCount: number;
  showDetails: boolean;
};

export type LineDetail = {
  // 0-based line of the document.
  line: number;
  label: string;
};

type MetricCounts = Map<string, number>;

export function buildLineDetails(source: LineDetailSource): LineDetail[] {
  if (!source.showDetails) {
    return [];
  }
  const occurrences = scoredOccurrencesOf(source.record)
    .map(({ occurrence }) => occurrence)
    .filter((occurrence) => isLineOfDocument(occurrence.line - 1, source.lineCount));
  return [...groupByLine(occurrences)]
    .sort(([firstLine], [secondLine]) => firstLine - secondLine)
    .map(([line, lineOccurrences]) => ({ line: line - 1, label: labelOf(lineOccurrences) }));
}

function isLineOfDocument(line: number, lineCount: number): boolean {
  return line >= 0 && line < lineCount;
}

function groupByLine(occurrences: CddOccurrence[]): Map<number, CddOccurrence[]> {
  const occurrencesOfLine = new Map<number, CddOccurrence[]>();
  occurrences.forEach((occurrence) => {
    occurrencesOfLine.set(occurrence.line, [
      ...(occurrencesOfLine.get(occurrence.line) ?? []),
      occurrence,
    ]);
  });
  return occurrencesOfLine;
}

function labelOf(occurrences: CddOccurrence[]): string {
  const metricParts = [...countByMetric(occurrences)].map(
    ([metric, count]) => `${String(count)} ${metric}`,
  );
  return `+${String(scoreOf(occurrences))} ICP · ${metricParts.join(", ")}`;
}

function scoreOf(occurrences: CddOccurrence[]): number {
  const score = occurrences.reduce((sum, occurrence) => sum + occurrence.score, 0);
  return Number(score.toFixed(2));
}

function countByMetric(occurrences: CddOccurrence[]): MetricCounts {
  const counts: MetricCounts = new Map();
  occurrences.forEach(({ metric, count }) => counts.set(metric, (counts.get(metric) ?? 0) + count));
  return counts;
}
