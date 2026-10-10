import * as vscode from "vscode";
import type { RequestQueue, RequestResult } from "./requestQueue";

const messageOfIgnoredRequest: Record<Exclude<RequestResult, "scheduled">, string> = {
  dirty: "Save the file to update its ICP scores.",
  unsupported: "CDD cannot analyze this file.",
};

export function registerAnalyzeCurrentFileCommand(queue: RequestQueue): vscode.Disposable {
  return vscode.commands.registerCommand("cdd.analyzeCurrentFile", () => analyzeCurrentFile(queue));
}

function analyzeCurrentFile(queue: RequestQueue): void {
  const editor = vscode.window.activeTextEditor;
  const result = editor ? queue.request(editor.document.uri.toString()) : "unsupported";
  if (result !== "scheduled") {
    void vscode.window.showInformationMessage(messageOfIgnoredRequest[result]);
  }
}
