import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSupportedDocument,
  supportedDocumentSelectors,
  type DocumentIdentity,
} from "./isSupportedDocument";

const workspaceFolderPath = join(tmpdir(), "workspace");

function documentNamed(fileName: string, changes: Partial<DocumentIdentity> = {}) {
  const filePath = join(workspaceFolderPath, "src", fileName);
  return { scheme: "file", filePath, workspaceFolderPath, ...changes };
}

describe("isSupportedDocument", () => {
  it.each(["order.go", "Order.java", "Order.kt", "order.ts", "Order.tsx", "order.d.ts"])(
    "supports %s",
    (fileName) => {
      expect(isSupportedDocument(documentNamed(fileName))).toBe(true);
    },
  );

  it.each(["order.js", "order.jsx", "order.kts", "order.py", "order.ts.bak", "order", ".ts"])(
    "does not support %s",
    (fileName) => {
      expect(isSupportedDocument(documentNamed(fileName))).toBe(false);
    },
  );

  it("does not support an extension with another letter case", () => {
    expect(isSupportedDocument(documentNamed("order.TS"))).toBe(false);
  });

  it.each(["untitled", "git", "vscode-vfs", "vscode-notebook-cell"])(
    "does not support the scheme %s",
    (scheme) => {
      expect(isSupportedDocument(documentNamed("order.ts", { scheme }))).toBe(false);
    },
  );

  it("does not support a document with no workspace folder", () => {
    const document = documentNamed("order.ts", { workspaceFolderPath: undefined });

    expect(isSupportedDocument(document)).toBe(false);
  });

  it("does not support a file name with a comma", () => {
    expect(isSupportedDocument(documentNamed("order,invoice.ts"))).toBe(false);
  });

  it("supports a file name with a space", () => {
    expect(isSupportedDocument(documentNamed("order service.ts"))).toBe(true);
  });
});

describe("supportedDocumentSelectors", () => {
  it("has one file selector for each supported extension", () => {
    expect(supportedDocumentSelectors).toEqual([
      { scheme: "file", pattern: "**/*.go" },
      { scheme: "file", pattern: "**/*.java" },
      { scheme: "file", pattern: "**/*.kt" },
      { scheme: "file", pattern: "**/*.ts" },
      { scheme: "file", pattern: "**/*.tsx" },
    ]);
  });
});
