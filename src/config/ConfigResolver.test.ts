import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigResolver } from "./ConfigResolver";
import { configFileName } from "./findConfig";

const noOutputFile = "reporter:\n  outputFile: null\n";
const withOutputFile = "reporter:\n  outputFile: report.json\n";
const invalidYaml = "reporter:\n  outputFile: [report.json\n";

describe("ConfigResolver", () => {
  let workspaceFolderPath: string;
  let configPath: string;
  let loggedErrors: string[];
  let resolver: ConfigResolver;

  function writeConfig(configText: string): void {
    writeFileSync(configPath, configText);
  }

  function resolve(...documentSegments: string[]) {
    const documentPath = join(workspaceFolderPath, ...documentSegments);
    return resolver.resolve({ documentPath, workspaceFolderPath });
  }

  beforeEach(() => {
    workspaceFolderPath = realpathSync(mkdtempSync(join(tmpdir(), "cdd-config-resolver-")));
    mkdirSync(join(workspaceFolderPath, "app", "src"), { recursive: true });
    configPath = join(workspaceFolderPath, "app", configFileName);
    loggedErrors = [];
    resolver = new ConfigResolver({ log: { error: (message) => loggedErrors.push(message) } });
  });

  afterEach(() => rmSync(workspaceFolderPath, { recursive: true, force: true }));

  describe("results of plan section 3.6", () => {
    it("gives the configuration directory when outputFile is not set", async () => {
      writeConfig(noOutputFile);

      expect(await resolve("app", "src", "order.ts")).toEqual({
        kind: "resolved",
        configDir: join(workspaceFolderPath, "app"),
        configPath,
      });
      expect(loggedErrors).toEqual([]);
    });

    it("gives no-config when no file is found", async () => {
      expect(await resolve("app", "src", "order.ts")).toEqual({ kind: "no-config" });
    });

    it("gives output-file-configured with the file path when outputFile is set", async () => {
      writeConfig(withOutputFile);

      expect(await resolve("app", "src", "order.ts")).toEqual({
        kind: "output-file-configured",
        configPath,
      });
    });

    it("gives unparsable with the file path and logs the parser error", async () => {
      writeConfig(invalidYaml);

      expect(await resolve("app", "src", "order.ts")).toEqual({ kind: "unparsable", configPath });
      expect(loggedErrors).toHaveLength(1);
      expect(loggedErrors[0]).toContain(configPath);
      expect(loggedErrors[0]).toMatch(/YAML/);
    });

    it.skipIf(process.platform === "win32")(
      "gives unparsable and logs the error when the file cannot be read",
      async () => {
        writeConfig(noOutputFile);
        chmodSync(configPath, 0o000);

        expect(await resolve("app", "src", "order.ts")).toEqual({ kind: "unparsable", configPath });
        expect(loggedErrors).toHaveLength(1);
        expect(loggedErrors[0]).toContain(configPath);
      },
    );
  });

  describe("cache", () => {
    it("keeps the result of a directory until the cache is cleared", async () => {
      writeConfig(noOutputFile);
      await resolve("app", "src", "order.ts");
      writeConfig(withOutputFile);

      expect((await resolve("app", "src", "invoice.ts")).kind).toBe("resolved");

      resolver.clearCache();

      expect((await resolve("app", "src", "invoice.ts")).kind).toBe("output-file-configured");
    });

    it("keeps a no-config result until the cache is cleared", async () => {
      await resolve("app", "src", "order.ts");
      writeConfig(noOutputFile);

      expect((await resolve("app", "src", "order.ts")).kind).toBe("no-config");

      resolver.clearCache();

      expect((await resolve("app", "src", "order.ts")).kind).toBe("resolved");
    });

    it("logs the parser error one time for two resolutions of a directory", async () => {
      writeConfig(invalidYaml);

      await Promise.all([resolve("app", "src", "order.ts"), resolve("app", "src", "invoice.ts")]);
      await resolve("app", "src", "order.ts");

      expect(loggedErrors).toHaveLength(1);
    });

    it("keeps a separate result for each directory", async () => {
      writeConfig(noOutputFile);
      await resolve("app", "src", "order.ts");
      writeConfig(withOutputFile);

      expect((await resolve("app", "order.ts")).kind).toBe("output-file-configured");
      expect((await resolve("app", "src", "order.ts")).kind).toBe("resolved");
    });

    it("does not store a resolution that started before the cache was cleared", async () => {
      writeConfig(noOutputFile);
      const earlier = resolve("app", "src", "order.ts");
      resolver.clearCache();
      await earlier;
      writeConfig(withOutputFile);

      expect((await resolve("app", "src", "order.ts")).kind).toBe("output-file-configured");
    });
  });
});
