import type { CddUnit } from "./report";

export type TextPosition = { line: number; character: number };

export type ContentChange = { start: TextPosition; end: TextPosition; text: string };

const lineBreakPattern = /\r\n|\r|\n/g;

export function shiftUnits(
  units: readonly CddUnit[],
  changes: readonly ContentChange[],
): CddUnit[] {
  return fromLastToFirst(changes).reduce(applyChange, [...units]);
}

function fromLastToFirst(changes: readonly ContentChange[]): ContentChange[] {
  return [...changes].sort((first, second) => comparePositions(second.start, first.start));
}

function comparePositions(first: TextPosition, second: TextPosition): number {
  return first.line - second.line || first.character - second.character;
}

function applyChange(units: CddUnit[], change: ContentChange): CddUnit[] {
  return units.flatMap((unit) => {
    const bufferLine = shiftedLine(unit.line - 1, change);
    return bufferLine === undefined ? [] : [{ ...unit, line: bufferLine + 1 }];
  });
}

// The rules of plan section 3.9. The result undefined means that the unit line was removed.
function shiftedLine(unitLine: number, change: ContentChange): number | undefined {
  if (endsBeforeLine(change, unitLine)) {
    return unitLine + lineDelta(change);
  }
  const keepsLine = startsAfterLineStart(change, unitLine) || staysInOneLine(change);
  return keepsLine ? unitLine : undefined;
}

function endsBeforeLine(change: ContentChange, unitLine: number): boolean {
  const { end } = change;
  return end.line < unitLine || (end.line === unitLine && end.character === 0);
}

function startsAfterLineStart(change: ContentChange, unitLine: number): boolean {
  const { start } = change;
  return start.line > unitLine || (start.line === unitLine && start.character > 0);
}

function staysInOneLine(change: ContentChange): boolean {
  return change.start.line === change.end.line && lineBreaks(change.text) === 0;
}

function lineDelta(change: ContentChange): number {
  return lineBreaks(change.text) - (change.end.line - change.start.line);
}

function lineBreaks(text: string): number {
  return text.match(lineBreakPattern)?.length ?? 0;
}
