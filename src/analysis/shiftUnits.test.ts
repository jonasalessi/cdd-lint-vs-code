import { describe, expect, it } from "vitest";
import type { CddUnit } from "./report";
import { shiftUnits, type ContentChange } from "./shiftUnits";

const unitBufferLine = 2;

function unitOnBufferLine(bufferLine: number, name = "Order"): CddUnit {
  return {
    name,
    kind: "class",
    line: bufferLine + 1,
    col: 1,
    total: 16.5,
    limit: 10,
    exceeds: true,
    metrics: [],
  };
}

function change(start: [number, number], end: [number, number], text: string): ContentChange {
  return {
    start: { line: start[0], character: start[1] },
    end: { line: end[0], character: end[1] },
    text,
  };
}

function insertion(line: number, character: number, text: string): ContentChange {
  return change([line, character], [line, character], text);
}

function bufferLinesAfter(...changes: ContentChange[]): number[] {
  return shiftUnits([unitOnBufferLine(unitBufferLine)], changes).map((unit) => unit.line - 1);
}

describe("shiftUnits", () => {
  it("moves the unit down when a line is added above it", () => {
    expect(bufferLinesAfter(insertion(0, 0, "// note\n"))).toEqual([3]);
  });

  it("moves the unit up when a line is removed above it", () => {
    expect(bufferLinesAfter(change([1, 0], [2, 0], ""))).toEqual([1]);
  });

  it("moves the unit down when a line break is added at column 0 of its line", () => {
    expect(bufferLinesAfter(insertion(2, 0, "\n"))).toEqual([3]);
  });

  it("keeps the unit when a line break is added at the end of its line", () => {
    expect(bufferLinesAfter(insertion(2, 14, "\n"))).toEqual([2]);
  });

  it("keeps the unit when text is typed in its line", () => {
    expect(bufferLinesAfter(insertion(2, 0, "export "))).toEqual([2]);
    expect(bufferLinesAfter(insertion(2, 5, "x"))).toEqual([2]);
  });

  it("removes the unit when its line is removed", () => {
    expect(bufferLinesAfter(change([2, 0], [3, 0], ""))).toEqual([]);
  });

  it("removes the unit when a range that starts above it ends inside its line", () => {
    expect(bufferLinesAfter(change([1, 4], [2, 3], ""))).toEqual([]);
  });

  it("keeps the unit when the edit is below it", () => {
    expect(bufferLinesAfter(insertion(4, 0, "\n\n"))).toEqual([2]);
    expect(bufferLinesAfter(change([3, 0], [5, 0], ""))).toEqual([2]);
  });

  it("applies one event with two changes, one above and one below the unit", () => {
    const above = insertion(0, 0, "// one\n// two\n");
    const below = insertion(5, 0, "// three\n");

    expect(bufferLinesAfter(above, below)).toEqual([4]);
    expect(bufferLinesAfter(below, above)).toEqual([4]);
  });

  it("counts a Windows line break as one line break", () => {
    expect(bufferLinesAfter(insertion(0, 0, "a\r\nb\r\n"))).toEqual([4]);
  });

  it("changes only the line of a unit and does not change its input", () => {
    const units = [unitOnBufferLine(2, "Order"), unitOnBufferLine(6, "Invoice")];

    const shifted = shiftUnits(units, [insertion(4, 0, "\n")]);

    expect(shifted).toEqual([unitOnBufferLine(2, "Order"), unitOnBufferLine(7, "Invoice")]);
    expect(units[1]?.line).toBe(7);
  });
});
