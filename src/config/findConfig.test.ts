import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFileName, findConfig } from "./findConfig";

describe("findConfig", () => {
  let parent: string;
  let workspaceFolderPath: string;

  function createConfig(...segments: string[]): string {
    const directory = join(parent, ...segments);
    mkdirSync(directory, { recursive: true });
    const configPath = join(directory, configFileName);
    writeFileSync(configPath, "version: 1\n");
    return configPath;
  }

  function find(...documentSegments: string[]) {
    const documentPath = join(workspaceFolderPath, ...documentSegments);
    return findConfig({ documentPath, workspaceFolderPath });
  }

  beforeEach(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), "cdd-find-config-")));
    workspaceFolderPath = join(parent, "workspace");
    mkdirSync(join(workspaceFolderPath, "app", "src"), { recursive: true });
  });

  afterEach(() => rmSync(parent, { recursive: true, force: true }));

  it("finds the file in the directory of the document", async () => {
    const configPath = createConfig("workspace", "app", "src");

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "found", configPath });
  });

  it("finds the file in a directory above the document", async () => {
    const configPath = createConfig("workspace", "app");

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "found", configPath });
  });

  it("finds the file in the workspace folder root", async () => {
    const configPath = createConfig("workspace");

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "found", configPath });
    expect(await find("order.ts")).toEqual({ kind: "found", configPath });
  });

  it("gives the nearest file when two directories have one", async () => {
    createConfig("workspace");
    const nearestPath = createConfig("workspace", "app");

    expect(await find("app", "src", "order.ts")).toEqual({
      kind: "found",
      configPath: nearestPath,
    });
  });

  it("stops after the workspace folder root", async () => {
    createConfig();

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "no-config" });
  });

  it("gives no-config when no directory has the file", async () => {
    expect(await find("app", "src", "order.ts")).toEqual({ kind: "no-config" });
  });

  it("does not search a directory below the document or next to its path", async () => {
    createConfig("workspace", "app", "src", "nested");
    createConfig("workspace", "other");

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "no-config" });
  });

  it("does not accept a directory with the name of the file", async () => {
    mkdirSync(join(workspaceFolderPath, "app", configFileName));

    expect(await find("app", "src", "order.ts")).toEqual({ kind: "no-config" });
  });

  it("gives no-config for a document outside the workspace folder", async () => {
    createConfig();
    const documentPath = join(parent, "order.ts");

    expect(await findConfig({ documentPath, workspaceFolderPath })).toEqual({ kind: "no-config" });
  });
});
