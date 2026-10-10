import { defineConfig } from "vitest/config";

if (!process.env.CDD_BIN) {
  throw new Error("CDD_BIN is not set. Set it to the absolute path of the cdd binary.");
}

export default defineConfig({
  test: {
    include: ["contract/**/*.contract.test.ts"],
    passWithNoTests: true,
  },
});
