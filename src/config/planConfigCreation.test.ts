import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BinaryResolution } from "../binary/BinaryResolver";
import {
  configExistsMessage,
  noBinaryMessage,
  noFolderMessage,
  planConfigCreation,
  rootConfigPath,
  type ConfigCreationFacts,
} from "./planConfigCreation";

const resolvedBinary: BinaryResolution = { kind: "resolved", binaryPath: "/usr/local/bin/cdd" };

function factsWith(overrides: Partial<ConfigCreationFacts>): ConfigCreationFacts {
  return {
    workspaceFolderPath: "/work/project",
    hasConfig: false,
    binary: resolvedBinary,
    ...overrides,
  };
}

describe("planConfigCreation", () => {
  it("runs cdd init in the workspace folder with the resolved binary", () => {
    expect(planConfigCreation(factsWith({}))).toEqual({
      kind: "run-init",
      binaryPath: "/usr/local/bin/cdd",
      workingDirectory: "/work/project",
      arguments: ["init"],
    });
  });

  it("never passes --force or --yes", () => {
    const plan = planConfigCreation(factsWith({}));

    expect(plan.kind === "run-init" && plan.arguments).toEqual(["init"]);
  });

  it("shows a message when no workspace folder is known", () => {
    expect(planConfigCreation(factsWith({ workspaceFolderPath: undefined }))).toEqual({
      kind: "message",
      message: noFolderMessage,
    });
  });

  it("does not run cdd init when the workspace folder has a configuration", () => {
    expect(planConfigCreation(factsWith({ hasConfig: true }))).toEqual({
      kind: "message",
      message: configExistsMessage,
    });
  });

  it("shows a message when no binary is found", () => {
    expect(planConfigCreation(factsWith({ binary: { kind: "no-binary" } }))).toEqual({
      kind: "message",
      message: noBinaryMessage,
    });
  });

  it("shows a message when the configured binary is not valid", () => {
    const binary: BinaryResolution = { kind: "invalid-binary", failureClass: "not-cdd" };

    expect(planConfigCreation(factsWith({ binary }))).toEqual({
      kind: "message",
      message: noBinaryMessage,
    });
  });
});

describe("rootConfigPath", () => {
  it("is cdd.config.yaml in the root of the workspace folder", () => {
    expect(rootConfigPath("/work/project")).toBe(join("/work/project", "cdd.config.yaml"));
  });
});
