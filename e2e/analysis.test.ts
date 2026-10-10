import * as assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import * as vscode from "vscode";
import {
  copyFakeCdd,
  fakeCddPath,
  fakeUnit,
  installFakeCdd,
  readRuns,
  reportOf,
  resetCallLog,
  runOf,
  setBinaryPath,
  setFakeResponse,
  uninstallFakeCdd,
  waitForRuns,
} from "./helpers/fakeCdd";
import { settle, waitFor } from "./helpers/waitFor";
import {
  activateExtension,
  closeActiveEditor,
  closeAllEditors,
  insertText,
  openWorkspaceFile,
  recordOf,
  rememberFile,
  workspacePath,
} from "./helpers/workspace";

const sampleRun = runOf("sample.ts");

function sampleReport(unitName: string): string {
  return reportOf("sample.ts", [fakeUnit(unitName, 1)]);
}

async function unitNamesOf(document: vscode.TextDocument): Promise<string[] | undefined> {
  const record = await recordOf(document);
  return record?.units.map((unit) => unit.name);
}

async function waitForState(document: vscode.TextDocument, state: string): Promise<void> {
  const api = await activateExtension();
  await waitFor(`record state ${state} of ${document.fileName}`, () =>
    api.getRecord(document.uri.toString())?.state === state ? true : undefined,
  );
}

async function waitForUnitNames(document: vscode.TextDocument, names: string[]): Promise<void> {
  const api = await activateExtension();
  const expected = JSON.stringify(names);
  await waitFor(`units ${expected} of ${document.fileName}`, () => {
    const units = api.getRecord(document.uri.toString())?.units ?? [];
    return JSON.stringify(units.map((unit) => unit.name)) === expected ? true : undefined;
  });
}

// Opens with-config/sample.ts and waits for the run that the opening starts.
async function openAnalyzedSample(): Promise<vscode.TextEditor> {
  const editor = await openWorkspaceFile("with-config", "sample.ts");
  await waitForRuns(1);
  await waitForState(editor.document, "measured");
  return editor;
}

suite("analysis triggers", () => {
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
    setFakeResponse({ stdout: sampleReport("Order") });
    resetCallLog();
  });

  teardown(closeAllEditors);

  test("cdd.analyzeCurrentFile is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("cdd.analyzeCurrentFile"));
  });

  test("opening a clean supported document starts one run", async () => {
    const editor = await openWorkspaceFile("with-config", "sample.ts");

    await waitForState(editor.document, "measured");
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
    assert.deepEqual(await unitNamesOf(editor.document), ["Order"]);
  });

  test("typing starts no run", async () => {
    const editor = await openAnalyzedSample();

    await insertText(editor, 0, "// typed\n");
    await settle();

    assert.equal(editor.document.isDirty, true);
    assert.deepEqual(readRuns(), [sampleRun]);
    assert.equal((await recordOf(editor.document))?.isStale, true);
  });

  test("saving starts one run", async () => {
    const restoreSample = rememberFile(workspacePath("with-config", "sample.ts"));
    try {
      const editor = await openAnalyzedSample();
      await insertText(editor, 0, "// saved\n");

      await editor.document.save();

      await waitForRuns(2);
      await settle();
      assert.deepEqual(readRuns(), [sampleRun, sampleRun]);
      assert.equal((await recordOf(editor.document))?.isStale, false);
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("undo to the saved state starts one run", async () => {
    const editor = await openAnalyzedSample();
    await insertText(editor, 0, "// undone\n");

    await vscode.commands.executeCommand("undo");

    await waitForRuns(2);
    await settle();
    assert.equal(editor.document.isDirty, false);
    assert.deepEqual(readRuns(), [sampleRun, sampleRun]);
  });

  test("a document in no-config starts no run", async () => {
    const editor = await openWorkspaceFile("no-config", "sample.ts");

    await waitForState(editor.document, "no-config");
    await settle();
    assert.deepEqual(readRuns(), []);
  });

  test("an unsupported document starts no run", async () => {
    const editor = await openWorkspaceFile("with-config", "notes.md");

    await settle();
    assert.deepEqual(readRuns(), []);
    assert.equal(await recordOf(editor.document), undefined);
  });

  test("two saves with a response delay of 500 ms apply the result of the second run", async () => {
    const restoreSample = rememberFile(workspacePath("with-config", "sample.ts"));
    try {
      const editor = await openAnalyzedSample();
      resetCallLog();

      setFakeResponse({ stdout: sampleReport("FirstSave"), delayMs: 500 });
      await insertText(editor, 0, "// first save\n");
      await editor.document.save();
      await waitForRuns(1);
      setFakeResponse({ stdout: sampleReport("SecondSave"), delayMs: 500 });
      await insertText(editor, 0, "// second save\n");
      await editor.document.save();
      await waitForRuns(2);

      await waitForUnitNames(editor.document, ["SecondSave"]);
      await settle();
      assert.deepEqual(await unitNamesOf(editor.document), ["SecondSave"]);
      assert.deepEqual(readRuns(), [sampleRun, sampleRun]);
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("a change of with-config/cdd.config.yaml starts a new run for the visible document", async () => {
    const configPath = workspacePath("with-config", "cdd.config.yaml");
    const restoreConfig = rememberFile(configPath);
    const editor = await openAnalyzedSample();
    try {
      appendFileSync(configPath, "# changed by a test\n");

      const runs = await waitForRuns(2);
      assert.ok(runs.every((run) => run === sampleRun));
      await waitForState(editor.document, "measured");
      await settle();
    } finally {
      // The restore is a configuration change too. Its run must start before the next test.
      const runsBeforeRestore = readRuns().length;
      restoreConfig();
      await waitForRuns(runsBeforeRestore + 1);
    }
  });

  test("a change of cdd.binaryPath starts one run for the visible document", async () => {
    const editor = await openAnalyzedSample();
    try {
      await setBinaryPath(copyFakeCdd());

      await waitForRuns(2);
      await waitForState(editor.document, "measured");
      await settle();
      assert.deepEqual(readRuns(), [sampleRun, sampleRun]);
    } finally {
      await setBinaryPath(fakeCddPath);
    }
    await waitForRuns(3);
  });

  test("cdd.analyzeCurrentFile starts one run for the active document", async () => {
    await openAnalyzedSample();

    await vscode.commands.executeCommand("cdd.analyzeCurrentFile");

    await waitForRuns(2);
    await settle();
    assert.deepEqual(readRuns(), [sampleRun, sampleRun]);
  });
});
