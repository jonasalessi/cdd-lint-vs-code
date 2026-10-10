import { join } from "node:path";
import type { BinaryResolution } from "../binary/BinaryResolver";
import { configFileName } from "./findConfig";

export type ConfigCreationFacts = {
  workspaceFolderPath: string | undefined;
  hasConfig: boolean;
  binary: BinaryResolution;
};

export type ConfigCreationPlan =
  | { kind: "run-init"; binaryPath: string; workingDirectory: string; arguments: string[] }
  | { kind: "message"; message: string };

export const noFolderMessage =
  "Open a file of a workspace folder, then create the CDD configuration.";
export const configExistsMessage = `This workspace folder already has a ${configFileName}.`;
export const noBinaryMessage =
  'CDD needs the cdd binary to create the configuration. Run "CDD: Install Managed Binary" or "CDD: Select Binary".';

export function rootConfigPath(workspaceFolderPath: string): string {
  return join(workspaceFolderPath, configFileName);
}

export function planConfigCreation(facts: ConfigCreationFacts): ConfigCreationPlan {
  if (facts.workspaceFolderPath === undefined) {
    return message(noFolderMessage);
  }
  if (facts.hasConfig) {
    return message(configExistsMessage);
  }
  return facts.binary.kind === "resolved"
    ? runInit(facts.binary.binaryPath, facts.workspaceFolderPath)
    : message(noBinaryMessage);
}

function runInit(binaryPath: string, workingDirectory: string): ConfigCreationPlan {
  return { kind: "run-init", binaryPath, workingDirectory, arguments: ["init"] };
}

function message(text: string): ConfigCreationPlan {
  return { kind: "message", message: text };
}
