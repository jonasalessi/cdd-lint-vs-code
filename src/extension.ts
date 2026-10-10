import { execFile } from "node:child_process";
// No "node:" prefix: VS Code applies its proxy settings to the module that this name loads.
import { get as httpsGet } from "https";
import * as vscode from "vscode";
import {
  AnalysisScheduler,
  documentLocationOf,
  documentStateOf,
} from "./analysis/AnalysisScheduler";
import { AnalysisStore } from "./analysis/AnalysisStore";
import { registerAnalyzeCurrentFileCommand } from "./analysis/analyzeCurrentFileCommand";
import {
  analyzeDocument,
  type AnalysisDependencies,
  type AnalysisNotifications,
} from "./analysis/analyzeDocument";
import type { DocumentRecord } from "./analysis/documentRecord";
import { RequestQueue, type PipelineFunction } from "./analysis/requestQueue";
import { runCddCheck } from "./analysis/runCddCheck";
import { BinaryResolver } from "./binary/BinaryResolver";
import { registerSelectBinaryCommand } from "./binary/selectBinaryCommand";
import { CddCodeLensProvider } from "./code-lens/CddCodeLensProvider";
import { registerCreateConfigCommand } from "./config/createConfigCommand";
import { ConfigResolver } from "./config/ConfigResolver";
import { CddDiagnostics } from "./diagnostics/CddDiagnostics";
import type { LineDetail } from "./icp-details/buildLineDetails";
import { DetailsVisibility } from "./icp-details/DetailsVisibility";
import { IcpDetailsDecorations } from "./icp-details/IcpDetailsDecorations";
import { IcpHoverProvider } from "./icp-details/IcpHoverProvider";
import { registerToggleDetailsCommand } from "./icp-details/toggleDetailsCommand";
import { installUi, registerInstallBinaryCommand } from "./install/installBinaryCommand";
import { startInstallation, type InstallFlow } from "./install/installFlow";
import { createLogger } from "./logging/logger";
import {
  createAnalysisNotifications,
  resetConfigNotifications,
  type NotificationUi,
} from "./status/analysisNotifications";
import { CddStatusItem } from "./status/CddStatusItem";
import { notifyNoBinary, type InstallPrompt } from "./status/installPrompt";
import { NotifyOnce } from "./status/notifyOnce";

export type ExtensionApi = {
  getRecord: (uri: string) => DocumentRecord | undefined;
  getLineDetails: (document: vscode.TextDocument) => LineDetail[];
};

type PipelineModules = {
  configResolver: ConfigResolver;
  binaryResolver: BinaryResolver;
  notify: AnalysisNotifications;
  logger: vscode.LogOutputChannel;
};

type NotificationModules = {
  context: vscode.ExtensionContext;
  installFlow: InstallFlow;
  once: NotifyOnce;
};

const binaryPathSetting = "cdd.binaryPath";

