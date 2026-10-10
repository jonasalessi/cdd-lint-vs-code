import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  cddDiagnosticsOf,
  setShowDiagnostics,
  waitForShownDiagnostics,
  type ShownDiagnostic,
} from "./helpers/diagnostics";
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
import { shownScoresOf, waitForShownScores } from "./helpers/codeLens";
import { settle } from "./helpers/waitFor";
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

const orderUnit = fakeUnit("Order", 1);
// Line 2 of sample.ts is "  total(prices: number[]): number {".
const totalUnit = fakeUnit("total", 2, { kind: "method", total: 16.5, exceeds: true });
const totalLine = 1;
const totalLabel = "ICP: 16.5 / 10";

const sampleDiagnostics: ShownDiagnostic[] = [
  { line: totalLine, message: "method total has ICP 16.5, limit 10 (over by 6.5)." },
];

// Opens with-config/sample.ts and waits for the diagnostic of the response that `setup` sets.
async function openSampleWithDiagnostic(): Promise<vscode.TextEditor> {
  const editor = await openWorkspaceFile("with-config", "sample.ts");
  await waitForRuns(1);
  await waitForShownDiagnostics(editor.document.uri, sampleDiagnostics);
  return editor;
}

function onlyCddDiagnosticOf(uri: vscode.Uri): vscode.Diagnostic {
  const diagnostics = cddDiagnosticsOf(uri);
  assert.equal(diagnostics.length, 1);
  return diagnostics[0] as vscode.Diagnostic;
}

suite("diagnostics", () => {
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
    setFakeResponse({ stdout: reportOf("sample.ts", [orderUnit, totalUnit]) });
    resetCallLog();
  });

  teardown(closeAllEditors);

  test("a violating unit gives one diagnostic with source CDD, on the line of its score", async () => {
    const editor = await openSampleWithDiagnostic();

    const diagnostic = onlyCddDiagnosticOf(editor.document.uri);

    await waitForShownScores(editor.document, [
      { line: 0, title: "ICP: 4 / 10" },
      { line: totalLine, title: totalLabel },
    ]);
    const totalScore = (await shownScoresOf(editor.document)).find(
      (score) => score.title === totalLabel,
    );
    assert.equal(diagnostic.source, "CDD");
    assert.equal(diagnostic.range.start.line, totalScore?.line);
    assert.equal(diagnostic.range.end.line, totalScore?.line);
  });

  test("the diagnostic has the range of the line text, a message, a code and a severity", async () => {
    const editor = await openSampleWithDiagnostic();

    const diagnostic = onlyCddDiagnosticOf(editor.document.uri);

    const lineEnd = editor.document.lineAt(totalLine).range.end;
    assert.deepEqual(
      diagnostic.range,
      new vscode.Range(totalLine, 2, totalLine, lineEnd.character),
    );
    assert.equal(diagnostic.message, "method total has ICP 16.5, limit 10 (over by 6.5).");
    assert.equal(diagnostic.code, "icp-limit");
    assert.equal(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
  });

  test("a blocked report gives a diagnostic with the severity Error", async () => {
    const stdout = reportOf("sample.ts", [orderUnit, totalUnit], { blocked: true });
    setFakeResponse({ stdout, exitCode: 1 });

    const editor = await openSampleWithDiagnostic();

    const diagnostic = onlyCddDiagnosticOf(editor.document.uri);
    assert.equal(diagnostic.severity, vscode.DiagnosticSeverity.Error);
  });

  test("a save with a passing response removes the diagnostic", async () => {
    const restoreSample = rememberFile(workspacePath("with-config", "sample.ts"));
    try {
      const editor = await openSampleWithDiagnostic();
      setFakeResponse({ stdout: reportOf("sample.ts", [fakeUnit("Order", 2)]) });
      await insertText(editor, 0, "// saved\n");

      await editor.document.save();

      await waitForRuns(2);
      await waitForShownDiagnostics(editor.document.uri, []);
      assert.equal((await recordOf(editor.document))?.state, "measured");
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("a not-applicable response removes the diagnostic", async () => {
    const editor = await openSampleWithDiagnostic();
    const stderr = "cdd: sample.ts is excluded by the configuration\n";
    setFakeResponse({ stderr, exitCode: 1 });

    await vscode.commands.executeCommand("cdd.analyzeCurrentFile");

    await waitForRuns(2);
    await waitForShownDiagnostics(editor.document.uri, []);
    assert.equal((await recordOf(editor.document))?.state, "not-applicable");
  });

  test("with cdd.showDiagnostics false, the document has no CDD diagnostics", async () => {
    const editor = await openSampleWithDiagnostic();
    try {
      await setShowDiagnostics(false);

      await waitForShownDiagnostics(editor.document.uri, []);
    } finally {
      await setShowDiagnostics(undefined);
    }
    await waitForShownDiagnostics(editor.document.uri, sampleDiagnostics);
    await settle();
    assert.deepEqual(readRuns(), [sampleRun]);
  });

  test("with cdd.showDiagnostics false, a new analysis publishes no CDD diagnostics", async () => {
    await setShowDiagnostics(false);
    try {
      const editor = await openWorkspaceFile("with-config", "sample.ts");
      await waitForRuns(1);
      await waitForShownScores(editor.document, [
        { line: 0, title: "ICP: 4 / 10" },
        { line: totalLine, title: totalLabel },
      ]);

      await settle();
      assert.deepEqual(cddDiagnosticsOf(editor.document.uri), []);
    } finally {
      await setShowDiagnostics(undefined);
    }
  });

  test("closing the document removes its diagnostics", async () => {
    const editor = await openSampleWithDiagnostic();
    const uri = editor.document.uri;

    await closeActiveEditor();

    await waitForShownDiagnostics(uri, []);
    await settle();
    assert.deepEqual(cddDiagnosticsOf(uri), []);
  });
});
