import * as vscode from "vscode";
import {
  runInstallCommand,
  type InstallFlow,
  type InstallTask,
  type InstallUi,
} from "./installFlow";
import type { InstallOutcome } from "./installManagedBinary";

export const installUi: InstallUi = {
  showWarning: (message) => void vscode.window.showWarningMessage(message),
  showInformation: (message) => void vscode.window.showInformationMessage(message),
  askInModalDialog: (message, action) =>
    vscode.window.showInformationMessage(message, { modal: true }, action),
  askAfterFailure: (message, actions) => vscode.window.showErrorMessage(message, ...actions),
  runWithProgress,
  selectBinary: () => void vscode.commands.executeCommand("cdd.selectBinary"),
};

export function registerInstallBinaryCommand(flow: InstallFlow): vscode.Disposable {
  return vscode.commands.registerCommand("cdd.installBinary", () => runInstallCommand(flow));
}

function runWithProgress(title: string, task: InstallTask): Thenable<InstallOutcome> {
  const options = { location: vscode.ProgressLocation.Notification, title, cancellable: true };
  return vscode.window.withProgress(options, (progress, token) => {
    const cancellation = new AbortController();
    token.onCancellationRequested(() => cancellation.abort());
    return task({
      signal: cancellation.signal,
      report: ({ incrementPercent }) => progress.report({ increment: incrementPercent }),
    });
  });
}
