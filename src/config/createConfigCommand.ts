import { existsSync } from "node:fs";
import * as vscode from "vscode";
import type { BinaryResolver } from "../binary/BinaryResolver";
import { planConfigCreation, rootConfigPath, type ConfigCreationPlan } from "./planConfigCreation";

type InitRun = Extract<ConfigCreationPlan, { kind: "run-init" }>;

export function registerCreateConfigCommand(binaryResolver: BinaryResolver): vscode.Disposable {
  return vscode.commands.registerCommand("cdd.createConfiguration", () =>
    createConfiguration(binaryResolver),
  );
}

async function createConfiguration(binaryResolver: BinaryResolver): Promise<void> {
  const workspaceFolderPath = targetWorkspaceFolder()?.uri.fsPath;
  const plan = planConfigCreation({
    workspaceFolderPath,
    hasConfig: workspaceFolderPath !== undefined && existsSync(rootConfigPath(workspaceFolderPath)),
    binary: await binaryResolver.resolve(),
  });
  if (plan.kind === "run-init") {
    openInitTerminal(plan);
  } else {
    void vscode.window.showInformationMessage(plan.message);
  }
}

function targetWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeUri && vscode.workspace.getWorkspaceFolder(activeUri);
  return activeFolder ?? onlyWorkspaceFolder();
}

function onlyWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.length === 1 ? folders[0] : undefined;
}

// The binary is the terminal process, so no shell parses the path, and the user answers the questions of cdd init.
function openInitTerminal(run: InitRun): void {
  const terminal = vscode.window.createTerminal({
    name: "cdd init",
    cwd: run.workingDirectory,
    shellPath: run.binaryPath,
    shellArgs: run.arguments,
  });
  terminal.show();
}
