export function cddBinaryPath(): string {
  const binaryPath = process.env.CDD_BIN;
  if (binaryPath) {
    return binaryPath;
  }
  throw new Error("CDD_BIN is not set. Set it to the absolute path of the cdd binary.");
}
