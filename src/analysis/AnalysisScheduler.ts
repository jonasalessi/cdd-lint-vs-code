import * as vscode from "vscode";
import type { BinaryResolver } from "../binary/BinaryResolver";
import type { ConfigResolver } from "../config/ConfigResolver";
import { watchConfigFiles } from "../config/configWatcher";
import type { AnalysisStore } from "./AnalysisStore";
import { isSupportedDocument } from "./isSupportedDocument";
import type { DocumentState, RequestQueue } from "./requestQueue";
import type { ContentChange } from "./shiftUnits";
import { documentsToAnalyzeOnVisibilityChange, isBinaryTrigger } from "./triggerRules";

export type SchedulerDependencies = {
  store: AnalysisStore;
  queue: RequestQueue;
  configResolver: ConfigResolver;
  binaryResolver: BinaryResolver;
  onDidChangeConfigFile: (configPath: string) => void;
};

export type DocumentLocation = {
  documentPath: string;
  workspaceFolderPath: string;
};

const closedDocument: DocumentState = {
  isOpen: false,
  isSupported: false,
  isClean: false,
  version: -1,
};

export class AnalysisScheduler implements vscode.Disposable {
  private visibleUris: ReadonlySet<string> = new Set();
  private readonly subscriptions: vscode.Disposable;

  constructor(private readonly dependencies: SchedulerDependencies) {
    this.subscriptions = vscode.Disposable.from(
      ...this.documentSubscriptions(),
      ...this.fileSubscriptions(),
      ...this.resolverSubscriptions(),
    );
    this.requestDocumentsThatEnteredView();
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  private documentSubscriptions(): vscode.Disposable[] {
    const { queue } = this.dependencies;
    return [
      vscode.workspace.onDidSaveTextDocument((document) => queue.request(uriOf(document))),
      vscode.window.onDidChangeVisibleTextEditors(() => this.requestDocumentsThatEnteredView()),
      vscode.workspace.onDidChangeTextDocument((event) => this.handleChange(event)),
      vscode.workspace.onDidCloseTextDocument((document) => this.forget(uriOf(document))),
    ];
  }

  private fileSubscriptions(): vscode.Disposable[] {
    const { store } = this.dependencies;
    return [
      vscode.workspace.onDidDeleteFiles((event) =>
        event.files.forEach((uri) => store.delete(uri.toString())),
      ),
      vscode.workspace.onDidRenameFiles((event) =>
        event.files.forEach((file) => store.delete(file.oldUri.toString())),
      ),
    ];
  }

  private resolverSubscriptions(): vscode.Disposable[] {
    const { binaryResolver } = this.dependencies;
    return [
      watchConfigFiles((configPath) => this.handleConfigChange(configPath)),
      binaryResolver.onDidClearCache((cause) => {
        if (isBinaryTrigger(cause)) {
          this.analyzeVisibleDocumentsAgain();
        }
      }),
    ];
  }

  private requestDocumentsThatEnteredView(): void {
    const visibleUris = visibleDocumentUris();
    const urisToAnalyze = documentsToAnalyzeOnVisibilityChange({
      previousUris: this.visibleUris,
      visibleUris,
      hasRecord: (uri) => this.dependencies.store.has(uri),
    });
    this.visibleUris = new Set(visibleUris);
    urisToAnalyze.forEach((uri) => this.dependencies.queue.request(uri));
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const uri = uriOf(event.document);
    this.dependencies.store.applyContentChanges(uri, event.contentChanges.map(toContentChange));
    this.dependencies.queue.request(uri);
  }

  private forget(uri: string): void {
    this.dependencies.queue.cancel(uri);
    this.dependencies.store.delete(uri);
  }

  private handleConfigChange(configPath: string): void {
    this.dependencies.onDidChangeConfigFile(configPath);
    this.dependencies.configResolver.clearCache();
    this.analyzeVisibleDocumentsAgain();
  }

  private analyzeVisibleDocumentsAgain(): void {
    const { store, queue } = this.dependencies;
    queue.cancelAll();
    store.clear();
    visibleDocumentUris().forEach((uri) => queue.request(uri));
  }
}

export function documentStateOf(uri: string): DocumentState {
  const document = findOpenDocument(uri);
  if (document === undefined) {
    return closedDocument;
  }
  return {
    isOpen: true,
    isSupported: isSupported(document.uri),
    isClean: !document.isDirty,
    version: document.version,
  };
}

export function documentLocationOf(uri: string): DocumentLocation | undefined {
  const documentUri = vscode.Uri.parse(uri);
  const workspaceFolderPath = workspaceFolderPathOf(documentUri);
  return workspaceFolderPath === undefined
    ? undefined
    : { documentPath: documentUri.fsPath, workspaceFolderPath };
}

function findOpenDocument(uri: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find(
    (document) => !document.isClosed && uriOf(document) === uri,
  );
}

function isSupported(uri: vscode.Uri): boolean {
  return isSupportedDocument({
    scheme: uri.scheme,
    filePath: uri.fsPath,
    workspaceFolderPath: workspaceFolderPathOf(uri),
  });
}

function workspaceFolderPathOf(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

function visibleDocumentUris(): string[] {
  return vscode.window.visibleTextEditors.map((editor) => uriOf(editor.document));
}

function uriOf(document: vscode.TextDocument): string {
  return document.uri.toString();
}

function toContentChange(change: vscode.TextDocumentContentChangeEvent): ContentChange {
  const { start, end } = change.range;
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
    text: change.text,
  };
}
