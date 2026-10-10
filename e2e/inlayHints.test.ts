import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  fakeUnit,
  installFakeCdd,
  readRuns,
  reportOf,
  resetCallLog,
  runOf,
  setFakeResponse,
  uninstallFakeCdd,
  waitForRuns,
} from "./helpers/fakeCdd";
import {
  inlayHintsOf,
  setShowInlayHints,
  shownHintsOf,
  waitForShownHints,
  type ShownHint,
} from "./helpers/inlayHints";
import { settle } from "./helpers/waitFor";
import {
  activateExtension,
  closeActiveEditor,
  closeAllEditors,
  insertText,
  openWorkspaceFile,
  rememberFile,
  workspacePath,
} from "./helpers/workspace";

const sampleRun = runOf("sample.ts");

const orderUnit = fakeUnit("Order", 1);
const isPaidUnit = fakeUnit("isPaid", 7, {
  kind: "func",
  total: 16.5,
  exceeds: true,
  metrics: [
    { metric: "code_branch", count: 3, score: 16.5 },
    { metric: "coupling", count: 0, score: 0 },
  ],
});

const sampleHints: ShownHint[] = [
  { line: 0, label: "ICP: 4 / 10" },
  { line: 6, label: "ICP: 16.5 / 10" },
];

// Opens with-config/sample.ts and waits for the hints of the response that `setup` sets.
async function openSampleWithHints(): Promise<vscode.TextEditor> {
  const editor = await openWorkspaceFile("with-config", "sample.ts");
  await waitForRuns(1);
  await waitForShownHints(editor.document, sampleHints);
  return editor;
}

// Removes the escape characters that MarkdownString.appendText adds.
function tooltipLinesOf(hint: vscode.InlayHint | undefined): string[] {
  assert.ok(hint?.tooltip instanceof vscode.MarkdownString);
  const text = hint.tooltip.value.replaceAll("&nbsp;", " ").replaceAll("\\", "");
  return text.split("\n").map((line) => line.trimEnd());
}

suite("inlay hints", () => {
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
    setFakeResponse({ stdout: reportOf("sample.ts", [orderUnit, isPaidUnit]) });
    resetCallLog();
  });

  teardown(closeAllEditors);

  test("the labels and lines are equal to the response of the fake binary", async () => {
    const editor = await openSampleWithHints();

    assert.deepEqual(await shownHintsOf(editor.document), sampleHints);
  });

  test("a hint is at the end of its line, with padding and a tooltip", async () => {
    const editor = await openSampleWithHints();

    const isPaidHint = (await inlayHintsOf(editor.document))[1];

    const lineEnd = editor.document.lineAt(6).range.end;
    assert.equal(isPaidHint?.position.character, lineEnd.character);
    assert.equal(isPaidHint?.paddingLeft, true);
    assert.deepEqual(tooltipLinesOf(isPaidHint), [
      "func isPaid",
      "ICP 16.5 of limit 10",
      "Over the limit by 6.5",
      "code_branch: 3 (16.5)",
    ]);
  });

  test("after a line is added above a unit, the hint is one line lower", async () => {
    const editor = await openSampleWithHints();

    await insertText(editor, 0, "// added above\n");

    await waitForShownHints(editor.document, [
      { line: 1, label: "ICP: 4 / 10" },
      { line: 7, label: "ICP: 16.5 / 10" },
    ]);
    const orderHint = (await inlayHintsOf(editor.document))[0];
    assert.equal(
      tooltipLinesOf(orderHint).at(-1),
      "Unsaved changes: the score is from the last saved version.",
    );
  });

  test("after a save with a new response, the labels change", async () => {
    const restoreSample = rememberFile(workspacePath("with-config", "sample.ts"));
    try {
      const editor = await openSampleWithHints();
      const savedUnit = fakeUnit("Order", 2, { total: 12.25, exceeds: true });
      setFakeResponse({ stdout: reportOf("sample.ts", [savedUnit]) });
      await insertText(editor, 0, "// saved\n");

      await editor.document.save();

      await waitForRuns(2);
      await waitForShownHints(editor.document, [{ line: 1, label: "ICP: 12.25 / 10" }]);
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("with cdd.showInlayHints false, the provider returns no hints", async () => {
    const editor = await openSampleWithHints();
    try {
      await setShowInlayHints(false);

      await waitForShownHints(editor.document, []);
    } finally {
      await setShowInlayHints(undefined);
    }
    await waitForShownHints(editor.document, sampleHints);
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
  });

  test("the call log shows no new run after a hint request", async () => {
    const editor = await openSampleWithHints();
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);

    await shownHintsOf(editor.document);
    await shownHintsOf(editor.document);

    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
  });
});
