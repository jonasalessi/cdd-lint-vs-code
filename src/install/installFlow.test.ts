import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExecFileFake, validResponse } from "../binary/execFileFake";
import type { ExecFileFunction } from "../binary/validateBinary";
import { createHttpsGetFake } from "./httpsGetFake";
import {
  runInstallCommand,
  startInstallation,
  type InstallFlow,
  type InstallUi,
} from "./installFlow";
import {
  binaryContent,
  goodTarEntries,
  onlyStagedBinaryIsValid,
  serveTarGz,
  storageContentOf,
  withWrongChecksum,
  writeStorageFile,
  type ServedArchive,
} from "./installTestSupport";

type UiCall = { function: keyof InstallUi; message?: string; actions?: string[] };

type UiScript = {
  modalAnswer?: string;
  failureAnswers?: (string | undefined)[];
  cancelsProgress?: boolean;
};

type FlowOptions = {
  script?: UiScript;
  execFile?: ExecFileFunction;
  host?: { platform: NodeJS.Platform; arch: string };
};

const checksumFailure =
  "CDD v0.1.0 was not installed. The SHA-256 of cdd_test.tar.gz is not equal to the expected value.";

function createUiFake(script: UiScript, calls: UiCall[]): InstallUi {
  const failureAnswers = [...(script.failureAnswers ?? [])];
  return {
    showWarning: (message) => void calls.push({ function: "showWarning", message }),
    showInformation: (message) => void calls.push({ function: "showInformation", message }),
    askInModalDialog: (message, action) => {
      calls.push({ function: "askInModalDialog", message, actions: [action] });
      return Promise.resolve(script.modalAnswer);
    },
    askAfterFailure: (message, actions) => {
      calls.push({ function: "askAfterFailure", message, actions });
      return Promise.resolve(failureAnswers.shift());
    },
    runWithProgress: (title, task) => {
      calls.push({ function: "runWithProgress", message: title });
      const cancellation = new AbortController();
      if (script.cancelsProgress) {
        cancellation.abort();
      }
      return task({ signal: cancellation.signal, report: () => {} });
    },
    selectBinary: () => void calls.push({ function: "selectBinary" }),
  };
}

