import * as vscode from "vscode";
import type { AnalysisStore } from "../analysis/AnalysisStore";
import { buildDiagnostics, type IcpDiagnostic, type IcpSeverity } from "./buildDiagnostics";

const showDiagnosticsSetting = "cdd.showDiagnostics";

const severities: Record<IcpSeverity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
};

export class CddDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("cdd");
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly store: AnalysisStore) {
    this.subscriptions = vscode.Disposable.from(
      this.collection,
      store.onDidChange((uri) => this.publish(uri)),
      vscode.workspace.onDidChangeConfiguration((event) => this.handleConfigurationChange(event)),
    );
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  // A record exists only for an open document. With no document, the record was deleted and
  // buildDiagnostics gives an empty list.
  private publish(uri: string): void {
    const document = openDocumentOf(uri);
    const diagnostics = buildDiagnostics({
      record: this.store.get(uri),
      lineCount: document?.lineCount ?? 0,
      lineTextAt: (line) => document?.lineAt(line).text ?? "",
      showDiagnostics: readShowDiagnosticsSetting(),
    });
    this.collection.set(
      document?.uri ?? vscode.Uri.parse(uri, true),
      diagnostics.map(toDiagnostic),
    );
  }

  private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(showDiagnosticsSetting)) {
      vscode.workspace.textDocuments.forEach((document) => this.publish(document.uri.toString()));
    }
  }
}

function openDocumentOf(uri: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri);
}

function readShowDiagnosticsSetting(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(showDiagnosticsSetting, true);
}

function toDiagnostic(diagnostic: IcpDiagnostic): vscode.Diagnostic {
  const { line, startCharacter, endCharacter } = diagnostic;
  const range = new vscode.Range(line, startCharacter, line, endCharacter);
  const result = new vscode.Diagnostic(range, diagnostic.message, severities[diagnostic.severity]);
  result.source = diagnostic.source;
  result.code = diagnostic.code;
  return result;
}
