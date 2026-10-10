import * as assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  fakeCddPath,
  fakeUnit,
  installFakeCdd,
  readRuns,
  reportOf,
  resetCallLog,
  setBinaryPath,
  setFakeResponse,
  uninstallFakeCdd,
  waitForRuns,
} from "./helpers/fakeCdd";
import { replaceMessageFunctions, type ReplacedMessages } from "./helpers/messages";
import { settle, waitFor } from "./helpers/waitFor";
import {
  closeActiveEditor,
  closeAllEditors,
  activateExtension,
  insertText,
  openWorkspaceFile,
  recordOf,
  rememberFile,
  workspacePath,
} from "./helpers/workspace";

const configNotValidCall = {
  level: "error",
  message: `The CDD configuration ${join("with-config", "cdd.config.yaml")} is not valid.`,
  actions: ["Show Output"],
};

async function waitForRecord(
  document: vscode.TextDocument,
  expected: { state: string; isStale: boolean },
): Promise<void> {
  await waitFor(`record ${JSON.stringify(expected)} of ${document.fileName}`, async () => {
    const record = await recordOf(document);
    const isExpected = record?.state === expected.state && record.isStale === expected.isStale;
    return isExpected ? true : undefined;
  });
}

suite("notifications", () => {
  let messages: ReplacedMessages;

  function waitForMessageCalls(count: number): Promise<true> {
    return waitFor(`${count} message calls, found ${messages.calls.length}`, () =>
      messages.calls.length >= count ? true : undefined,
    );
  }

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
    setFakeResponse({ stdout: reportOf("sample.ts", [fakeUnit("Order", 1)]) });
    resetCallLog();
    messages = replaceMessageFunctions();
  });

  teardown(async () => {
    await closeAllEditors();
    messages.restore();
  });

  test("opening and saving a document in no-config calls no message function", async () => {
    const restoreSample = rememberFile(workspacePath("no-config", "sample.ts"));
    try {
      const editor = await openWorkspaceFile("no-config", "sample.ts");
      await waitForRecord(editor.document, { state: "no-config", isStale: false });
      await insertText(editor, 0, "// saved\n");
      await waitForRecord(editor.document, { state: "no-config", isStale: true });

      await editor.document.save();

      await waitForRecord(editor.document, { state: "no-config", isStale: false });
      await settle();
      assert.deepEqual(messages.calls, []);
      assert.deepEqual(readRuns(), []);
      await closeActiveEditor();
    } finally {
      restoreSample();
    }
  });

  test("a binary path that is not valid shows one error for that value of the setting", async () => {
    try {
      await setBinaryPath(workspacePath("no-config", "missing-cdd"));
      const editor = await openWorkspaceFile("with-config", "sample.ts");
      await waitForRecord(editor.document, { state: "invalid-binary", isStale: false });
      await waitForMessageCalls(1);

      await vscode.commands.executeCommand("cdd.analyzeCurrentFile");

      await settle();
      assert.deepEqual(messages.calls, [
        {
          level: "error",
          message: "The configured CDD binary is not valid: not-found.",
          actions: ["Select Binary", "Open Settings"],
        },
      ]);
    } finally {
      // With no visible document, the change of the setting starts no run.
      await closeAllEditors();
      await setBinaryPath(fakeCddPath);
    }
  });

  test("a configuration error shows one error, and a change of that file shows it again", async () => {
    const configPath = workspacePath("with-config", "cdd.config.yaml");
    const restoreConfig = rememberFile(configPath);
    setFakeResponse({ stderr: "cdd: config: cdd.config.yaml: yaml: line 1\n", exitCode: 1 });
    const editor = await openWorkspaceFile("with-config", "sample.ts");
    try {
      await waitForRecord(editor.document, { state: "error", isStale: false });
      await vscode.commands.executeCommand("cdd.analyzeCurrentFile");
      await waitForRuns(2);
      await settle();
      assert.deepEqual(messages.calls, [configNotValidCall]);

      appendFileSync(configPath, "# changed by a test\n");

      await waitForMessageCalls(2);
      assert.deepEqual(messages.calls[1], configNotValidCall);
      await settle();
    } finally {
      // The restore is a configuration change too. Its run must start before the test ends.
      const runsBeforeRestore = readRuns().length;
      restoreConfig();
      await waitForRuns(runsBeforeRestore + 1);
      await settle();
    }
  });
});
