import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { fakeCddPath, installFakeCdd, uninstallFakeCdd } from "./helpers/fakeCdd";
import { waitFor } from "./helpers/waitFor";
import { activateExtension, closeAllEditors, workspacePath } from "./helpers/workspace";

const initTerminalName = "cdd init";

function initTerminal(): vscode.Terminal | undefined {
  return vscode.window.terminals.find((terminal) => terminal.name === initTerminalName);
}

function disposeInitTerminals(): void {
  vscode.window.terminals
    .filter((terminal) => terminal.name === initTerminalName)
    .forEach((terminal) => terminal.dispose());
}

suite("create configuration", () => {
  suiteSetup(async () => {
    await activateExtension();
    await installFakeCdd();
  });

  suiteTeardown(async () => {
    disposeInitTerminals();
    await closeAllEditors();
    await uninstallFakeCdd();
  });

  test("cdd.createConfiguration runs cdd init in a terminal, in the workspace folder", async () => {
    await vscode.commands.executeCommand("cdd.createConfiguration");

    const terminal = await waitFor("the cdd init terminal", initTerminal);
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.equal(options.shellPath, fakeCddPath);
    assert.deepEqual(options.shellArgs, ["init"]);
    assert.equal(options.cwd, workspacePath());
  });
});
