import { basename, extname } from "node:path";

export type DocumentIdentity = {
  scheme: string;
  filePath: string;
  workspaceFolderPath: string | undefined;
};

export type SupportedDocumentSelector = {
  scheme: string;
  pattern: string;
};

export const supportedExtensions = [".go", ".java", ".kt", ".ts", ".tsx"];

// The CodeLens provider and the status item register with these selectors.
export const supportedDocumentSelectors: SupportedDocumentSelector[] = supportedExtensions.map(
  (extension) => ({ scheme: "file", pattern: `**/*${extension}` }),
);

export function isSupportedDocument(document: DocumentIdentity): boolean {
  return (
    document.scheme === "file" &&
    document.workspaceFolderPath !== undefined &&
    supportedExtensions.includes(extname(document.filePath)) &&
    hasNoComma(basename(document.filePath))
  );
}

// The CLI splits its path arguments on commas.
function hasNoComma(fileName: string): boolean {
  return !fileName.includes(",");
}
