import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { relativePosixPath } from "./relativePosixPath";

const configDir = join(tmpdir(), "project");

describe("relativePosixPath", () => {
  it("gives the path of the document from the configuration directory", () => {
    expect(relativePosixPath(configDir, join(configDir, "src", "order.ts"))).toBe("src/order.ts");
  });

  it("gives the file name for a document in the configuration directory", () => {
    expect(relativePosixPath(configDir, join(configDir, "order.ts"))).toBe("order.ts");
  });

  it("uses / separators and no platform separator", () => {
    const relativePath = relativePosixPath(configDir, join(configDir, "a", "b", "order.ts"));

    expect(relativePath).toBe("a/b/order.ts");
    expect(relativePath.split("/").join("")).not.toContain(sep);
  });

  it("keeps a space in the path", () => {
    const documentPath = join(configDir, "my src", "order service.ts");

    expect(relativePosixPath(configDir, documentPath)).toBe("my src/order service.ts");
  });

  it.skipIf(process.platform === "win32")("does not resolve a symlink", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "cdd-relative-path-")));
    mkdirSync(join(root, "real", "src"), { recursive: true });
    symlinkSync(join(root, "real"), join(root, "link"));

    const relativePath = relativePosixPath(join(root, "link"), join(root, "link", "src", "a.ts"));

    rmSync(root, { recursive: true, force: true });
    expect(relativePath).toBe("src/a.ts");
  });
});
