# CDD Lint

See how hard your code is to understand, directly in VS Code.

CDD Lint brings [cdd-lint](https://github.com/jonasalessi/cdd-lint) and Cognitive-Driven Development (CDD) into your editor. It shows the complexity score of each class and function next to its declaration, and it reports each one that is over the limit of your team. You get this feedback each time you save a file, before the code review and before CI.

The score is in Intrinsic Complexity Points (ICP). Branches, conditions, exception handling, coupling and inheritance add points to a code unit. A high score means that the code unit is hard to keep in your head.

## Features

- **Inline complexity scores.** See the ICP score of each code unit at the end of its first line, for example `ICP: 16.5 / 10`. You do not leave the editor.
- **Score breakdown.** Hover over a score to see which metrics add the points.
- **Violations in the Problems panel.** Find each code unit that is over its limit, as a warning or as an error.
- **Automatic analysis.** Open or save a file and the scores update. An analysis of one file takes a few milliseconds.
- **Simple setup.** The extension finds the `cdd` binary on your machine. If it finds none, it offers to install the binary for you.
- **Your rules.** The limits and the metrics come from the `cdd.config.yaml` of your project, the same file that CI uses.

Supported languages: Go, Java, Kotlin and TypeScript (`.go`, `.java`, `.kt`, `.ts`, `.tsx`).

## Getting started

1. Install the extension. See [Installation](#installation).
2. Open your project in VS Code and trust the workspace.
3. If the project has no `cdd.config.yaml`, run `CDD: Create Configuration` from the command palette. The command opens a terminal and runs `cdd init`, which asks for your languages, metrics and ICP limit. You can also run `cdd init` yourself in the root directory of the project.
4. Open a supported file. The ICP scores appear at the end of the first line of each code unit.
5. Hover over a score to see its metrics.
6. Open the Problems panel to see the code units that are over their limit.

If the extension finds no `cdd` binary, it shows the notification `CDD binary not found. Install CDD v0.1.0 from github.com?`. Select `Install`, and the scores appear when the installation completes.

## Installation

The extension is not on the Visual Studio Marketplace yet. Install it from a VSIX file:

1. Download `cdd-lint-vscode-<version>.vsix` from the [releases page](https://github.com/jonasalessi/cdd-lint-vs-code/releases).
2. Run this command:

   ```sh
   code --install-extension cdd-lint-vscode-<version>.vsix
   ```

3. Run `Developer: Reload Window` from the command palette.

You can also install the file from the Extensions view: open the `...` menu and select `Install from VSIX...`.

## How it works

The `cdd` binary calculates all scores. The extension runs the binary for one file and shows the result. It does not change your source files, your CDD configuration or your CDD report files.

### When the scores update

The extension analyzes the saved content of a file. These events start an analysis:

- You open a supported file, or the file becomes visible in an editor, and the file has no result yet.
- You save the file.
- You undo your changes back to the saved content, or VS Code reloads the file from disk.
- You run `CDD: Analyze Current File`.

These events start a new analysis of each visible file:

- A `cdd.config.yaml` file is created, changed or deleted.
- The `cdd.binaryPath` setting changes.
- An installation of the managed binary completes.

Typing does not start an analysis. While a file has unsaved changes, the scores stay and move with the lines that you add or remove. Their tooltip then says that the score is from the last saved version. Save the file to update the scores.

### Where the results appear

| Place          | What you see                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor         | One Inlay Hint for each code unit, for example `ICP: 16.5 / 10`. The tooltip shows the metrics of the score.                                                                                                        |
| Problems panel | One diagnostic with the source `CDD` and the code `icp-limit` for each code unit that is over its limit. The severity is `Error` when cdd-lint reports the violation as blocking, and `Warning` in all other cases. |
| Status bar     | A CDD item in the language status. Open it with the `{}` icon. It shows the highest ICP score of the file, or the reason why the file has no result.                                                                |
| Output panel   | The `CDD` Output Channel logs each run of the binary.                                                                                                                                                               |

### Which files the extension analyzes

The extension analyzes a file when all of these conditions are true:

- The file is on disk and in a workspace folder.
- The file extension is `.go`, `.java`, `.kt`, `.ts` or `.tsx`.
- The file name has no comma.
- A `cdd.config.yaml` exists in the directory of the file or in a parent directory, up to the root of the workspace folder. The nearest file wins.
- The `languages`, `include` and `exclude` rules of that `cdd.config.yaml` include the file.

## Configuration

### Project configuration

`cdd.config.yaml` holds the ICP limits, the metrics and the files to analyze. The extension reads this file through the `cdd` binary. It does not change the file, and it creates the file only when you run `CDD: Create Configuration`. See the [cdd-lint documentation](https://github.com/jonasalessi/cdd-lint) for its options.

### Extension settings

| Setting               | Default | Description                                                                                                                                                         |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdd.binaryPath`      | `""`    | Absolute path of the `cdd` executable. An empty value means automatic discovery. This setting has the `machine` scope, so a workspace cannot select the executable. |
| `cdd.showInlayHints`  | `true`  | Shows or hides the ICP scores in the editor.                                                                                                                        |
| `cdd.showDiagnostics` | `true`  | Shows or hides the ICP violations in the Problems panel.                                                                                                            |

### Commands

| Title                         | Command ID                | Description                                                                                                                                                                                                |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CDD: Analyze Current File`   | `cdd.analyzeCurrentFile`  | Analyzes the file of the active editor. If the file has unsaved changes, the command asks you to save it.                                                                                                  |
| `CDD: Select Binary`          | `cdd.selectBinary`        | Lets you select a `cdd` binary. A valid binary is saved in `cdd.binaryPath` in your user settings.                                                                                                         |
| `CDD: Install Managed Binary` | `cdd.installBinary`       | Downloads and installs cdd-lint `v0.1.0` after you approve it.                                                                                                                                             |
| `CDD: Show Output`            | `cdd.showOutput`          | Shows the `CDD` Output Channel.                                                                                                                                                                            |
| `CDD: Create Configuration`   | `cdd.createConfiguration` | Runs `cdd init` in a terminal, in the root of the workspace folder. You answer the questions of `cdd init`, and it writes `cdd.config.yaml`. The command does nothing if the folder already has this file. |

## The `cdd` binary

### How the extension finds the binary

If `cdd.binaryPath` is not empty, the extension uses only that path.

If `cdd.binaryPath` is empty, the extension tries these locations in this order and uses the first valid binary:

1. `cdd` on `PATH`.
2. `cdd-lint` on `PATH`. This is the name that `go install github.com/jonasalessi/cdd-lint@latest` produces.
3. The managed binary that the extension installed.

A binary is valid when `<path> version` completes in 5 seconds and reports version `v0.1.0` or later. A development build (`dev`) is also valid.

### Installation with your consent

The extension never downloads or installs a binary without your approval. An installation starts only after one of these actions:

- You select `Install` in the notification `CDD binary not found. Install CDD v0.1.0 from github.com?`. The extension shows this notification a maximum of one time in each window session. If you select `Don't Ask Again`, the extension does not show it again.
- You run `CDD: Install Managed Binary` and select `Install` in the dialog.

The installation is safe by design:

- The extension installs only cdd-lint `v0.1.0`, from `github.com`, over HTTPS.
- The extension compares the SHA-256 of the download with a value that is part of the extension. If the values are not equal, the installation stops.
- The extension stores the binary in its own storage directory. It does not change `PATH` and does not need administrator rights.
- The extension does not check for updates.

With Remote SSH, WSL or a dev container, the extension runs on the remote host. It finds or installs the binary on that host.

## Requirements and limitations

**Requirements**

- VS Code 1.90 or later.
- A trusted workspace. VS Code disables the extension in an untrusted workspace.
- A `cdd` binary, version `v0.1.0` or later. The extension can install it.
- A `cdd.config.yaml` in your project.

**Limitations**

- **Saved content only.** The extension does not analyze unsaved changes.
- **One score for each code unit.** The tooltip shows the points of each metric. It does not show which line adds each point.
- **Platforms.** A prebuilt binary exists only for macOS (x64, arm64), Linux (x64, arm64) and Windows (x64). On any other platform, install cdd-lint with `go install github.com/jonasalessi/cdd-lint@latest`, then run `CDD: Select Binary`.
- **Alpine and musl.** The prebuilt Linux binaries need glibc (2.34 or later on x64). They do not run on Alpine Linux or on other musl systems.
- **`reporter.outputFile`.** If `cdd.config.yaml` sets `reporter.outputFile`, the extension does not analyze the files of that configuration, because each run would overwrite your report file.
- **Configuration search.** The extension does not find a `cdd.config.yaml` that is above the root of the workspace folder.
- **Hint color.** VS Code does not let an extension set the color of an Inlay Hint. A score that is over its limit looks the same as any other score. The Problems panel shows the violation.
- **File names with a comma.** The `cdd` binary splits its path arguments on commas, so the extension cannot analyze such a file.
- **Virtual workspaces.** The extension does not support virtual workspaces.

## Troubleshooting

Open the language status with the `{}` icon in the status bar. The CDD item shows the reason when a file has no scores.

| Status                                                    | Cause                                                                        | Solution                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CDD: no cdd.config.yaml`                                 | The file has no `cdd.config.yaml` in its directory or in a parent directory. | Select `Create Configuration` in the status item, or run `cdd init` in the root directory of the project. |
| `CDD: file not in the CDD configuration`                  | The `languages`, `include` or `exclude` rules leave out the file.            | Change the rules in `cdd.config.yaml`.                                                                    |
| `CDD: file not supported`                                 | The file is not one that the extension analyzes.                             | See [Which files the extension analyzes](#which-files-the-extension-analyzes).                            |
| `CDD: binary not found`                                   | No valid `cdd` binary is on `PATH`, and no managed binary is installed.      | Run `CDD: Install Managed Binary`, or run `CDD: Select Binary`.                                           |
| `CDD: configured binary not valid`                        | The path in `cdd.binaryPath` is not a valid `cdd` binary.                    | Run `CDD: Select Binary`, or clear the setting to use automatic discovery.                                |
| `CDD: reporter.outputFile is not supported in the editor` | `cdd.config.yaml` sets `reporter.outputFile`.                                | Remove `reporter.outputFile` from the file.                                                               |
| `CDD: save the file to analyze`                           | The file has unsaved changes and no result yet.                              | Save the file.                                                                                            |
| `CDD: analysis failed`                                    | The run of the binary failed, or `cdd.config.yaml` is not valid.             | Run `CDD: Show Output` and read the log.                                                                  |

Other problems:

- **No scores, and the status shows a score.** Make sure that the VS Code setting `editor.inlayHints.enabled` is not `off`, and that `cdd.showInlayHints` is `true`.
- **The binary is installed, but the extension does not find it.** If VS Code cannot read your shell environment, a binary in a user directory is not on the `PATH` of the extension. Run `CDD: Select Binary` and select the binary.
- **No CDD item in the language status.** The item appears only for a `.go`, `.java`, `.kt`, `.ts` or `.tsx` file on disk. Also make sure that the workspace is trusted.

## Contributing

Contributions are welcome. You can report a bug, suggest an improvement, improve the documentation or send a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, the tests and the code rules.

This repository contains the VS Code extension. The `cdd` binary that calculates the scores is in the [cdd-lint](https://github.com/jonasalessi/cdd-lint) repository.

## License

Apache-2.0. See [LICENSE](LICENSE).
