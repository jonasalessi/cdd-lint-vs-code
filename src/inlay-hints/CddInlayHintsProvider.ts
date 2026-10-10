import * as vscode from "vscode";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { supportedDocumentSelectors } from "../analysis/isSupportedDocument";
import { buildHints, type Hint } from "./buildHints";

const showInlayHintsSetting = "cdd.showInlayHints";

export class CddInlayHintsProvider implements vscode.InlayHintsProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.changeEmitter.event;
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly store: AnalysisStore) {
    this.subscriptions = vscode.Disposable.from(
      this.changeEmitter,
      vscode.languages.registerInlayHintsProvider(supportedDocumentSelectors, this),
      store.onDidChange(() => this.changeEmitter.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => this.handleConfigurationChange(event)),
    );
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  provideInlayHints(document: vscode.TextDocument): vscode.InlayHint[] {
    const hints = buildHints({
      record: this.store.get(document.uri.toString()),
      lineCount: document.lineCount,
      showInlayHints: readShowInlayHintsSetting(),
    });
    return hints.map((hint) => toInlayHint(hint, document));
  }

  private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(showInlayHintsSetting)) {
      this.changeEmitter.fire();
    }
  }
}

function readShowInlayHintsSetting(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(showInlayHintsSetting, true);
}

function toInlayHint(hint: Hint, document: vscode.TextDocument): vscode.InlayHint {
  const inlayHint = new vscode.InlayHint(document.lineAt(hint.line).range.end, hint.label);
  inlayHint.paddingLeft = true;
  inlayHint.tooltip = toTooltip(hint.tooltipLines);
  return inlayHint;
}

// appendText escapes the Markdown syntax of a unit name. Two spaces before a line break keep
// each item on its own line.
function toTooltip(tooltipLines: string[]): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltipLines.forEach((line, index) => {
    tooltip.appendMarkdown(index === 0 ? "" : "  \n");
    tooltip.appendText(line);
  });
  return tooltip;
}
