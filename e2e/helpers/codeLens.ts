import * as vscode from "vscode";
import { waitFor } from "./waitFor";

export type ShownScore = {
  // 0-based line of the document.
  line: number;
  title: string;
};

export const toggleCommand = "cdd.toggleIcpDetails";

const scorePrefix = "ICP: ";

// Asks the CodeLens providers for the lenses of the document. Other extensions can add lenses.
async function codeLensesOf(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
  return vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    document.uri,
  );
}

export async function scoreLensesOf(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
  const lenses = await codeLensesOf(document);
  return lenses.filter((lens) => lens.command?.title.startsWith(scorePrefix));
}

export async function toggleLensesOf(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
  const lenses = await codeLensesOf(document);
  return lenses.filter((lens) => lens.command?.command === toggleCommand);
}

export async function shownScoresOf(document: vscode.TextDocument): Promise<ShownScore[]> {
  const lenses = await scoreLensesOf(document);
  return lenses.map((lens) => ({ line: lens.range.start.line, title: lens.command?.title ?? "" }));
}

// Waits until the score lenses of the document are equal to `expected`.
export async function waitForShownScores(
  document: vscode.TextDocument,
  expected: ShownScore[],
): Promise<void> {
  const expectedText = JSON.stringify(expected);
  await waitFor(`scores ${expectedText} of ${document.fileName}`, async () =>
    JSON.stringify(await shownScoresOf(document)) === expectedText ? true : undefined,
  );
}

export async function setShowCodeLens(isShown: boolean | undefined): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("cdd");
  await configuration.update("showCodeLens", isShown, vscode.ConfigurationTarget.Global);
}
