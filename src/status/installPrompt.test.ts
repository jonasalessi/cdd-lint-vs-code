import { beforeEach, describe, expect, it } from "vitest";
import type { InstallHost } from "../install/selectAsset";
import { notifyNoBinary, type InstallPrompt } from "./installPrompt";
import { NotifyOnce } from "./notifyOnce";

type ShownMessage = { message: string; actions: string[] };

const hostWithAsset: InstallHost = { platform: "linux", arch: "x64" };
const hostWithNoAsset: InstallHost = { platform: "win32", arch: "arm64" };
const promptActions = ["Install", "Select Binary", "Not Now", "Don't Ask Again"];
const promptMessage = "CDD binary not found. Install CDD v0.1.0 from github.com?";

function answersAreHandled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("notifyNoBinary", () => {
  let shownMessages: ShownMessage[];
  let storedValues: Map<string, unknown>;
  let startedActions: string[];
  let answer: string | undefined;

  function promptOfNewSession(host: InstallHost = hostWithAsset): InstallPrompt {
    return {
      host,
      showWarning: (message, ...actions) => {
        shownMessages.push({ message, actions });
        return Promise.resolve(answer);
      },
      globalState: {
        get: (key) => storedValues.get(key),
        update: (key, value) => Promise.resolve(void storedValues.set(key, value)),
      },
      startInstallation: () => void startedActions.push("install"),
      selectBinary: () => void startedActions.push("select"),
      once: new NotifyOnce(),
    };
  }

  async function answerPromptWith(selectedAction: string | undefined): Promise<void> {
    answer = selectedAction;
    notifyNoBinary(promptOfNewSession());
    await answersAreHandled();
  }

  beforeEach(() => {
    shownMessages = [];
    storedValues = new Map();
    startedActions = [];
    answer = undefined;
  });

  it("shows the prompt with the four actions", () => {
    notifyNoBinary(promptOfNewSession());

    expect(shownMessages).toEqual([{ message: promptMessage, actions: promptActions }]);
  });

  it("shows one prompt for two no-binary results", () => {
    const prompt = promptOfNewSession();

    notifyNoBinary(prompt);
    notifyNoBinary(prompt);

    expect(shownMessages).toHaveLength(1);
  });

  it("starts the installation when the user selects Install", async () => {
    await answerPromptWith("Install");

    expect(startedActions).toEqual(["install"]);
    expect(storedValues.size).toBe(0);
  });

  it("starts the select function when the user selects Select Binary", async () => {
    await answerPromptWith("Select Binary");

    expect(startedActions).toEqual(["select"]);
  });

  it.each(["Select Binary", "Not Now", "Don't Ask Again", undefined])(
    "does not start the installation for the answer %s",
    async (selectedAction) => {
      await answerPromptWith(selectedAction);

      expect(startedActions).not.toContain("install");
    },
  );

  it.each(["Not Now", undefined])("does nothing for the answer %s", async (selectedAction) => {
    await answerPromptWith(selectedAction);

    expect(startedActions).toEqual([]);
    expect(storedValues.size).toBe(0);
  });

  it("writes cdd.suppressInstallPrompt when the user selects Don't Ask Again", async () => {
    await answerPromptWith("Don't Ask Again");

    expect([...storedValues]).toEqual([["cdd.suppressInstallPrompt", true]]);
    expect(startedActions).toEqual([]);
  });

  it("shows no prompt in a new session after Don't Ask Again", async () => {
    await answerPromptWith("Don't Ask Again");
    shownMessages = [];

    notifyNoBinary(promptOfNewSession());

    expect(shownMessages).toEqual([]);
  });

  it("shows the prompt again in a new session after Not Now", async () => {
    await answerPromptWith("Not Now");

    notifyNoBinary(promptOfNewSession());

    expect(shownMessages).toHaveLength(2);
  });

  it("returns before the user answers", () => {
    const prompt = promptOfNewSession();
    prompt.showWarning = () => new Promise(() => {});

    expect(notifyNoBinary(prompt)).toBeUndefined();
  });

  describe("a platform with no asset", () => {
    it("shows the message of plan section 3.8 with no Install action", () => {
      notifyNoBinary(promptOfNewSession(hostWithNoAsset));

      expect(shownMessages).toEqual([
        {
          message:
            'No prebuilt CDD binary exists for win32-arm64. Install it with "go install github.com/jonasalessi/cdd-lint@latest", then run "CDD: Select Binary".',
          actions: [],
        },
      ]);
    });

    it("shows the message one time for each session", () => {
      const prompt = promptOfNewSession(hostWithNoAsset);

      notifyNoBinary(prompt);
      notifyNoBinary(prompt);

      expect(shownMessages).toHaveLength(1);
    });

    it("shows the message also when cdd.suppressInstallPrompt is true", () => {
      storedValues.set("cdd.suppressInstallPrompt", true);

      notifyNoBinary(promptOfNewSession(hostWithNoAsset));

      expect(shownMessages).toHaveLength(1);
    });
  });
});
