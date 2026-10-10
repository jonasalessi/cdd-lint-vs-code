import * as vscode from "vscode";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { supportedDocumentSelectors } from "../analysis/isSupportedDocument";
import type { DetailsVisibility } from "../icp-details/DetailsVisibility";
import { toggleDetailsCommandId } from "../icp-details/toggleDetailsCommand";
import { buildLenses, type UnitLens } from "./buildLenses";

export type LensSources = {
  store: AnalysisStore;
  visibility: DetailsVisibility;
};

const showCodeLensSetting = "cdd.showCodeLens";

export class CddCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly sources: LensSources) {
    this.subscriptions = vscode.Disposable.from(
      this.changeEmitter,
      vscode.languages.registerCodeLensProvider(supportedDocumentSelectors, this),
      sources.store.onDidChange(() => this.changeEmitter.fire()),
      sources.visibility.onDidChange(() => this.changeEmitter.fire()),
      vscode.workspace.onDidChangeConfiguration((event) => this.handleConfigurationChange(event)),
    );
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const uri = document.uri.toString();
    const lenses = buildLenses({
      record: this.sources.store.get(uri),
      lineCount: document.lineCount,
      showCodeLens: readShowCodeLensSetting(),
      areDetailsShown: this.sources.visibility.isShown(uri),
    });
    return lenses.flatMap((lens) => [toScoreLens(lens), toToggleLens(lens, uri)]);
  }

  private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(showCodeLensSetting)) {
      this.changeEmitter.fire();
    }
  }
}

function readShowCodeLensSetting(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(showCodeLensSetting, true);
}

function rangeOf(lens: UnitLens): vscode.Range {
  return new vscode.Range(lens.line, 0, lens.line, 0);
}

// VS Code shows a lens that has an empty command ID as text that the user cannot click.
function toScoreLens(lens: UnitLens): vscode.CodeLens {
  return new vscode.CodeLens(rangeOf(lens), {
    title: lens.scoreTitle,
    command: "",
    tooltip: lens.tooltipLines.join("\n"),
  });
}

function toToggleLens(lens: UnitLens, uri: string): vscode.CodeLens {
  return new vscode.CodeLens(rangeOf(lens), {
    title: lens.toggleTitle,
    command: toggleDetailsCommandId,
    arguments: [uri],
  });
}
