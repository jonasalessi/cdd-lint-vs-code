import { beforeEach, describe, expect, it } from "vitest";
import { NotifyOnce } from "./notifyOnce";

describe("NotifyOnce", () => {
  let once: NotifyOnce;
  let shownKeys: string[];

  function show(key: string): void {
    once.show(key, () => shownKeys.push(key));
  }

  beforeEach(() => {
    once = new NotifyOnce();
    shownKeys = [];
  });

  it("shows the notification of the first call", () => {
    show("a");

    expect(shownKeys).toEqual(["a"]);
  });

  it("shows nothing for the second call with the same key", () => {
    show("a");
    show("a");

    expect(shownKeys).toEqual(["a"]);
  });

  it("shows the notification of each key", () => {
    show("a");
    show("b");

    expect(shownKeys).toEqual(["a", "b"]);
  });

  it("shows the notification again after a reset of the key", () => {
    show("a");
    once.reset("a");
    show("a");

    expect(shownKeys).toEqual(["a", "a"]);
  });

  it("keeps the other keys when one key is reset", () => {
    show("a");
    show("b");
    once.reset("a");
    show("b");

    expect(shownKeys).toEqual(["a", "b"]);
  });
});
