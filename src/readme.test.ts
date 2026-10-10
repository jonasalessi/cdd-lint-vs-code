import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type CommandDeclaration = { command: string; title: string };

type Manifest = {
  contributes: {
    commands: CommandDeclaration[];
    configuration: { properties: Record<string, unknown> };
  };
};

function readRepositoryFile(fileName: string): string {
  return readFileSync(resolve(__dirname, "..", fileName), "utf8");
}

function readManifest(): Manifest {
  return JSON.parse(readRepositoryFile("package.json")) as Manifest;
}

describe("README.md", () => {
  const readme = readRepositoryFile("README.md");
  const { commands, configuration } = readManifest().contributes;
  const settingIds = Object.keys(configuration.properties);

  it("reads a minimum of one setting and one command from package.json", () => {
    expect(settingIds).not.toHaveLength(0);
    expect(commands).not.toHaveLength(0);
  });

  it.each(settingIds)("names the setting %s", (settingId) => {
    expect(readme).toContain(`\`${settingId}\``);
  });

  it.each(commands)("names the command $command by its ID", ({ command }) => {
    expect(readme).toContain(`\`${command}\``);
  });

  it.each(commands)("names the command $command by its title", ({ title }) => {
    expect(readme).toContain(`\`${title}\``);
  });

  it("has no image", () => {
    expect(readme).not.toMatch(/!\[|<img/);
  });
});
