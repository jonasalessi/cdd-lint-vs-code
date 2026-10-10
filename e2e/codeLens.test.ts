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
  scoreLensesOf,
  setShowCodeLens,
  shownScoresOf,
  toggleLensesOf,
  waitForShownScores,
  type ShownScore,
} from "./helpers/codeLens";
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

const sampleScores: ShownScore[] = [
  { line: 0, title: "ICP: 4 / 10" },
  { line: 6, title: "ICP: 16.5 / 10" },
];

// Opens with-config/sample.ts and waits for the scores of the response that `setup` sets.
async function openSampleWithScores(): Promise<vscode.TextEditor> {
  const editor = await openWorkspaceFile("with-config", "sample.ts");
  await waitForRuns(1);
  await waitForShownScores(editor.document, sampleScores);
  return editor;
}

suite("CodeLens", () => {
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

  test("the titles and lines are equal to the response of the fake binary", async () => {
    const editor = await openSampleWithScores();

    assert.deepEqual(await shownScoresOf(editor.document), sampleScores);
  });

  // vscode.executeCodeLensProvider does not return the tooltip of a lens that has no command ID.
  // The unit tests of buildLenses cover the tooltip lines.
  test("a score lens is text that the user cannot click", async () => {
    const editor = await openSampleWithScores();

    const isPaidScore = (await scoreLensesOf(editor.document))[1];

    assert.equal(isPaidScore?.command?.command, "");
  });

  test("each score has a toggle lens on its line, with the URI of the document", async () => {
    const editor = await openSampleWithScores();

    const toggles = await toggleLensesOf(editor.document);

    assert.deepEqual(
      toggles.map((lens) => [lens.range.start.line, lens.command?.title]),
      [
        [0, "Show ICP Details"],
        [6, "Show ICP Details"],
      ],
    );
    assert.deepEqual(toggles[0]?.command?.arguments, [editor.document.uri.toString()]);
  });

  test("after a line is added above a unit, the score is one line lower", async () => {
    const editor = await openSampleWithScores();

    await insertText(editor, 0, "// added above\n");

    await waitForShownScores(editor.document, [
      { line: 1, title: "ICP: 4 / 10" },
      { line: 7, title: "ICP: 16.5 / 10" },
    ]);
  });

  test("after a save with a new response, the titles change", async () => {
    const restoreSample = rememberFile(workspacePath("with-config", "sample.ts"));
    try {
      const editor = await openSampleWithScores();
      const savedUnit = fakeUnit("Order", 2, { total: 12.25, exceeds: true });
      setFakeResponse({ stdout: reportOf("sample.ts", [savedUnit]) });
      await insertText(editor, 0, "// saved\n");

      await editor.document.save();

      await waitForRuns(2);
      await waitForShownScores(editor.document, [{ line: 1, title: "ICP: 12.25 / 10" }]);
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("with cdd.showCodeLens false, the provider returns no lenses", async () => {
    const editor = await openSampleWithScores();
    try {
      await setShowCodeLens(false);

      await waitForShownScores(editor.document, []);
      assert.deepEqual(await toggleLensesOf(editor.document), []);
    } finally {
      await setShowCodeLens(undefined);
    }
    await waitForShownScores(editor.document, sampleScores);
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
  });

  test("the call log shows no new run after a lens request", async () => {
    const editor = await openSampleWithScores();
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);

    await shownScoresOf(editor.document);
    await shownScoresOf(editor.document);

    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
  });
});
