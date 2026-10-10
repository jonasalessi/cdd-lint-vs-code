import * as vscode from "vscode";
import { waitFor } from "./waitFor";

export type ShownDiagnostic = {
  // 0-based line of the document.
  line: number;
  message: string;
};

// Other extensions, for example the TypeScript extension, publish diagnostics for the same file.
export function cddDiagnosticsOf(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter((diagnostic) => diagnostic.source === "CDD");
}

export function shownDiagnosticsOf(uri: vscode.Uri): ShownDiagnostic[] {
  return cddDiagnosticsOf(uri).map((diagnostic) => ({
    line: diagnostic.range.start.line,
    message: diagnostic.message,
  }));
}

// Waits until the CDD diagnostics of the file are equal to `expected`.
export async function waitForShownDiagnostics(
  uri: vscode.Uri,
  expected: ShownDiagnostic[],
): Promise<void> {
  const expectedText = JSON.stringify(expected);
  await waitFor(`diagnostics ${expectedText} of ${uri.fsPath}`, () =>
    JSON.stringify(shownDiagnosticsOf(uri)) === expectedText ? true : undefined,
  );
}

export async function setShowDiagnostics(isShown: boolean | undefined): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("cdd");
  await configuration.update("showDiagnostics", isShown, vscode.ConfigurationTarget.Global);
}
