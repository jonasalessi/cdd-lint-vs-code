import * as vscode from "vscode";

export function createLogger(): vscode.LogOutputChannel {
  return vscode.window.createOutputChannel("CDD", { log: true });
}
