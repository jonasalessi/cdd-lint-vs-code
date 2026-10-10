# CDD Lint

CDD Lint shows the results of [cdd-lint](https://github.com/jonasalessi/cdd-lint) in VS Code.

cdd-lint measures code with Cognitive-Driven Development (CDD). Each code unit, for example a class or a function, gets a score in Intrinsic Complexity Points (ICP). Your team sets an ICP limit for a code unit.

The extension does two things:

- It shows the ICP score of each code unit as an Inlay Hint, for example `ICP: 16.5 / 10`. The tooltip of the hint shows the metrics that make up the score.
- It reports each code unit that is over its limit as a diagnostic in the Problems panel.

The `cdd` binary calculates all scores. The extension only runs the binary and shows the result. It does not change your source files, your CDD configuration or your CDD report files.

## Requirements

- VS Code 1.90 or later.
- A trusted workspace. VS Code disables the extension in an untrusted workspace.
- A `cdd` binary, version `v0.1.0` or later. The extension can find the binary or install it. See [The `cdd` binary](#the-cdd-binary).
- A `cdd.config.yaml` file in your project. See [Configuration with `cdd init`](#configuration-with-cdd-init).

## Configuration with `cdd init`

The extension needs a `cdd.config.yaml` file. It does not create this file.

To create the file, run this command in the root directory of your project:

```sh
cdd init
```

For a file that you open, the extension searches for `cdd.config.yaml` in the directory of the file. Then it searches each parent directory, up to the root of the workspace folder. It uses the nearest `cdd.config.yaml`.

If the extension finds no `cdd.config.yaml`, it does not analyze the file. The status shows `CDD: no cdd.config.yaml`.

The `languages`, `include` and `exclude` rules of `cdd.config.yaml` decide which files the binary analyzes. For a file that these rules leave out, the status shows `CDD: file not in the CDD configuration`.

## Supported files

The extension analyzes a file when all of these conditions are true:

- The file is on disk (the URI scheme is `file`).
- The file extension is `.go`, `.java`, `.kt`, `.ts` or `.tsx`.
- The file is in a workspace folder.
- The file name has no comma.

For any other file, the status shows `CDD: file not supported`.

## When analysis starts

The extension analyzes saved content only. It analyzes one file in each run and never the full project.

These events start an analysis of a file:

- You open a supported file, or the file becomes visible in an editor, and the file has no result yet.
- You save the file.
- You undo your changes back to the saved content, or VS Code reloads the file from disk.
- You run `CDD: Analyze Current File`.

These events start a new analysis of each visible file:

- A `cdd.config.yaml` file is created, changed or deleted.
- The `cdd.binaryPath` setting changes.
- An installation of the managed binary completes.

Typing does not start an analysis. While a file has unsaved changes, the hints stay and move with the lines that you add or remove. Their tooltip then shows that the score is from the last saved version. Save the file to update the scores.

## Diagnostics

A code unit that is over its limit gets one diagnostic with the source `CDD` and the code `icp-limit`.

- The severity is `Error` when the cdd-lint report says that the violation is blocking.
- The severity is `Warning` in all other cases.

## Status

For a supported file, the language status of VS Code shows a CDD item. Open the language status with the `{}` icon in the status bar. The item shows the highest ICP score of the file, or the reason why the file has no result.

## Settings

| Setting               | Type    | Default | Description                                                                                                                                                         |
| --------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdd.binaryPath`      | string  | `""`    | Absolute path of the `cdd` executable. An empty value means automatic discovery. This setting has the `machine` scope, so a workspace cannot select the executable. |
| `cdd.showInlayHints`  | boolean | `true`  | Shows or hides the ICP Inlay Hints.                                                                                                                                 |
| `cdd.showDiagnostics` | boolean | `true`  | Publishes or clears the ICP diagnostics.                                                                                                                            |

## Commands

| Title                         | Command ID               | Description                                                                                                                               |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CDD: Analyze Current File`   | `cdd.analyzeCurrentFile` | Analyzes the file of the active editor. If the file has unsaved changes, the command asks you to save it.                                 |
| `CDD: Select Binary`          | `cdd.selectBinary`       | Opens a file dialog. If the selected file is a valid `cdd` binary, the command writes its path to `cdd.binaryPath` in your user settings. |
| `CDD: Install Managed Binary` | `cdd.installBinary`      | Downloads and installs cdd-lint `v0.1.0` after you approve it. See [Installation and consent](#installation-and-consent).                 |
| `CDD: Show Output`            | `cdd.showOutput`         | Shows the `CDD` Output Channel. The channel logs each run of the binary and each binary that the extension examined.                      |

## The `cdd` binary

### Binary discovery

If `cdd.binaryPath` is not empty, the extension uses only that path. If the path is not valid, the extension does not try other locations. The status shows `CDD: configured binary not valid`.

If `cdd.binaryPath` is empty, the extension tries these locations in this order and uses the first valid binary:

1. `cdd` on `PATH`.
2. `cdd-lint` on `PATH`. This is the name that `go install github.com/jonasalessi/cdd-lint@latest` produces.
3. The managed binary that the extension installed.

A binary is valid when `<path> version` completes in 5 seconds and reports version `v0.1.0` or later. A development build (`dev`) is also valid.

If the extension finds no valid binary, the status shows `CDD: binary not found`.

### Installation and consent

The extension never downloads or installs a binary without your approval. An installation starts only after one of these actions:

- You select `Install` in the notification `CDD binary not found. Install CDD v0.1.0 from github.com?`. The extension shows this notification a maximum of one time in each window session. If you select `Don't Ask Again`, the extension does not show it again.
- You run `CDD: Install Managed Binary` and select `Install` in the dialog.

The installation works as follows:

- The extension installs only cdd-lint `v0.1.0`. It downloads the release asset from `github.com` over HTTPS.
- The extension compares the SHA-256 of the download with a value that is part of the extension. If the values are not equal, the installation stops.
- The extension stores the binary in its own global storage directory. It does not change `PATH` and does not need administrator rights.
- The extension does not check for updates.

If the installation fails, an error message shows the reason and offers `Retry` and `Select Binary`.

With Remote SSH, WSL or a dev container, the extension runs on the remote host. The binary must then be on that host, and the extension installs the managed binary there.

## Known limits

- **Platforms.** A prebuilt binary exists only for macOS (x64, arm64), Linux (x64, arm64) and Windows (x64). On any other platform, the extension does not offer an installation. Install cdd-lint with `go install github.com/jonasalessi/cdd-lint@latest`, then run `CDD: Select Binary`.
- **Alpine and musl.** The prebuilt Linux binaries need glibc (2.34 or later on x64). They do not run on Alpine Linux or on other musl systems.
- **`PATH`.** If VS Code cannot read your shell environment, a binary in a user directory is not on the `PATH` of the extension. Run `CDD: Select Binary` and select the binary.
- **`reporter.outputFile`.** If `cdd.config.yaml` sets `reporter.outputFile`, the extension does not analyze the files of that configuration, because each run would overwrite your report file. The status shows `CDD: reporter.outputFile is not supported in the editor`.
- **Configuration search.** The search for `cdd.config.yaml` stops at the root of the workspace folder. The extension does not find a `cdd.config.yaml` that is above the workspace folder.
- **Inlay Hints setting.** If the VS Code setting `editor.inlayHints.enabled` is `off`, VS Code hides all Inlay Hints, also the ICP hints.
- **Hint color.** VS Code does not let an extension set the color of an Inlay Hint. A hint of a code unit that is over its limit looks the same as any other hint. The diagnostic shows the violation.
- **File names with a comma.** The `cdd` binary splits its path arguments on commas. The extension cannot analyze a file that has a comma in its name.
- **Unsaved changes.** The extension analyzes saved content only.
- **Virtual workspaces.** The extension does not support virtual workspaces.

## Development

This section is for developers who change the extension.

### Prerequisites

- Node.js 22 or later, and npm.
- A `cdd` binary on `PATH`, version `v0.1.0` or later. The contract tests run this binary.
- The `code` command on `PATH`. To add it, run `Shell Command: Install 'code' command in PATH` from the VS Code command palette.

Install the dependencies:

```sh
npm ci
```

### Run the extension from the source code

This method starts a second VS Code window that loads the extension from the repository. It does not install the extension.

```sh
npm run build
code --extensionDevelopmentPath="$PWD" /path/to/a/project
```

- The new window has `[Extension Development Host]` in its title.
- The project must have a `cdd.config.yaml` and a supported file. If it has no `cdd.config.yaml`, run `cdd init` in the project.
- After you change the code, run `npm run build` again. Then run `Developer: Reload Window` in the Extension Development Host window.

### Install the packaged extension

This method tests the same VSIX file that a release publishes.

```sh
npm run build
npm run package
code --install-extension cdd-lint-vscode-0.1.0.vsix --force
```

Then run `Developer: Reload Window`. To remove the extension:

```sh
code --uninstall-extension jonasalessi.cdd-lint-vscode
```

### Check that the extension works

1. Open a supported file. An ICP hint appears at the end of the first line of each code unit, with no save.
2. Hover over a hint. The tooltip shows the metrics of the score.
3. Open the language status with the `{}` icon in the status bar. The CDD item shows the highest ICP score of the file.
4. Make a code unit exceed its limit and save the file. The Problems panel shows a `CDD` diagnostic.
5. Run `CDD: Show Output`. The Output Channel shows each run of the binary.

If no hint appears, the CDD item of the language status shows the reason. Also make sure that the workspace is trusted and that `editor.inlayHints.enabled` is not `off`.

### Run the tests

| Command                 | Action                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run lint`          | Runs ESLint and the Prettier check.                                                |
| `npm run build`         | Checks the types and creates the bundle `dist/extension.js`.                       |
| `npm run test`          | Runs the unit tests.                                                               |
| `npm run test:contract` | Runs the contract tests with the real binary. It fails if `CDD_BIN` is not set.    |
| `npm run test:e2e`      | Runs the extension-host tests in a downloaded copy of VS Code, with a fake binary. |
| `npm run package`       | Creates the VSIX file and checks its content.                                      |
| `npm run verify`        | Runs all the commands above, in this order. Run it before you open a pull request. |

The contract tests need the path of the real binary:

```sh
CDD_BIN="$(command -v cdd)" npm run verify
```

One contract test downloads and installs the pinned cdd-lint release in a temporary directory. It runs only when `CDD_NETWORK_TESTS` is `1`:

```sh
CDD_NETWORK_TESTS=1 CDD_BIN="$(command -v cdd)" npm run test:contract
```

The extension-host tests open VS Code windows. Do not use the keyboard or the mouse in these windows while the tests run.

## License

Apache-2.0. See [LICENSE](LICENSE).
