import { describe, expect, it } from "vitest";
import { documentsToAnalyzeOnVisibilityChange, isBinaryTrigger } from "./triggerRules";

const orderUri = "file:///project/order.ts";
const invoiceUri = "file:///project/invoice.ts";

function documentsToAnalyze(previous: string[], visible: string[], withRecord: string[] = []) {
  return documentsToAnalyzeOnVisibilityChange({
    previousUris: new Set(previous),
    visibleUris: visible,
    hasRecord: (uri) => withRecord.includes(uri),
  });
}

describe("documentsToAnalyzeOnVisibilityChange", () => {
  it("gives a document that enters the visible set and has no record", () => {
    expect(documentsToAnalyze([], [orderUri])).toEqual([orderUri]);
  });

  it("gives nothing for a document that has a record", () => {
    expect(documentsToAnalyze([], [orderUri], [orderUri])).toEqual([]);
  });

  it("gives nothing for a document that stays visible", () => {
    expect(documentsToAnalyze([orderUri], [orderUri, invoiceUri])).toEqual([invoiceUri]);
  });

  it("gives a document one time when two editors show it", () => {
    expect(documentsToAnalyze([], [orderUri, orderUri])).toEqual([orderUri]);
  });

  it("gives a document that was hidden and enters again", () => {
    expect(documentsToAnalyze([invoiceUri], [orderUri])).toEqual([orderUri]);
  });
});

describe("isBinaryTrigger", () => {
  it("is true for a change of the setting and for a completed installation", () => {
    expect(isBinaryTrigger("setting-changed")).toBe(true);
    expect(isBinaryTrigger("installation-completed")).toBe(true);
  });

  it("is false for a run that cannot start", () => {
    expect(isBinaryTrigger("run-start-failed")).toBe(false);
  });
});
