import * as vscode from "vscode";
import { documentStateOf } from "../analysis/AnalysisScheduler";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { supportedDocumentSelectors } from "../analysis/isSupportedDocument";
import type { RequestQueue } from "../analysis/requestQueue";
import {
  statusCommandTitles,
  statusText,
  type StatusCommandId,
  type StatusSeverity,
  type StatusText,
} from "./statusText";

export type StatusSources = {
  store: AnalysisStore;
  queue: RequestQueue;
};

const severities: Record<StatusSeverity, vscode.LanguageStatusSeverity> = {
  information: vscode.LanguageStatusSeverity.Information,
  warning: vscode.LanguageStatusSeverity.Warning,
  error: vscode.LanguageStatusSeverity.Error,
};

export class CddStatusItem implements vscode.Disposable {
  private readonly item = vscode.languages.createLanguageStatusItem(
    "cdd.status",
    supportedDocumentSelectors,
  );
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly sources: StatusSources) {
    this.item.name = "CDD";
    this.subscriptions = vscode.Disposable.from(
      this.item,
      sources.store.onDidChange(() => this.update()),
      sources.queue.onDidChangeActivity(() => this.update()),
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      // This event also fires when the dirty state of a document changes.
      vscode.workspace.onDidChangeTextDocument(() => this.update()),
    );
    this.update();
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined) {
      this.show(this.statusOf(editor.document.uri.toString()));
    }
  }

  private statusOf(uri: string): StatusText {
    const documentState = documentStateOf(uri);
    return statusText({
      isSupported: documentState.isSupported,
      isPipelineActive: this.sources.queue.isActive(uri),
      isDirty: !documentState.isClean,
      record: this.sources.store.get(uri),
    });
  }

  private show(status: StatusText): void {
    this.item.text = status.text;
    this.item.severity = severities[status.severity];
    this.item.busy = status.busy;
    this.item.command = status.commandId && toCommand(status.commandId);
  }
}

function toCommand(commandId: StatusCommandId): vscode.Command {
  return { command: commandId, title: statusCommandTitles[commandId] };
}
