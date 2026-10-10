import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  fakeUnit,
  installFakeCdd,
  reportOf,
  resetCallLog,
  setFakeResponse,
  uninstallFakeCdd,
  waitForRuns,
} from "./helpers/fakeCdd";
import { toggleCommand, toggleLensesOf, waitForShownScores } from "./helpers/codeLens";
import { waitFor } from "./helpers/waitFor";
import {
  activateExtension,
  closeAllEditors,
  insertText,
  lineDetailsOf,
  openWorkspaceFile,
  type LineDetail,
} from "./helpers/workspace";

// Line 8 of sample.ts is "  return balance === 0;". The condition is at the columns 10 to 22.
const conditionLine = 7;
const condition = {
  metric: "condition",
  line: 8,
  col: 10,
  end_line: 8,
  end_col: 23,
  count: 1,
  score: 1,
};
const isPaidUnit = fakeUnit("isPaid", 7, {
  kind: "function",
  total: 1,
  metrics: [{ metric: "condition", count: 1, score: 1 }],
  occurrences: [condition],
});

const conditionDetails: LineDetail[] = [{ line: conditionLine, label: "+1 ICP · 1 condition" }];

async function openSample(): Promise<vscode.TextEditor> {
  const editor = await openWorkspaceFile("with-config", "sample.ts");
  await waitForRuns(1);
  await waitForShownScores(editor.document, [{ line: 6, title: "ICP: 1 / 10" }]);
  return editor;
}

async function waitForLineDetails(document: vscode.TextDocument, expected: LineDetail[]) {
  const expectedText = JSON.stringify(expected);
  await waitFor(`line details ${expectedText} of ${document.fileName}`, async () =>
    JSON.stringify(await lineDetailsOf(document)) === expectedText ? true : undefined,
  );
}

// Other extensions, for example the TypeScript extension, give hovers for the same position.
// The escape characters that MarkdownString.appendText adds are removed.
async function icpHoverLinesAt(document: vscode.TextDocument, character: number) {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    new vscode.Position(conditionLine, character),
  );
  return hovers
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .filter((text) => text.includes("ICP"))
    .flatMap((text) => text.replaceAll("&nbsp;", " ").replaceAll("\\", "").split("\n"))
    .map((line) => line.trimEnd());
}

suite("ICP details", () => {
  suiteSetup(async () => {
    await activateExtension();
    await closeAllEditors();
    await installFakeCdd();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
    await uninstallFakeCdd();
  });

  setup(async () => {
    await closeAllEditors();
    setFakeResponse({ stdout: reportOf("sample.ts", [isPaidUnit]) });
    resetCallLog();
  });

  teardown(closeAllEditors);

  test("the details are off until the toggle command runs, and off after a second run", async () => {
    const editor = await openSample();
    assert.deepEqual(await lineDetailsOf(editor.document), []);

    await vscode.commands.executeCommand(toggleCommand);
    await waitForLineDetails(editor.document, conditionDetails);

    await vscode.commands.executeCommand(toggleCommand);
    await waitForLineDetails(editor.document, []);
  });

  test("the toggle lens shows the details, and its title changes to Hide ICP Details", async () => {
    const editor = await openSample();
    const showLens = (await toggleLensesOf(editor.document))[0];
    assert.equal(showLens?.command?.title, "Show ICP Details");

    const lensArguments = (showLens.command.arguments ?? []) as unknown[];
    await vscode.commands.executeCommand(toggleCommand, ...lensArguments);
    try {
      await waitForLineDetails(editor.document, conditionDetails);
      const hideLens = (await toggleLensesOf(editor.document))[0];
      assert.equal(hideLens?.command?.title, "Hide ICP Details");
    } finally {
      await vscode.commands.executeCommand(toggleCommand, editor.document.uri.toString());
    }
  });

  test("the details hide while the document has unsaved changes", async () => {
    const editor = await openSample();
    await vscode.commands.executeCommand(toggleCommand);
    try {
      await waitForLineDetails(editor.document, conditionDetails);

      await insertText(editor, 0, "// added above\n");

      await waitForLineDetails(editor.document, []);
    } finally {
      await vscode.commands.executeCommand(toggleCommand, editor.document.uri.toString());
    }
  });

  test("a hover on a counted construct names its metric, its points and its unit", async () => {
    const editor = await openSample();

    assert.deepEqual(await icpHoverLinesAt(editor.document, 12), [
      "condition: +1 ICP",
      "function isPaid: ICP 1 of limit 10",
    ]);
  });

  test("a hover outside each counted construct has no ICP text", async () => {
    const editor = await openSample();

    assert.deepEqual(await icpHoverLinesAt(editor.document, 4), []);
  });
});
