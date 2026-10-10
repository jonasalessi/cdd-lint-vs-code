import * as vscode from "vscode";
import { waitFor } from "./waitFor";

export type ShownHint = {
  // 0-based line of the document.
  line: number;
  label: string;
};

// Asks the Inlay Hints providers for the hints of the full document.
export async function inlayHintsOf(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
  const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
  return vscode.commands.executeCommand<vscode.InlayHint[]>(
    "vscode.executeInlayHintProvider",
    document.uri,
    fullRange,
  );
}

export async function shownHintsOf(document: vscode.TextDocument): Promise<ShownHint[]> {
  const hints = await inlayHintsOf(document);
  return hints.map((hint) => ({ line: hint.position.line, label: labelTextOf(hint) }));
}

// Waits until the hints of the document are equal to `expected`.
export async function waitForShownHints(
  document: vscode.TextDocument,
  expected: ShownHint[],
): Promise<void> {
  const expectedText = JSON.stringify(expected);
  await waitFor(`hints ${expectedText} of ${document.fileName}`, async () =>
    JSON.stringify(await shownHintsOf(document)) === expectedText ? true : undefined,
  );
}

export async function setShowInlayHints(isShown: boolean | undefined): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("cdd");
  await configuration.update("showInlayHints", isShown, vscode.ConfigurationTarget.Global);
}

function labelTextOf(hint: vscode.InlayHint): string {
  return typeof hint.label === "string"
    ? hint.label
    : hint.label.map((part) => part.value).join("");
}
