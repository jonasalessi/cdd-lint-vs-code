import { describe, expect, it } from "vitest";
import type { RunOutcome } from "./classifyRun";
import { recordOfOutcome, recordOfState } from "./documentRecord";
import type { CddUnit } from "./report";

const unit: CddUnit = {
  name: "Order",
  kind: "class",
  line: 3,
  col: 1,
  total: 16.5,
  limit: 10,
  exceeds: true,
  metrics: [{ metric: "code_branch", count: 2, score: 2 }],
};

const outcomesAndStates: [RunOutcome, string][] = [
  [{ kind: "measured", units: [unit], blocked: true }, "measured"],
  [{ kind: "not-applicable" }, "not-applicable"],
  [
    { kind: "not-measured", reason: "file-warnings", warnings: ["syntax error at 3:14"] },
    "warning",
  ],
  [{ kind: "not-measured", reason: "partial" }, "error"],
  [{ kind: "failed" }, "error"],
  [{ kind: "config-error" }, "error"],
];

describe("recordOfOutcome", () => {
  it.each(outcomesAndStates)("maps the outcome %j to the state %s", (outcome, state) => {
    expect(recordOfOutcome(outcome).state).toBe(state);
  });

  it("keeps the units and blocked of a measured outcome", () => {
    const record = recordOfOutcome({ kind: "measured", units: [unit], blocked: true });

    expect(record).toEqual({ state: "measured", units: [unit], blocked: true, isStale: false });
  });

  it("has no units and is not blocked unless the state is measured", () => {
    const otherRecords = outcomesAndStates.slice(1).map(([outcome]) => recordOfOutcome(outcome));

    expect(otherRecords.map((record) => record.units)).toEqual([[], [], [], [], []]);
    expect(otherRecords.map((record) => record.blocked)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("keeps the first warning as the detail", () => {
    const record = recordOfOutcome({
      kind: "not-measured",
      reason: "file-warnings",
      warnings: ["syntax error at 3:14", "syntax error at 9:1"],
    });

    expect(record.detail).toBe("syntax error at 3:14");
  });

  it("gives a record that is not stale", () => {
    const records = outcomesAndStates.map(([outcome]) => recordOfOutcome(outcome));

    expect(records.every((record) => !record.isStale)).toBe(true);
  });
});

describe("recordOfState", () => {
  it("gives an empty record with the state", () => {
    expect(recordOfState("no-config")).toEqual({
      state: "no-config",
      units: [],
      blocked: false,
      isStale: false,
    });
  });
});
