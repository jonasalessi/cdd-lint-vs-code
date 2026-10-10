import * as vscode from "vscode";
import type { DetailsVisibility } from "./DetailsVisibility";

export const toggleDetailsCommandId = "cdd.toggleIcpDetails";

// A CodeLens passes the URI of its document. The command palette passes no argument.
export function registerToggleDetailsCommand(visibility: DetailsVisibility): vscode.Disposable {
  return vscode.commands.registerCommand(toggleDetailsCommandId, (lensUri?: string) => {
    const uri = lensUri ?? vscode.window.activeTextEditor?.document.uri.toString();
    if (uri !== undefined) {
      visibility.toggle(uri);
    }
  });
}
