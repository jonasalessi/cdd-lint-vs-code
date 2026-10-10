import { describe, expect, it } from "vitest";
import { cddBinaryPath } from "./cddBinaryPath";
import { runCdd } from "./runCdd";

const versionLinePattern = /^cdd (\S+)( .*)?$/;

describe("cdd version", () => {
  it("prints a first line that matches the expression of plan section 2.4", async () => {
    const run = await runCdd({
      binaryPath: cddBinaryPath(),
      cwd: process.cwd(),
      args: ["version"],
    });

    expect(run.exitCode).toBe(0);
    expect(run.stdout.split(/\r?\n/)[0]).toMatch(versionLinePattern);
  });
});
