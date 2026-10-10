import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { settle } from "./waitFor";

export const extensionId = "jonasalessi.cdd-lint-vscode";

type AnalysisRecord = {
  state: string;
  detail?: string;
  units: { name: string; line: number }[];
  blocked: boolean;
  isStale: boolean;
};

export type LineDetail = {
  // 0-based line of the document.
  line: number;
  label: string;
};

type ExtensionApi = {
  getRecord: (uri: string) => AnalysisRecord | undefined;
  getLineDetails: (document: vscode.TextDocument) => LineDetail[];
};

export async function activateExtension(): Promise<ExtensionApi> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(extensionId);
  if (extension === undefined) {
    throw new Error(`${extensionId} is not installed`);
  }
  return extension.activate();
}

// The record of the analysis store for the document, or undefined.
export async function recordOf(document: vscode.TextDocument): Promise<AnalysisRecord | undefined> {
  const api = await activateExtension();
  return api.getRecord(document.uri.toString());
}

// The line labels of the ICP details. VS Code gives a test no access to the decorations of an editor.
export async function lineDetailsOf(document: vscode.TextDocument): Promise<LineDetail[]> {
  const api = await activateExtension();
  return api.getLineDetails(document);
}

export function workspacePath(...segments: string[]): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    throw new Error("The test workspace is not open");
  }
  return join(folder.uri.fsPath, ...segments);
}

// The command vscode.open is used and not workspace.openTextDocument, because VS Code keeps a
// document that an extension opened for some minutes after its editor is closed.
export async function openWorkspaceFile(...segments: string[]): Promise<vscode.TextEditor> {
  const uri = vscode.Uri.file(workspacePath(...segments));
  await vscode.commands.executeCommand("vscode.open", uri);
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.toString() !== uri.toString()) {
    throw new Error(`${uri.fsPath} is not the active document`);
  }
  return editor;
}

export async function insertText(editor: vscode.TextEditor, line: number, text: string) {
  const isApplied = await editor.edit((edit) => edit.insert(new vscode.Position(line, 0), text));
  if (!isApplied) {
    throw new Error("The edit was not applied");
  }
}

// Reverts a dirty document first, because VS Code asks before it closes a dirty editor.
export async function closeActiveEditor(): Promise<void> {
  if (vscode.window.activeTextEditor?.document.isDirty === true) {
    await vscode.commands.executeCommand("workbench.action.files.revert");
  }
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
}

// Call it in setup and in teardown. After it, no pipeline of an earlier test can start a run.
export async function closeAllEditors(): Promise<void> {
  while (vscode.window.tabGroups.all.some((group) => group.tabs.length > 0)) {
    await closeActiveEditor();
  }
  await settle();
}

// Gives a function that writes the present content of the file back.
export function rememberFile(filePath: string): () => void {
  const content = readFileSync(filePath);
  return () => writeFileSync(filePath, content);
}
