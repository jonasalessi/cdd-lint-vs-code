import * as vscode from "vscode";
import { validateBinary, type BinaryFailureClass, type ExecFileFunction } from "./validateBinary";

export function registerSelectBinaryCommand(execFile: ExecFileFunction): vscode.Disposable {
  return vscode.commands.registerCommand("cdd.selectBinary", () => selectBinary(execFile));
}

async function selectBinary(execFile: ExecFileFunction): Promise<void> {
  const selectedPath = await askForBinaryPath();
  if (selectedPath === undefined) {
    return;
  }
  const validation = await validateBinary(selectedPath, execFile);
  await (validation.isValid
    ? saveBinaryPath(selectedPath)
    : showInvalidSelection(validation.failureClass));
}

async function askForBinaryPath(): Promise<string | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: "Select the CDD binary",
    openLabel: "Select",
  });
  return selection?.[0]?.fsPath;
}

function saveBinaryPath(binaryPath: string): Thenable<void> {
  const configuration = vscode.workspace.getConfiguration("cdd");
  return configuration.update("binaryPath", binaryPath, vscode.ConfigurationTarget.Global);
}

function showInvalidSelection(failureClass: BinaryFailureClass): Thenable<unknown> {
  return vscode.window.showErrorMessage(
    `The selected file is not a valid CDD binary: ${failureClass}.`,
  );
}
