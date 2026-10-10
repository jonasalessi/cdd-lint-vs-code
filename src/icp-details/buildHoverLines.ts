import type { DocumentRecord } from "../analysis/documentRecord";
import type { CddOccurrence, CddUnit } from "../analysis/report";
import { scoredOccurrencesOf, type UnitOccurrence } from "./scoredOccurrences";

export type Cursor = {
  // 0-based line and UTF-16 character of the document.
  line: number;
  character: number;
  lineText: string;
};

type BytePosition = { line: number; column: number };

export function buildHoverLines(record: DocumentRecord | undefined, cursor: Cursor): string[] {
  const position = bytePositionOf(cursor);
  const matches = scoredOccurrencesOf(record).filter(({ occurrence }) =>
    isOnOccurrence(position, occurrence),
  );
  return [...matches.map(occurrenceLineOf), ...unitsOf(matches).map(unitLineOf)];
}

// The report counts a column in UTF-8 bytes, and VS Code counts a character in UTF-16 units.
function bytePositionOf(cursor: Cursor): BytePosition {
  const textBeforeCursor = cursor.lineText.slice(0, cursor.character);
  return { line: cursor.line + 1, column: Buffer.byteLength(textBeforeCursor, "utf8") + 1 };
}

// An occurrence of more than one line covers a full block, for example the body of a loop.
// Only its first line is its hover zone, so that the body does not repeat the hover of the loop.
function isOnOccurrence(position: BytePosition, occurrence: CddOccurrence): boolean {
  const isOnFirstLine = position.line === occurrence.line && position.column >= occurrence.col;
  const endsOnFirstLine = occurrence.end_line === occurrence.line;
  return isOnFirstLine && (!endsOnFirstLine || position.column < occurrence.end_col);
}

function occurrenceLineOf({ occurrence }: UnitOccurrence): string {
  return `${occurrence.metric}: +${String(occurrence.score)} ICP`;
}

function unitsOf(matches: UnitOccurrence[]): CddUnit[] {
  return [...new Set(matches.map(({ unit }) => unit))];
}

function unitLineOf(unit: CddUnit): string {
  return `${unit.kind} ${unit.name}: ICP ${String(unit.total)} of limit ${String(unit.limit)}`;
}
