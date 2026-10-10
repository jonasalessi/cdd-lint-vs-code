import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/e2e/**/*.test.js",
  version: "stable",
  workspaceFolder: "e2e/workspace",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
