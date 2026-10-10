import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export async function verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
  return (await sha256Of(filePath)) === expectedSha256.toLowerCase();
}

async function sha256Of(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}
