import { describe, expect, it } from "vitest";
import { excessOf } from "./excessOf";
import type { CddUnit } from "./report";

function unitOf(total: number, limit: number): CddUnit {
  return {
    name: "Order",
    kind: "class",
    line: 1,
    col: 1,
    total,
    limit,
    exceeds: true,
    metrics: [],
  };
}

describe("excessOf", () => {
  it("gives the difference between the total and the limit", () => {
    expect(excessOf(unitOf(12, 10))).toBe(2);
  });

  it("gives 0.3 for total 10.3 and limit 10", () => {
    expect(excessOf(unitOf(10.3, 10))).toBe(0.3);
  });

  it("keeps a maximum of two decimal places", () => {
    expect(excessOf(unitOf(10.126, 10))).toBe(0.13);
  });
});
