import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisStore } from "./AnalysisStore";
import type { RunOutcome } from "./classifyRun";
import { recordOfOutcome, recordOfState } from "./documentRecord";
import type { CddUnit } from "./report";
import type { ContentChange } from "./shiftUnits";

const orderUri = "file:///project/src/order.ts";
const invoiceUri = "file:///project/src/invoice.ts";

const unit: CddUnit = {
  name: "Order",
  kind: "class",
  line: 3,
  col: 1,
  total: 16.5,
  limit: 10,
  exceeds: true,
  metrics: [],
};

const measured: RunOutcome = { kind: "measured", units: [unit], blocked: true };
const lineAddedAbove: ContentChange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
  text: "\n",
};

const outcomesAndStates: [RunOutcome, string][] = [
  [measured, "measured"],
  [{ kind: "not-applicable" }, "not-applicable"],
  [
    { kind: "not-measured", reason: "file-warnings", warnings: ["syntax error at 3:14"] },
    "warning",
  ],
  [{ kind: "not-measured", reason: "partial" }, "error"],
  [{ kind: "failed" }, "error"],
  [{ kind: "config-error" }, "error"],
];

describe("AnalysisStore", () => {
  let store: AnalysisStore;
  let changedUris: string[];

  beforeEach(() => {
    store = new AnalysisStore();
    changedUris = [];
    store.onDidChange((uri) => changedUris.push(uri));
  });

  describe("records", () => {
    it("has no record for a document that was not analyzed", () => {
      expect(store.get(orderUri)).toBeUndefined();
      expect(store.has(orderUri)).toBe(false);
    });

    it.each(outcomesAndStates)("keeps the outcome %j with the state %s", (outcome, state) => {
      store.set(orderUri, recordOfOutcome(outcome));

      expect(store.get(orderUri)?.state).toBe(state);
      expect(store.get(orderUri)?.units).toEqual(state === "measured" ? [unit] : []);
    });

    it("replaces the record of the document", () => {
      store.set(orderUri, recordOfOutcome(measured));
      store.set(orderUri, recordOfState("no-binary"));

      expect(store.get(orderUri)).toEqual(recordOfState("no-binary"));
    });

    it("keeps one record for each document", () => {
      store.set(orderUri, recordOfOutcome(measured));
      store.set(invoiceUri, recordOfState("no-config"));

      expect(store.get(orderUri)?.state).toBe("measured");
      expect(store.get(invoiceUri)?.state).toBe("no-config");
    });
  });

  describe("edits", () => {
    it("marks the record as stale and moves its units", () => {
      store.set(orderUri, recordOfOutcome(measured));

      store.applyContentChanges(orderUri, [lineAddedAbove]);

      expect(store.get(orderUri)).toEqual({
        state: "measured",
        units: [{ ...unit, line: 4 }],
        blocked: true,
        isStale: true,
      });
    });

    it("marks a record with no units as stale", () => {
      store.set(orderUri, recordOfState("not-applicable"));

      store.applyContentChanges(orderUri, [lineAddedAbove]);

      expect(store.get(orderUri)).toEqual({ ...recordOfState("not-applicable"), isStale: true });
    });

    it("creates no record for a document that has none", () => {
      store.applyContentChanges(orderUri, [lineAddedAbove]);

      expect(store.has(orderUri)).toBe(false);
      expect(changedUris).toEqual([]);
    });

    it("changes nothing for an event with no content changes", () => {
      store.set(orderUri, recordOfOutcome(measured));

      store.applyContentChanges(orderUri, []);

      expect(store.get(orderUri)?.isStale).toBe(false);
      expect(changedUris).toEqual([orderUri]);
    });

    it("gives a record that is not stale when the pipeline replaces a stale record", () => {
      store.set(orderUri, recordOfOutcome(measured));
      store.applyContentChanges(orderUri, [lineAddedAbove]);

      store.set(orderUri, recordOfOutcome(measured));

      expect(store.get(orderUri)?.isStale).toBe(false);
    });
  });

  describe("change events", () => {
    it("emits one event with the URI for each mutation", () => {
      store.set(orderUri, recordOfOutcome(measured));
      store.applyContentChanges(orderUri, [lineAddedAbove]);
      store.set(invoiceUri, recordOfState("no-config"));
      store.delete(orderUri);

      expect(changedUris).toEqual([orderUri, orderUri, invoiceUri, orderUri]);
    });

    it("emits no event when it deletes a record that does not exist", () => {
      store.delete(orderUri);

      expect(changedUris).toEqual([]);
    });

    it("deletes all records and emits one event for each", () => {
      store.set(orderUri, recordOfOutcome(measured));
      store.set(invoiceUri, recordOfState("no-config"));
      changedUris.length = 0;

      store.clear();

      expect(store.has(orderUri)).toBe(false);
      expect(store.has(invoiceUri)).toBe(false);
      expect(changedUris).toEqual([orderUri, invoiceUri]);
    });

    it("stops the events of a subscription that was disposed", () => {
      const otherUris: string[] = [];
      const subscription = store.onDidChange((uri) => otherUris.push(uri));

      subscription.dispose();
      store.set(orderUri, recordOfState("no-config"));

      expect(otherUris).toEqual([]);
    });
  });
});
