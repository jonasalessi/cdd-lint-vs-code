import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AnalysisNotifications } from "../analysis/analyzeDocument";
import { createAnalysisNotifications, resetConfigNotifications } from "./analysisNotifications";
import { NotifyOnce } from "./notifyOnce";

type ShownMessage = { level: "warning" | "error"; message: string; actions: string[] };

const workspaceFolderPath = join("/", "workspace");
const configPath = join(workspaceFolderPath, "app", "cdd.config.yaml");
const otherConfigPath = join(workspaceFolderPath, "lib", "cdd.config.yaml");
const relativeConfigPath = join("app", "cdd.config.yaml");
const configNotice = { configPath, workspaceFolderPath };
const otherConfigNotice = { configPath: otherConfigPath, workspaceFolderPath };

function answersAreHandled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("the analysis notifications", () => {
  let shownMessages: ShownMessage[];
  let commandCalls: string[][];
  let noBinaryCalls: number;
  let binaryPathSetting: string;
  let answer: string | undefined;
  let once: NotifyOnce;
  let notify: AnalysisNotifications;

  function showAs(level: ShownMessage["level"]) {
    return (message: string, ...actions: string[]) => {
      shownMessages.push({ level, message, actions });
      return Promise.resolve(answer);
    };
  }

  beforeEach(() => {
    shownMessages = [];
    commandCalls = [];
    noBinaryCalls = 0;
    binaryPathSetting = "/opt/not-cdd";
    answer = undefined;
    once = new NotifyOnce();
    notify = createAnalysisNotifications({
      ui: {
        showWarning: showAs("warning"),
        showError: showAs("error"),
        runCommand: (...call) => void commandCalls.push(call),
      },
      once,
      getBinaryPathSetting: () => binaryPathSetting,
      notifyNoBinary: () => (noBinaryCalls += 1),
    });
  });

  it("passes no-binary to the install prompt", () => {
    notify.noBinary();

    expect(noBinaryCalls).toBe(1);
    expect(shownMessages).toEqual([]);
  });

  describe("invalid-binary", () => {
    it("shows an error with the failure class and two actions", () => {
      notify.invalidBinary("not-cdd");

      expect(shownMessages).toEqual([
        {
          level: "error",
          message: "The configured CDD binary is not valid: not-cdd.",
          actions: ["Select Binary", "Open Settings"],
        },
      ]);
    });

    it("shows one error for each value of the setting", () => {
      notify.invalidBinary("not-cdd");
      notify.invalidBinary("not-cdd");
      binaryPathSetting = "/opt/missing";
      notify.invalidBinary("not-found");
      notify.invalidBinary("not-found");

      expect(shownMessages.map((shown) => shown.message)).toEqual([
        "The configured CDD binary is not valid: not-cdd.",
        "The configured CDD binary is not valid: not-found.",
      ]);
    });

    it("runs cdd.selectBinary for Select Binary", async () => {
      answer = "Select Binary";

      notify.invalidBinary("not-cdd");
      await answersAreHandled();

      expect(commandCalls).toEqual([["cdd.selectBinary"]]);
    });

    it("opens the settings at cdd.binaryPath for Open Settings", async () => {
      answer = "Open Settings";

      notify.invalidBinary("not-cdd");
      await answersAreHandled();

      expect(commandCalls).toEqual([["workbench.action.openSettings", "cdd.binaryPath"]]);
    });

    it("runs no command when the user closes the notification", async () => {
      notify.invalidBinary("not-cdd");
      await answersAreHandled();

      expect(commandCalls).toEqual([]);
    });
  });

  describe("a configuration that is not valid", () => {
    const message = `The CDD configuration ${relativeConfigPath} is not valid.`;

    it("shows an error with the path relative to the workspace folder", () => {
      notify.configNotValid(configNotice);

      expect(shownMessages).toEqual([{ level: "error", message, actions: ["Show Output"] }]);
    });

    it("shows one error for each configuration file", () => {
      notify.configNotValid(configNotice);
      notify.configNotValid(configNotice);
      notify.configNotValid(otherConfigNotice);

      expect(shownMessages).toHaveLength(2);
    });

    it("shows the error again after trigger 5 for that file", () => {
      notify.configNotValid(configNotice);
      resetConfigNotifications(once, configPath);
      notify.configNotValid(configNotice);

      expect(shownMessages).toHaveLength(2);
    });

    it("stays silent after trigger 5 for another file", () => {
      notify.configNotValid(configNotice);
      resetConfigNotifications(once, otherConfigPath);
      notify.configNotValid(configNotice);

      expect(shownMessages).toHaveLength(1);
    });

    it("runs cdd.showOutput for Show Output", async () => {
      answer = "Show Output";

      notify.configNotValid(configNotice);
      await answersAreHandled();

      expect(commandCalls).toEqual([["cdd.showOutput"]]);
    });
  });

  describe("reporter.outputFile is set", () => {
    const message = `CDD cannot analyze files in the editor while reporter.outputFile is set in ${relativeConfigPath}.`;

    it("shows a warning with no action", () => {
      notify.outputFileConfigured(configNotice);

      expect(shownMessages).toEqual([{ level: "warning", message, actions: [] }]);
    });

    it("shows one warning for each configuration file", () => {
      notify.outputFileConfigured(configNotice);
      notify.outputFileConfigured(configNotice);
      notify.outputFileConfigured(otherConfigNotice);

      expect(shownMessages).toHaveLength(2);
    });

    it("shows the warning again after trigger 5 for that file", () => {
      notify.outputFileConfigured(configNotice);
      resetConfigNotifications(once, configPath);
      notify.outputFileConfigured(configNotice);

      expect(shownMessages).toHaveLength(2);
    });

    it("is independent of the error of the same configuration file", () => {
      notify.configNotValid(configNotice);
      notify.outputFileConfigured(configNotice);

      expect(shownMessages.map((shown) => shown.level)).toEqual(["error", "warning"]);
    });
  });
});
