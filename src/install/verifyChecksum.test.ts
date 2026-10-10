import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChecksum } from "./verifyChecksum";

const sha256OfAbc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("verifyChecksum", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cdd-checksum-"));
    filePath = join(directory, "download");
    await writeFile(filePath, "abc");
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  it("accepts a file with the expected SHA-256", async () => {
    expect(await verifyChecksum(filePath, sha256OfAbc)).toBe(true);
  });

  it("rejects a file with a different SHA-256", async () => {
    await writeFile(filePath, "abd");

    expect(await verifyChecksum(filePath, sha256OfAbc)).toBe(false);
  });

  it("rejects when the file does not exist", async () => {
    await expect(verifyChecksum(join(directory, "missing"), sha256OfAbc)).rejects.toThrow();
  });
});