describe("the installation flow", () => {
  let storageDir: string;
  let uiCalls: UiCall[];
  let requestedUrls: string[];
  let installedEvents: number;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "cdd-install-flow-"));
    uiCalls = [];
    installedEvents = 0;
  });

  afterEach(() => rm(storageDir, { recursive: true, force: true }));

  function flowFor(served: ServedArchive, options: FlowOptions = {}): InstallFlow {
    const fake = createHttpsGetFake(served.routes);
    requestedUrls = fake.requestedUrls;
    return {
      storageDir,
      platform: "linux",
      arch: "x64",
      ...options.host,
      httpsGet: fake.httpsGet,
      execFile: options.execFile ?? onlyStagedBinaryIsValid,
      ui: createUiFake(options.script ?? {}, uiCalls),
      onInstalled: () => (installedEvents += 1),
      assets: served.assets,
    };
  }

  function calledFunctions(): string[] {
    return uiCalls.map((call) => call.function);
  }

  describe("the command cdd.installBinary", () => {
    it("shows the warning and offers no installation when the platform has no asset", async () => {
      const host = { platform: "win32", arch: "arm64" } as const;

      await runInstallCommand(flowFor(serveTarGz(goodTarEntries), { host }));

      expect(uiCalls).toEqual([
        {
          function: "showWarning",
          message:
            'No prebuilt CDD binary exists for win32-arm64. Install it with "go install github.com/jonasalessi/cdd-lint@latest", then run "CDD: Select Binary".',
        },
      ]);
      expect(requestedUrls).toEqual([]);
    });

    it("starts no download when a valid managed binary exists", async () => {
      await writeStorageFile(storageDir, "bin/v0.1.0/cdd", "existing managed binary");
      const before = await storageContentOf(storageDir);
      const execFileFake = createExecFileFake();
      execFileFake.respond(join(storageDir, "bin", "v0.1.0", "cdd"), validResponse);

      await runInstallCommand(
        flowFor(serveTarGz(goodTarEntries), { execFile: execFileFake.execFile }),
      );

      expect(uiCalls).toEqual([
        { function: "showInformation", message: "CDD v0.1.0 is already installed." },
      ]);
      expect(requestedUrls).toEqual([]);
      expect(installedEvents).toBe(0);
      expect(await storageContentOf(storageDir)).toEqual(before);
    });

    it("asks for approval in a modal dialog before the first request", async () => {
      await runInstallCommand(flowFor(serveTarGz(goodTarEntries)));

      expect(uiCalls).toEqual([
        {
          function: "askInModalDialog",
          message: "Download and install CDD v0.1.0 from github.com?",
          actions: ["Install"],
        },
      ]);
      expect(requestedUrls).toEqual([]);
      expect(await storageContentOf(storageDir)).toEqual({});
    });

    it("installs after the user selects Install", async () => {
      const script = { modalAnswer: "Install" };

      await runInstallCommand(flowFor(serveTarGz(goodTarEntries), { script }));

      expect(calledFunctions()).toEqual(["askInModalDialog", "runWithProgress", "showInformation"]);
      expect(uiCalls.at(-1)?.message).toBe("CDD v0.1.0 is installed.");
      expect(installedEvents).toBe(1);
      expect(await storageContentOf(storageDir)).toMatchObject({
        "bin/v0.1.0/cdd": binaryContent,
      });
    });
  });

  describe("startInstallation", () => {
    it("runs the steps with no dialog, then clears the cache and shows the message", async () => {
      await startInstallation(flowFor(serveTarGz(goodTarEntries)));

      expect(uiCalls).toEqual([
        { function: "runWithProgress", message: "Installing CDD v0.1.0" },
        { function: "showInformation", message: "CDD v0.1.0 is installed." },
      ]);
      expect(installedEvents).toBe(1);
      expect(requestedUrls).toHaveLength(2);
    });

    it("shows the reason of a failure with the actions Retry and Select Binary", async () => {
      await startInstallation(flowFor(withWrongChecksum(serveTarGz(goodTarEntries))));

      expect(uiCalls).toEqual([
        { function: "runWithProgress", message: "Installing CDD v0.1.0" },
        {
          function: "askAfterFailure",
          message: checksumFailure,
          actions: ["Retry", "Select Binary"],
        },
      ]);
      expect(installedEvents).toBe(0);
    });

    it("starts the steps again with no dialog when the user selects Retry", async () => {
      const script = { failureAnswers: ["Retry", undefined] };
      const served = withWrongChecksum(serveTarGz(goodTarEntries));

      await startInstallation(flowFor(served, { script }));

      expect(calledFunctions()).toEqual([
        "runWithProgress",
        "askAfterFailure",
        "runWithProgress",
        "askAfterFailure",
      ]);
      expect(requestedUrls).toHaveLength(4);
    });

    it("runs the select command when the user selects Select Binary", async () => {
      const script = { failureAnswers: ["Select Binary"] };
      const served = withWrongChecksum(serveTarGz(goodTarEntries));

      await startInstallation(flowFor(served, { script }));

      expect(calledFunctions()).toEqual(["runWithProgress", "askAfterFailure", "selectBinary"]);
      expect(requestedUrls).toHaveLength(2);
    });

    it("shows no message after a cancellation", async () => {
      const script = { cancelsProgress: true };

      await startInstallation(flowFor(serveTarGz(goodTarEntries), { script }));

      expect(calledFunctions()).toEqual(["runWithProgress"]);
      expect(installedEvents).toBe(0);
      expect(await storageContentOf(storageDir)).toEqual({});
    });

    it("shows the warning when the platform has no asset", async () => {
      const host = { platform: "linux", arch: "ia32" } as const;

      await startInstallation(flowFor(serveTarGz(goodTarEntries), { host }));

      expect(calledFunctions()).toEqual(["showWarning"]);
      expect(requestedUrls).toEqual([]);
    });
  });
});
