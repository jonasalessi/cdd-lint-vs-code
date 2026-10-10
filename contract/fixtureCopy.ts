import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixturesDir = resolve(__dirname, "fixtures");

export async function copyFixture(fixtureName: string): Promise<string> {
  const copyDir = await mkdtemp(join(tmpdir(), `cdd-contract-${fixtureName}-`));
  await cp(join(fixturesDir, fixtureName), copyDir, { recursive: true });
  return copyDir;
}

export async function removeFixtureCopy(copyDir: string): Promise<void> {
  await rm(copyDir, { recursive: true, force: true });
}
