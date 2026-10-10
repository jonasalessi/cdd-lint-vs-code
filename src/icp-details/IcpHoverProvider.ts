import * as vscode from "vscode";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { supportedDocumentSelectors } from "../analysis/isSupportedDocument";
import { markdownOfLines } from "../markdown/markdownOfLines";
import { buildHoverLines } from "./buildHoverLines";

export class IcpHoverProvider implements vscode.HoverProvider, vscode.Disposable {
  private readonly registration: vscode.Disposable;

  constructor(private readonly store: AnalysisStore) {
    this.registration = vscode.languages.registerHoverProvider(supportedDocumentSelectors, this);
  }

  dispose(): void {
    this.registration.dispose();
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const hoverLines = buildHoverLines(this.store.get(document.uri.toString()), {
      line: position.line,
      character: position.character,
      lineText: document.lineAt(position.line).text,
    });
    return hoverLines.length > 0 ? new vscode.Hover(markdownOfLines(hoverLines)) : undefined;
  }
}
