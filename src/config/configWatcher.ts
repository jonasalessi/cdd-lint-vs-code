import * as vscode from "vscode";
import { configFileName } from "./findConfig";

export type ConfigChangeListener = (configPath: string) => void;

// Trigger 5 of plan section 3.4.
export function watchConfigFiles(onDidChange: ConfigChangeListener): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${configFileName}`);
  const notify = (uri: vscode.Uri) => onDidChange(uri.fsPath);
  return vscode.Disposable.from(
    watcher,
    watcher.onDidCreate(notify),
    watcher.onDidChange(notify),
    watcher.onDidDelete(notify),
  );
}
