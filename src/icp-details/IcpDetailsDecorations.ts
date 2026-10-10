import * as vscode from "vscode";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { buildLineDetails, type LineDetail } from "./buildLineDetails";
import type { DetailsVisibility } from "./DetailsVisibility";

export type DetailsSources = {
  store: AnalysisStore;
  visibility: DetailsVisibility;
};

export class IcpDetailsDecorations implements vscode.Disposable {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor("editorCodeLens.foreground"), margin: "0 0 0 2em" },
  });
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly sources: DetailsSources) {
    this.subscriptions = vscode.Disposable.from(
      this.decorationType,
      sources.store.onDidChange((uri) => this.renderDocument(uri)),
      sources.visibility.onDidChange((uri) => this.renderDocument(uri)),
      vscode.window.onDidChangeVisibleTextEditors((editors) => this.renderEditors(editors)),
    );
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  lineDetailsOf(document: vscode.TextDocument): LineDetail[] {
    const uri = document.uri.toString();
    return buildLineDetails({
      record: this.sources.store.get(uri),
      lineCount: document.lineCount,
      showDetails: this.sources.visibility.isShown(uri),
    });
  }

  private renderDocument(uri: string): void {
    this.renderEditors(
      vscode.window.visibleTextEditors.filter((editor) => editor.document.uri.toString() === uri),
    );
  }

  private renderEditors(editors: readonly vscode.TextEditor[]): void {
    editors.forEach((editor) => {
      const { document } = editor;
      const decorations = this.lineDetailsOf(document).map((detail) =>
        toDecoration(detail, document),
      );
      editor.setDecorations(this.decorationType, decorations);
    });
  }
}

function toDecoration(detail: LineDetail, document: vscode.TextDocument): vscode.DecorationOptions {
  const lineEnd = document.lineAt(detail.line).range.end;
  return {
    range: new vscode.Range(lineEnd, lineEnd),
    renderOptions: { after: { contentText: detail.label } },
  };
}
