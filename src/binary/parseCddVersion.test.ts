import { describe, expect, it } from "vitest";
import { parseCddVersion } from "./parseCddVersion";

describe("parseCddVersion", () => {
  describe("the version examples of plan section 2.4", () => {
    it.each([
      ["cdd v0.1.0 (8646c46, 2026-09-24T19:55:54Z)\n", "v0.1.0"],
      ["cdd v0.1.0-19-g1b59eb0 (1b59eb0, 2026-09-30T10:00:00Z)\n", "v0.1.0-19-g1b59eb0"],
      ["cdd v0.1.0\n", "v0.1.0"],
    ])("supports the release line %j", (stdout, token) => {
      expect(parseCddVersion(stdout)).toEqual({ kind: "supported", token, isDevBuild: false });
    });

    it("supports a dev build and marks it", () => {
      expect(parseCddVersion("cdd dev (unknown, unknown)\n")).toEqual({
        kind: "supported",
        token: "dev",
        isDevBuild: true,
      });
    });
  });

  it.each(["v0.1.1", "v0.2.0", "v0.10.0", "v1.0.0", "v2.3.4-rc1"])(
    "supports the later release %s",
    (token) => {
      expect(parseCddVersion(`cdd ${token}\n`).kind).toBe("supported");
    },
  );

  it.each(["v0.0.9", "v0.0.99", "v0.1", "vnext", "0.1.0", "1.2.3"])(
    "gives unsupported-version for the token %s",
    (token) => {
      expect(parseCddVersion(`cdd ${token}\n`)).toEqual({ kind: "unsupported-version", token });
    },
  );

  it.each([
    ["an empty output", ""],
    ["another program", "git version 2.45.0\n"],
    ["no version token", "cdd\n"],
    ["two spaces before the token", "cdd  v0.1.0\n"],
    ["a version line that is not the first line", "warning\ncdd v0.1.0\n"],
  ])("gives not-cdd for %s", (_case, stdout) => {
    expect(parseCddVersion(stdout)).toEqual({ kind: "not-cdd" });
  });

  it("reads only the first line, also with Windows line ends", () => {
    expect(parseCddVersion("cdd v0.1.0\r\nmore text\r\n")).toEqual({
      kind: "supported",
      token: "v0.1.0",
      isDevBuild: false,
    });
  });
});
