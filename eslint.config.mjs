import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const adapterFiles = [
  "src/extension.ts",
  "src/logging/logger.ts",
  "src/binary/selectBinaryCommand.ts",
  "src/install/installBinaryCommand.ts",
  "src/config/configWatcher.ts",
  "src/config/createConfigCommand.ts",
  "src/analysis/AnalysisScheduler.ts",
  "src/analysis/analyzeCurrentFileCommand.ts",
  "src/inlay-hints/CddInlayHintsProvider.ts",
  "src/diagnostics/CddDiagnostics.ts",
  "src/status/CddStatusItem.ts",
];

const vscodeImportMessage = "Only the adapter files of plan section 4.3 import vscode.";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "out/",
      "node_modules/",
      ".vscode-test/",
      ".cdd-bin/",
      "e2e/workspace/",
      "contract/fixtures/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: { "max-params": ["error", 4] },
  },
  {
    files: ["src/**/*.ts", "contract/**/*.ts"],
    ignores: adapterFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "vscode", message: vscodeImportMessage }] },
      ],
    },
  },
);
