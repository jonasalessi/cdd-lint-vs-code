import { managedBinaryPath } from "../binary/managedBinaryPath";
import { pinnedVersion } from "../binary/pinnedRelease";
import { validateBinary } from "../binary/validateBinary";
import type { DownloadProgress } from "./downloadAsset";
import {
  installManagedBinary,
  type InstallDependencies,
  type InstallOutcome,
} from "./installManagedBinary";
import { noAssetMessage, selectAsset, type AssetTable, type InstallAsset } from "./selectAsset";

export type InstallProgress = {
  signal: AbortSignal;
  report: (progress: DownloadProgress) => void;
};

export type InstallTask = (progress: InstallProgress) => Promise<InstallOutcome>;

export type InstallUi = {
  showWarning: (message: string) => void;
  showInformation: (message: string) => void;
  askInModalDialog: (message: string, action: string) => PromiseLike<string | undefined>;
  askAfterFailure: (message: string, actions: string[]) => PromiseLike<string | undefined>;
  runWithProgress: (title: string, task: InstallTask) => PromiseLike<InstallOutcome>;
  selectBinary: () => void;
};

export type InstallFlow = InstallDependencies & {
  arch: string;
  ui: InstallUi;
  onInstalled: () => void;
  assets?: AssetTable;
};

export const installAction = "Install";
export const retryAction = "Retry";
export const selectBinaryAction = "Select Binary";

export const approvalQuestion = `Download and install CDD ${pinnedVersion} from github.com?`;
export const alreadyInstalledMessage = `CDD ${pinnedVersion} is already installed.`;
export const installedMessage = `CDD ${pinnedVersion} is installed.`;
export const progressTitle = `Installing CDD ${pinnedVersion}`;

// The command cdd.installBinary: it asks for approval in a modal dialog.
export async function runInstallCommand(flow: InstallFlow): Promise<void> {
  if (selectAsset(flow, flow.assets) === undefined) {
    flow.ui.showWarning(noAssetMessage(flow));
  } else if (await hasValidManagedBinary(flow)) {
    flow.ui.showInformation(alreadyInstalledMessage);
  } else {
    await installAfterApproval(flow);
  }
}

// Starts the steps with no dialog. Call it only after the user approved the installation.
export async function startInstallation(flow: InstallFlow): Promise<void> {
  const asset = selectAsset(flow, flow.assets);
  if (asset === undefined) {
    flow.ui.showWarning(noAssetMessage(flow));
  } else {
    await reportOutcome(await runSteps(asset, flow), flow);
  }
}

export function failureMessage(reason: string): string {
  return `CDD ${pinnedVersion} was not installed. ${reason}`;
}

async function hasValidManagedBinary(flow: InstallFlow): Promise<boolean> {
  const validation = await validateBinary(managedBinaryPath(flow), flow.execFile);
  return validation.isValid;
}

async function installAfterApproval(flow: InstallFlow): Promise<void> {
  const answer = await flow.ui.askInModalDialog(approvalQuestion, installAction);
  if (answer === installAction) {
    await startInstallation(flow);
  }
}

function runSteps(asset: InstallAsset, flow: InstallFlow): PromiseLike<InstallOutcome> {
  return flow.ui.runWithProgress(progressTitle, ({ signal, report }) =>
    installManagedBinary({ asset, signal, onProgress: report }, flow),
  );
}

async function reportOutcome(outcome: InstallOutcome, flow: InstallFlow): Promise<void> {
  if (outcome.kind === "installed") {
    flow.onInstalled();
    flow.ui.showInformation(installedMessage);
  } else if (outcome.kind === "failed") {
    await offerRecovery(outcome.reason, flow);
  }
}

async function offerRecovery(reason: string, flow: InstallFlow): Promise<void> {
  const actions = [retryAction, selectBinaryAction];
  const answer = await flow.ui.askAfterFailure(failureMessage(reason), actions);
  if (answer === retryAction) {
    await startInstallation(flow);
  } else if (answer === selectBinaryAction) {
    flow.ui.selectBinary();
  }
}
