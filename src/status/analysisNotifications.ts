import { relative } from "node:path";
import type { AnalysisNotifications, ConfigNotice } from "../analysis/analyzeDocument";
import type { BinaryFailureClass } from "../binary/validateBinary";
import { selectBinaryAction } from "../install/installFlow";
import type { MessageFunction } from "./installPrompt";
import type { NotifyOnce } from "./notifyOnce";

export type NotificationUi = {
  showWarning: MessageFunction;
  showError: MessageFunction;
  runCommand: (commandId: string, ...commandArguments: string[]) => void;
};

export type NotificationDependencies = {
  ui: NotificationUi;
  once: NotifyOnce;
  getBinaryPathSetting: () => string;
  notifyNoBinary: () => void;
};

type CommandCall = { commandId: string; commandArguments: string[] };

type Notice = {
  key: string;
  level: "warning" | "error";
  message: string;
  commandOfAction: Record<string, CommandCall>;
};

export const openSettingsAction = "Open Settings";
export const showOutputAction = "Show Output";

const selectBinaryCall: CommandCall = { commandId: "cdd.selectBinary", commandArguments: [] };
const showOutputCall: CommandCall = { commandId: "cdd.showOutput", commandArguments: [] };
const openSettingsCall: CommandCall = {
  commandId: "workbench.action.openSettings",
  commandArguments: ["cdd.binaryPath"],
};

// The notification table of plan section 3.11. No function waits for the answer of the user.
export function createAnalysisNotifications(
  dependencies: NotificationDependencies,
): AnalysisNotifications {
  return {
    noBinary: dependencies.notifyNoBinary,
    invalidBinary: (failureClass) =>
      showOnce(
        invalidBinaryNotice(failureClass, dependencies.getBinaryPathSetting()),
        dependencies,
      ),
    configNotValid: (notice) => showOnce(configNotValidNotice(notice), dependencies),
    outputFileConfigured: (notice) => showOnce(outputFileNotice(notice), dependencies),
  };
}

// Trigger 5 for one configuration file.
export function resetConfigNotifications(once: NotifyOnce, configPath: string): void {
  once.reset(configNotValidKey(configPath));
  once.reset(outputFileKey(configPath));
}

function invalidBinaryNotice(failureClass: BinaryFailureClass, settingValue: string): Notice {
  return {
    key: `invalid-binary:${settingValue}`,
    level: "error",
    message: `The configured CDD binary is not valid: ${failureClass}.`,
    commandOfAction: {
      [selectBinaryAction]: selectBinaryCall,
      [openSettingsAction]: openSettingsCall,
    },
  };
}

function configNotValidNotice(notice: ConfigNotice): Notice {
  return {
    key: configNotValidKey(notice.configPath),
    level: "error",
    message: `The CDD configuration ${relativeConfigPath(notice)} is not valid.`,
    commandOfAction: { [showOutputAction]: showOutputCall },
  };
}

function outputFileNotice(notice: ConfigNotice): Notice {
  return {
    key: outputFileKey(notice.configPath),
    level: "warning",
    message: `CDD cannot analyze files in the editor while reporter.outputFile is set in ${relativeConfigPath(notice)}.`,
    commandOfAction: {},
  };
}

function configNotValidKey(configPath: string): string {
  return `config-not-valid:${configPath}`;
}

function outputFileKey(configPath: string): string {
  return `output-file-configured:${configPath}`;
}

function relativeConfigPath(notice: ConfigNotice): string {
  return relative(notice.workspaceFolderPath, notice.configPath);
}

function showOnce(notice: Notice, dependencies: NotificationDependencies): void {
  dependencies.once.show(notice.key, () => void showAndRunAction(notice, dependencies.ui));
}

async function showAndRunAction(notice: Notice, ui: NotificationUi): Promise<void> {
  const show = notice.level === "error" ? ui.showError : ui.showWarning;
  const answer = await show(notice.message, ...Object.keys(notice.commandOfAction));
  const call = answer === undefined ? undefined : notice.commandOfAction[answer];
  if (call !== undefined) {
    ui.runCommand(call.commandId, ...call.commandArguments);
  }
}