// The message functions are read at each call, so that an extension-host test can replace them.
const notificationUi: NotificationUi = {
  showWarning: (message, ...actions) => vscode.window.showWarningMessage(message, ...actions),
  showError: (message, ...actions) => vscode.window.showErrorMessage(message, ...actions),
  runCommand: (commandId, ...commandArguments) =>
    void vscode.commands.executeCommand(commandId, ...commandArguments),
};

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const logger = createLogger();
  const binaryResolver = createBinaryResolver(context, logger);
  const configResolver = new ConfigResolver({ log: logger });
  const store = new AnalysisStore();
  const once = new NotifyOnce();
  const detailsVisibility = new DetailsVisibility();
  const detailsDecorations = new IcpDetailsDecorations({ store, visibility: detailsVisibility });
  const installFlow = createInstallFlow(context, binaryResolver);
  const notify = createNotifications({ context, installFlow, once });
  const queue = createRequestQueue(
    store,
    createPipeline({ configResolver, binaryResolver, notify, logger }),
  );
  const onDidChangeConfigFile = (configPath: string) => resetConfigNotifications(once, configPath);
  context.subscriptions.push(
    logger,
    vscode.commands.registerCommand("cdd.showOutput", () => logger.show()),
    registerSelectBinaryCommand(execFile),
    registerInstallBinaryCommand(installFlow),
    registerCreateConfigCommand(binaryResolver),
    clearCacheOnBinaryPathChange(binaryResolver),
    queue,
    new AnalysisScheduler({ store, queue, configResolver, binaryResolver, onDidChangeConfigFile }),
    registerAnalyzeCurrentFileCommand(queue),
    new CddCodeLensProvider({ store, visibility: detailsVisibility }),
    new CddDiagnostics(store),
    detailsDecorations,
    new IcpHoverProvider(store),
    registerToggleDetailsCommand(detailsVisibility),
    new CddStatusItem({ store, queue }),
  );
  return {
    getRecord: (uri) => store.get(uri),
    getLineDetails: (document) => detailsDecorations.lineDetailsOf(document),
  };
}

export function deactivate(): void {}

function createBinaryResolver(
  context: vscode.ExtensionContext,
  logger: vscode.LogOutputChannel,
): BinaryResolver {
  return new BinaryResolver({
    execFile,
    getBinaryPathSetting: readBinaryPathSetting,
    getPathValue: () => process.env.PATH ?? "",
    platform: process.platform,
    storageDir: context.globalStorageUri.fsPath,
    log: logger,
  });
}

function createInstallFlow(
  context: vscode.ExtensionContext,
  binaryResolver: BinaryResolver,
): InstallFlow {
  return {
    storageDir: context.globalStorageUri.fsPath,
    platform: process.platform,
    arch: process.arch,
    httpsGet,
    execFile,
    ui: installUi,
    onInstalled: () => binaryResolver.clearCache("installation-completed"),
  };
}

function createNotifications(modules: NotificationModules): AnalysisNotifications {
  return createAnalysisNotifications({
    ui: notificationUi,
    once: modules.once,
    getBinaryPathSetting: readBinaryPathSetting,
    notifyNoBinary: () => notifyNoBinary(installPromptOf(modules)),
  });
}

function installPromptOf(modules: NotificationModules): InstallPrompt {
  const { context, installFlow, once } = modules;
  return {
    host: { platform: installFlow.platform, arch: installFlow.arch },
    showWarning: notificationUi.showWarning,
    globalState: context.globalState,
    startInstallation: () => void startInstallation(installFlow),
    selectBinary: installFlow.ui.selectBinary,
    once,
  };
}

function readBinaryPathSetting(): string {
  return vscode.workspace.getConfiguration().get<string>(binaryPathSetting, "");
}

function clearCacheOnBinaryPathChange(binaryResolver: BinaryResolver): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(binaryPathSetting)) {
      binaryResolver.clearCache("setting-changed");
    }
  });
}

function createPipeline(modules: PipelineModules): PipelineFunction {
  const dependencies = analysisDependenciesOf(modules);
  return (uri, signal) => {
    const location = documentLocationOf(uri);
    return location === undefined
      ? Promise.resolve({ kind: "aborted" })
      : analyzeDocument({ ...location, signal }, dependencies);
  };
}

function analysisDependenciesOf(modules: PipelineModules): AnalysisDependencies {
  return {
    configResolver: modules.configResolver,
    binaryResolver: modules.binaryResolver,
    runCheck: (request) => runCddCheck(request, execFile),
    notify: modules.notify,
    log: modules.logger,
  };
}

function createRequestQueue(store: AnalysisStore, runPipeline: PipelineFunction): RequestQueue {
  return new RequestQueue({
    setTimer: setTimeout,
    clearTimer: clearTimeout,
    runPipeline,
    getDocumentState: documentStateOf,
    applyRecord: (uri, record) => store.set(uri, record),
  });
}
