import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { extensionId } from "./helpers/workspace";

suite("activation", () => {
  test("the extension activates", async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `${extensionId} is not installed`);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  test("cdd.showOutput is registered", async () => {
    await vscode.extensions.getExtension(extensionId)?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("cdd.showOutput"));
  });

  test("cdd.selectBinary is registered", async () => {
    await vscode.extensions.getExtension(extensionId)?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("cdd.selectBinary"));
  });

  test("cdd.installBinary is registered", async () => {
    await vscode.extensions.getExtension(extensionId)?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("cdd.installBinary"));
  });

  test("cdd.createConfiguration is registered", async () => {
    await vscode.extensions.getExtension(extensionId)?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("cdd.createConfiguration"));
  });
});
