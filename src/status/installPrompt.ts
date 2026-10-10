import { pinnedVersion } from "../binary/pinnedRelease";
import { installAction, selectBinaryAction } from "../install/installFlow";
import { noAssetMessage, selectAsset, type InstallHost } from "../install/selectAsset";
import type { NotifyOnce } from "./notifyOnce";

export type MessageFunction = (
  message: string,
  ...actions: string[]
) => PromiseLike<string | undefined>;

export type PromptStorage = {
  get: (key: string) => unknown;
  update: (key: string, value: boolean) => PromiseLike<void>;
};

export type InstallPrompt = {
  host: InstallHost;
  showWarning: MessageFunction;
  globalState: PromptStorage;
  startInstallation: () => void;
  selectBinary: () => void;
  once: NotifyOnce;
};

export const suppressInstallPromptKey = "cdd.suppressInstallPrompt";
export const notNowAction = "Not Now";
export const dontAskAgainAction = "Don't Ask Again";
export const installPromptMessage = `CDD binary not found. Install CDD ${pinnedVersion} from github.com?`;

const installPromptActions = [installAction, selectBinaryAction, notNowAction, dontAskAgainAction];
const noBinaryKey = "no-binary";

const runAction: Record<string, (prompt: InstallPrompt) => void> = {
  [installAction]: (prompt) => prompt.startInstallation(),
  [selectBinaryAction]: (prompt) => prompt.selectBinary(),
  [dontAskAgainAction]: (prompt) => void prompt.globalState.update(suppressInstallPromptKey, true),
};

// The two no-binary rows of the notification table of plan section 3.11.
export function notifyNoBinary(prompt: InstallPrompt): void {
  if (selectAsset(prompt.host) === undefined) {
    prompt.once.show(noBinaryKey, () => void prompt.showWarning(noAssetMessage(prompt.host)));
  } else if (isPromptAllowed(prompt)) {
    prompt.once.show(noBinaryKey, () => void askToInstall(prompt));
  }
}

function isPromptAllowed(prompt: InstallPrompt): boolean {
  return prompt.globalState.get(suppressInstallPromptKey) !== true;
}

// The answer undefined means that the user closed the notification.
async function askToInstall(prompt: InstallPrompt): Promise<void> {
  const answer = await prompt.showWarning(installPromptMessage, ...installPromptActions);
  if (answer !== undefined) {
    runAction[answer]?.(prompt);
  }
}
