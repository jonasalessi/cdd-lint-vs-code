import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type SettingDeclaration = {
  type: string;
  default: unknown;
  scope: string;
};

type Manifest = {
  extensionKind: string[];
  capabilities: {
    untrustedWorkspaces: { supported: boolean };
    virtualWorkspaces: boolean;
  };
  contributes: {
    commands: { command: string; title: string }[];
    configuration: { properties: Record<string, SettingDeclaration> };
  };
};

function readManifest(): Manifest {
  const manifestPath = resolve(__dirname, "..", "package.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

describe("package.json", () => {
  const manifest = readManifest();

  it("disables the extension in an untrusted workspace", () => {
    expect(manifest.capabilities.untrustedWorkspaces.supported).toBe(false);
  });

  it("does not support virtual workspaces", () => {
    expect(manifest.capabilities.virtualWorkspaces).toBe(false);
  });

  it("runs on the workspace host", () => {
    expect(manifest.extensionKind).toEqual(["workspace"]);
  });

  it("declares cdd.binaryPath as a string setting with scope machine", () => {
    expect(manifest.contributes.configuration.properties["cdd.binaryPath"]).toMatchObject({
      type: "string",
      default: "",
      scope: "machine",
    });
  });

  it("declares cdd.showCodeLens as a boolean setting with scope window", () => {
    expect(manifest.contributes.configuration.properties["cdd.showCodeLens"]).toMatchObject({
      type: "boolean",
      default: true,
      scope: "window",
    });
  });

  it("declares cdd.showDiagnostics as a boolean setting with scope window", () => {
    expect(manifest.contributes.configuration.properties["cdd.showDiagnostics"]).toMatchObject({
      type: "boolean",
      default: true,
      scope: "window",
    });
  });

  it("declares the command cdd.toggleIcpDetails", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "cdd.toggleIcpDetails",
      title: "CDD: Toggle ICP Details",
    });
  });

  it("declares the command cdd.selectBinary", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "cdd.selectBinary",
      title: "CDD: Select Binary",
    });
  });

  it("declares the command cdd.installBinary", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "cdd.installBinary",
      title: "CDD: Install Managed Binary",
    });
  });

  it("declares the command cdd.createConfiguration", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "cdd.createConfiguration",
      title: "CDD: Create Configuration",
    });
  });
});
