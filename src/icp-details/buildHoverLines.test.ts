import { describe, expect, it } from "vitest";
import type { CddOccurrence } from "../analysis/report";
import { buildHoverLines } from "./buildHoverLines";
import { occurrenceOf, recordOf, unitOf } from "./occurrenceFixtures";

// Line 5 of the document. The condition "item > 0" is at the 1-based columns 11 to 18.
const conditionLineText = "      if (item > 0 && discount > 0) {";
const condition = occurrenceOf({ metric: "condition", line: 5, col: 11, end_line: 5, end_col: 19 });
const branch = occurrenceOf({ metric: "code_branch", line: 5, col: 7, end_line: 9, end_col: 8 });
const unitLine = "class Order: ICP 8 of limit 7";

function hoverLinesAt(occurrences: CddOccurrence[], character: number, line = 4): string[] {
  const record = recordOf([unitOf(occurrences)]);
  return buildHoverLines(record, { line, character, lineText: conditionLineText });
}

describe("buildHoverLines", () => {
  it("names the metric and the score of the occurrence, then the unit", () => {
    expect(hoverLinesAt([condition], 10)).toEqual(["condition: +1 ICP", unitLine]);
  });

  it.each([
    ["the character before the first", 9, false],
    ["the first character", 10, true],
    ["the last character", 17, true],
    ["the character after the last", 18, false],
  ])("for a one-line occurrence, %s has a hover: %s", (_place, character, hasHover) => {
    expect(hoverLinesAt([condition], character).length > 0).toBe(hasHover);
  });

  it("gives a hover from the start to the end of the first line of a block occurrence", () => {
    expect(hoverLinesAt([branch], 5)).toEqual([]);
    expect(hoverLinesAt([branch], 6)).toEqual(["code_branch: +1 ICP", unitLine]);
    expect(hoverLinesAt([branch], conditionLineText.length)).toHaveLength(2);
  });

  it("gives no hover in the body of a block occurrence", () => {
    expect(hoverLinesAt([branch], 8, 5)).toEqual([]);
    expect(hoverLinesAt([branch], 6, 8)).toEqual([]);
  });

  it("lists each occurrence under the cursor and names the unit one time", () => {
    expect(hoverLinesAt([branch, condition], 12)).toEqual([
      "code_branch: +1 ICP",
      "condition: +1 ICP",
      unitLine,
    ]);
  });

  it("names the unit that owns the occurrence", () => {
    const record = recordOf([
      unitOf([occurrenceOf({ line: 2 })]),
      unitOf([condition], { name: "isPaid", kind: "function", total: 1, limit: 10 }),
    ]);

    const hoverLines = buildHoverLines(record, {
      line: 4,
      character: 10,
      lineText: conditionLineText,
    });

    expect(hoverLines).toEqual(["condition: +1 ICP", "function isPaid: ICP 1 of limit 10"]);
  });

  it("does not round a decimal score", () => {
    const coupling = { ...condition, metric: "external_coupling", score: 0.5 };

    expect(hoverLinesAt([coupling], 10)[0]).toBe("external_coupling: +0.5 ICP");
  });

  it("converts the UTF-16 character of the cursor to the byte column of the report", () => {
    // "é" is 2 bytes and "😀" is 4 bytes. The ternary starts at byte column 23, character 19.
    const lineText = "  return /* é😀 */ a > 0 ? a : b;";
    const ternary = occurrenceOf({ line: 2, col: 23, end_line: 2, end_col: 36 });
    const record = recordOf([unitOf([ternary])]);

    expect(buildHoverLines(record, { line: 1, character: 18, lineText })).toEqual([]);
    expect(buildHoverLines(record, { line: 1, character: 19, lineText })).toHaveLength(2);
    expect(buildHoverLines(record, { line: 1, character: 31, lineText })).toHaveLength(2);
    expect(buildHoverLines(record, { line: 1, character: 32, lineText })).toEqual([]);
  });

  it("gives no hover for an occurrence with a score of 0", () => {
    expect(hoverLinesAt([{ ...condition, score: 0 }], 10)).toEqual([]);
  });

  it("gives no hover for a stale record", () => {
    const record = recordOf([unitOf([condition])], { isStale: true });

    expect(
      buildHoverLines(record, { line: 4, character: 10, lineText: conditionLineText }),
    ).toEqual([]);
  });

  it("gives no hover for a document that has no record", () => {
    const cursor = { line: 4, character: 10, lineText: conditionLineText };

    expect(buildHoverLines(undefined, cursor)).toEqual([]);
  });
});
