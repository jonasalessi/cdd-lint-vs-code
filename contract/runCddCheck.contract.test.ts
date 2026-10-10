import { execFile } from "node:child_process";
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyRun } from "../src/analysis/classifyRun";
import { parseReport } from "../src/analysis/parseReport";
import { relativePosixPath } from "../src/analysis/relativePosixPath";
import { runCddCheck } from "../src/analysis/runCddCheck";
import { cddBinaryPath } from "./cddBinaryPath";
import { runCompletedCheck } from "./completedCheck";
import { copyFixture, removeFixtureCopy } from "./fixtureCopy";

describe("runCddCheck with the real binary", () => {
  let configDir: string;
  let documentPath: string;

  beforeEach(async () => {
    configDir = await copyFixture("no-violation");
    documentPath = join(configDir, "my src", "order service.ts");
    await mkdir(join(configDir, "my src"));
    await rename(join(configDir, "src", "order.ts"), documentPath);
  });

  afterEach(() => removeFixtureCopy(configDir));

  it("analyzes a path that contains a space", async () => {
    const relativePath = relativePosixPath(configDir, documentPath);

    const run = await runCompletedCheck({ configDir, relativePath });

    expect(relativePath).toBe("my src/order service.ts");
    expect(run).toMatchObject({ exitCode: 0, wasKilled: false, startError: undefined });
    expect(parseReport(run.stdout)?.files.map((file) => file.path)).toEqual([relativePath]);
    expect(classifyRun(run, relativePath)).toMatchObject({
      kind: "measured",
      blocked: false,
      units: [{ name: "Order", kind: "class", exceeds: false }],
    });
  });

  it("gives aborted and starts no analysis when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = {
      binaryPath: cddBinaryPath(),
      configDir,
      relativePath: "my src/order service.ts",
    };

    const checkRun = await runCddCheck({ ...request, signal: controller.signal }, execFile);

    expect(checkRun).toEqual({ kind: "aborted" });
  });

  it("gives a start error when the binary does not exist", async () => {
    const request = { binaryPath: join(configDir, "missing-cdd"), configDir, relativePath: "a.ts" };

    const checkRun = await runCddCheck(
      { ...request, signal: new AbortController().signal },
      execFile,
    );

    expect(checkRun).toMatchObject({ kind: "completed", result: { exitCode: null } });
    expect(checkRun.kind === "completed" && checkRun.result.startError?.code).toBe("ENOENT");
  });
});
