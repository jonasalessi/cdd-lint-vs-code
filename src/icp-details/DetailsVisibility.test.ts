import { describe, expect, it } from "vitest";
import { DetailsVisibility } from "./DetailsVisibility";

const orderUri = "file:///project/src/order.ts";
const invoiceUri = "file:///project/src/invoice.ts";

describe("DetailsVisibility", () => {
  it("shows no details before the first toggle", () => {
    expect(new DetailsVisibility().isShown(orderUri)).toBe(false);
  });

  it("shows the details of a document after one toggle and hides them after two", () => {
    const visibility = new DetailsVisibility();

    visibility.toggle(orderUri);
    expect(visibility.isShown(orderUri)).toBe(true);

    visibility.toggle(orderUri);
    expect(visibility.isShown(orderUri)).toBe(false);
  });

  it("keeps the state of each document apart", () => {
    const visibility = new DetailsVisibility();

    visibility.toggle(orderUri);

    expect(visibility.isShown(invoiceUri)).toBe(false);
  });

  it("tells each listener the URI of a toggle, until the listener is disposed", () => {
    const visibility = new DetailsVisibility();
    const toggledUris: string[] = [];
    const subscription = visibility.onDidChange((uri) => toggledUris.push(uri));

    visibility.toggle(orderUri);
    visibility.toggle(invoiceUri);
    subscription.dispose();
    visibility.toggle(orderUri);

    expect(toggledUris).toEqual([orderUri, invoiceUri]);
  });
});
