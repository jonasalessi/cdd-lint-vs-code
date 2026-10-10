# CDD VS Code Extension: Software Development Plan (v2)

This plan is for an AI coding agent. The agent implements the extension from an empty repository to a packaged VSIX.

**Objective:** Deliver a VS Code extension that integrates with [cdd-lint](https://github.com/jonasalessi/cdd-lint). The extension finds the `cdd` binary or installs it with user consent, analyzes source files, shows ICP scores as Inlay Hints, and reports ICP violations as diagnostics.

**How to read this plan:**

- Section 2 records facts about the CLI. They were verified against release `v0.1.0`. Do not re-derive them. If an observation contradicts a fact, stop and report it.
- Section 3 records product decisions. They are final for the MVP.
- Section 5 is the only execution order.
- Human-only activities are outside the agent's scope. They are listed in section 7.

## 1. Principles

1. Use TypeScript in strict mode and the official VS Code Extension API.
2. The CDD CLI is the only source of metrics. The extension never calculates ICP.
3. Do not change the CDD CLI. This plan works with the released `v0.1.0`.
4. Do not add a language server, daemon, or backend service.
5. Analyze only content that is equal to the file on disk. Section 3.4 lists the triggers.
6. Analyze one file per run. Never run a project-wide `cdd check`.
7. Never download or install a binary without explicit user approval in that moment.
8. Never modify source files, the user's CDD configuration, or the user's CDD report files.
9. Never execute anything in an untrusted workspace. The extension is disabled there (section 3.1).
10. Write the tests of a module in the same phase as the module. A phase is complete only when its verification passes.
11. Follow the code rules in section 4.3.

## 2. Verified facts about the CLI

### 2.1 Command

The extension runs exactly this command, with the working directory set to the directory of the configuration file:

```sh
<absolute-binary-path> check <relative-posix-path> --all --format json
```

- Do not pass `--config`. The CLI reads `cdd.config.yaml` from the working directory.
- Do not pass `--explain` in the MVP. The `metrics` array is present without it.
- `<relative-posix-path>` is `path.relative(<configuration directory>, <document path>)` with `/` separators. Do not resolve symlinks.
- The CLI splits path arguments on commas. A file name that contains a comma cannot be analyzed.
- A path that contains a space works.
- A single-file run takes approximately 10 ms.

### 2.2 Results by case

| Case | Exit | stdout | Last `cdd: ` line on stderr |
|---|---|---|---|
| Violation, blocking (`block_on_ci: true` and `legacy_mode: strict_all`) | 1 | JSON, `blocked: true` | none |
| Violation, not blocking | 0 | JSON, `blocked: false`, unit has `exceeds: true` | none |
| No violation | 0 | JSON | none |
| Source file with a syntax error | 0 | JSON, `units: []`, file `warnings: ["syntax error at 3:14"]` | none |
| File with no code units | 0 | JSON, `files: []` | none |
| Timeout of the configuration | 2 | JSON, `partial: true` | `cdd: timeout of ... elapsed; ...` |
| File excluded by `exclude` | 1 | empty | `cdd: <path> is excluded by the configuration` |
| Language not configured | 1 | empty | `cdd: <path>: no configured language claims this file` |
| File outside the configuration directory | 1 | empty | `cdd: <path> is outside ., the directory of the configuration` |
| File does not exist | 1 | empty | `cdd: <path>: no such file or directory` |
| Configuration missing | 1 | empty | `cdd: config: open cdd.config.yaml: no such file or directory` |
| Configuration is invalid YAML | 1 | empty | `cdd: config: <file>: yaml: ...` |
| Configuration fails validation | 1 | empty | `cdd: <path> is invalid:` and then `V<n> [error]: ...` lines |
| `reporter.outputFile` is set | 0 | `Report written to <path>` (not JSON) | none |

- Exit code `1` means a blocking violation or any error. The exit code alone cannot classify a run.
- stdout is empty on every error.
- stderr can contain `warning: ...` lines on a successful run. Non-empty stderr is not a failure.
- When `reporter.outputFile` is set, each run overwrites the user's report file. The extension must not run the CLI in this case (section 3.6).

### 2.3 JSON report

```ts
type CddReport = {
  root: string;                    // directory of the configuration, as typed ("." in our runs)
  blocked: boolean;
  filter: "violations" | "all";
  explain: boolean;
  partial: boolean;
  elapsed_ms: number;
  files: CddFile[];
  warnings?: string[];
  summary: { units: number; violations: number };
};
type CddFile = {
  path: string;                    // POSIX separators, relative to root
  language: string;
  units: CddUnit[];
  warnings?: string[];
};
type CddUnit = {
  name: string;
  kind: string;                    // for example "class", "func", "struct", "file"
  line: number;                    // 1-based
  col: number;                     // 1-based BYTE column, not UTF-16
  total: number;                   // float, for example 16.5
  limit: number;                   // integer
  exceeds: boolean;
  metrics: { metric: string; count: number; score: number }[];
};
```

- A unit has a start position only. It has no end position.
- In Go, methods are part of their type unit. A Go type gets one score.
- The schema of `v0.1.0` is identical to the schema of the current `main` branch.

### 2.4 Version output

- `cdd version` prints one line on stdout. Examples: `cdd v0.1.0 (8646c46, 2026-09-24T19:55:54Z)`, `cdd v0.1.0-19-g1b59eb0 (1b59eb0, ...)`, `cdd v0.1.0`, `cdd dev ...`.
- The first line matches `^cdd (\S+)( .*)?$`. The first group is the version token.

### 2.5 Release `v0.1.0`

This is the pinned release. The extension installs this release only.

| `process.platform` / `process.arch` | Asset | SHA-256 |
|---|---|---|
| `darwin` / `x64` | `cdd_v0.1.0_darwin_amd64.tar.gz` | `78fb6ad260e76da2f6fa147858712268c3fd8128fb491de11b887a10e633ba75` |
| `darwin` / `arm64` | `cdd_v0.1.0_darwin_arm64.tar.gz` | `b82b1c0aa7498a103a2bf30cd15aec640f9fb4c62ff5b834610c787c76886bc3` |
| `linux` / `x64` | `cdd_v0.1.0_linux_amd64.tar.gz` | `e0d258fc3891a04b2052ebbeee4ebbb9e9889e658d4fff45634715c9c3b6f715` |
| `linux` / `arm64` | `cdd_v0.1.0_linux_arm64.tar.gz` | `e3438b1938d0ddd726e9733eafb5f3d4edc6fe5081751f412e6ad84db1a8193f` |
| `win32` / `x64` | `cdd_v0.1.0_windows_amd64.zip` | `f91850567973bba4a5aa8ce39f812cedee9a76c6699d55bfd3570ce1515fcc91` |

- Download URL: `https://github.com/jonasalessi/cdd-lint/releases/download/v0.1.0/<asset>`. The server answers with a 302 redirect to `release-assets.githubusercontent.com`.
- `.tar.gz` entries: `./cdd` (mode 0755), `./LICENSE`, `./README.md`, `./CHANGELOG.md`.
- `.zip` entries: `cdd.exe`, `LICENSE`, `README.md`, `CHANGELOG.md`.
- All other platform and architecture pairs have no asset.
- The Linux binaries are linked dynamically against glibc (2.34 or later for `amd64`). They do not run on Alpine/musl.

### 2.6 Supported files

- The CLI reads `.go`, `.java`, `.kt`, `.ts` and `.tsx` files.
- The CLI configuration decides if a file is analyzed (`languages`, `include`, `exclude`). The extension does not read these rules.

## 3. Product decisions

### 3.1 Extension manifest

| Field | Value |
|---|---|
| `name` | `cdd-lint-vscode` |
| `displayName` | `CDD Lint` |
| `version` | `0.1.0` |
| `publisher` | `jonasalessi` (the owner can change this value before publication) |
| `repository` | `https://github.com/jonasalessi/cdd-lint-vs-code` (the owner can change this value) |
| `license` | `Apache-2.0` (the `LICENSE` file is already in the repository) |
| `engines.vscode` | `^1.90.0`, with the same version of `@types/vscode` |
| `main` | `./dist/extension.js` |
| `activationEvents` | `["onStartupFinished"]` |
| `extensionKind` | `["workspace"]` |
| `capabilities.untrustedWorkspaces` | `{ "supported": false }` |
| `capabilities.virtualWorkspaces` | `false` |

- `untrustedWorkspaces.supported: false` makes VS Code disable the extension in an untrusted workspace. No runtime trust check is necessary.
- `extensionKind: ["workspace"]` makes the extension run on the remote host for SSH, WSL and containers. Platform detection and the managed binary then refer to that host.

### 3.2 Settings

| Setting | Type | Default | Scope | Effect |
|---|---|---|---|---|
| `cdd.binaryPath` | string | `""` | `machine` | Absolute path of the `cdd` executable. Empty means automatic discovery. |
| `cdd.showInlayHints` | boolean | `true` | `window` | Shows or hides the ICP Inlay Hints. |
| `cdd.showDiagnostics` | boolean | `true` | `window` | Publishes or clears the ICP diagnostics. |

The `machine` scope prevents a workspace from selecting the executable. There are no other settings.

### 3.3 Commands

| Command ID | Title | Behavior |
|---|---|---|
| `cdd.analyzeCurrentFile` | `CDD: Analyze Current File` | Starts the analysis pipeline (section 3.4) for the active document. If the document is dirty, it shows the information message `Save the file to update its ICP scores.` If the document is not supported, or no editor is active, it shows `CDD cannot analyze this file.` |
| `cdd.selectBinary` | `CDD: Select Binary` | Opens a file dialog and validates the selected file (section 3.5). A valid file is written to `cdd.binaryPath` with `ConfigurationTarget.Global`. An invalid file shows an error message with the failure class, and the setting does not change. |
| `cdd.installBinary` | `CDD: Install Managed Binary` | Installs the pinned release (section 3.8). |
| `cdd.showOutput` | `CDD: Show Output` | Shows the `CDD` Output Channel. |

### 3.4 Supported documents, triggers and the analysis pipeline

A document is **supported** when all of these are true:

- Its URI scheme is `file`.
- Its file extension is `.go`, `.java`, `.kt`, `.ts` or `.tsx`. Do not use the language ID, because VS Code has no built-in Kotlin language.
- `workspace.getWorkspaceFolder(uri)` returns a folder. This folder is the workspace folder of the document. For nested folders, VS Code returns the innermost folder.
- Its file name contains no comma.

**Triggers.** These events request an analysis:

1. A document is saved.
2. A document enters the set of visible documents and has no record (section 3.9). Compute the set from `window.visibleTextEditors` at activation and on each `onDidChangeVisibleTextEditors` event.
3. `onDidChangeTextDocument` fires and the document is clean (undo to the saved state, or a reload from disk).
4. The user runs `cdd.analyzeCurrentFile`.
5. A `cdd.config.yaml` file is created, changed or deleted. The extension clears the configuration cache, deletes all records, and requests an analysis of each visible document.
6. The binary resolver cache is cleared by a change of `cdd.binaryPath` or by a completed installation. The extension deletes all records and requests an analysis of each visible document.

Triggers 5 and 6 also abort the active pipeline and cancel the pending request of each document that is not visible.

No other event requests an analysis. Scrolling, typing in a dirty document, and hint requests never request one.

**Scheduling.**

- A request for a document that is not supported or is dirty is ignored. Its record does not change.
- A request starts the pipeline 50 ms later. A later request for the same document in that time replaces the earlier request. (A save fires triggers 1 and 3. This rule makes them one run.)
- When the 50 ms end, the pipeline starts only if the document is still open, supported and clean. If not, the request is dropped.
- Each document has a maximum of one active pipeline. A new pipeline start aborts the active one.
- Closing a document aborts its active pipeline and cancels its pending request.
- An aborted pipeline is not classified, is not logged as a failure, and changes no record.
- A pipeline result is applied only if the document is open and its version is equal to the version at the pipeline start. If not, the result is discarded and the record does not change.

**Pipeline.** The steps run in this order. The first step that sets a record ends the pipeline.

1. Resolve the configuration (section 3.6). `no-config` and `output-file-configured` set a record with that state. A configuration that cannot be parsed sets a record with state `error`.
2. Resolve the binary (section 3.5). If no valid binary exists, set a record with state `invalid-binary` (when `cdd.binaryPath` is set) or `no-binary`.
3. Run the CLI and classify the run (section 3.7). Set a record from the outcome.

Sections 3.6, 3.5 and 3.7 define the notifications of each step.

### 3.5 Binary discovery

The resolver tries the candidates in this order and uses the first valid one:

1. `cdd.binaryPath`, if not empty.
2. `cdd` on `PATH`.
3. `cdd-lint` on `PATH` (the name that `go install` produces).
4. The managed binary: the file `<globalStorageUri>/bin/v0.1.0/cdd` (`cdd.exe` on Windows), if it exists.

Rules:

- Find a name on `PATH` with a function that examines each directory of the `PATH` value. On POSIX it looks for a file with the exact name. On Windows it looks only for `<name>.exe`. The result is an absolute path. Always execute absolute paths. This prevents Windows from running a `cdd.exe` that is in the working directory.
- A candidate is **valid** when `<path> version` exits `0` in 5 seconds, the first stdout line matches `^cdd (\S+)( .*)?$`, and the version is supported.
- The version is supported when the token starts with `v` and its `X.Y.Z` part is `0.1.0` or later (ignore a suffix such as `-19-g1b59eb0`), or when the token starts with `dev`. Log a warning for a `dev` token.
- If candidate 1 is invalid, do not continue to candidates 2 to 4. The user set this path explicitly.
- If candidate 2, 3 or 4 is invalid, continue with the next candidate and log the failure class.
- Failure classes: `not-absolute` (candidate 1 only), `not-found`, `not-executable`, `timeout`, `not-cdd` (the output does not match), `unsupported-version`.
- Cache a successful resolution in memory. Do not cache a failed resolution.
- Clear the cache when `cdd.binaryPath` changes and when an installation completes. These two events are trigger 6.
- Clear the cache also when a run cannot start (`ENOENT` or `EACCES`). This is not trigger 6. The run has the outcome `failed`, and the extension does not retry it.
- Known limitation: if VS Code cannot read the shell environment, a binary in a user directory is not on `PATH`. The user then uses `cdd.selectBinary`.

### 3.6 Configuration resolution

- Start in the directory of the document. Search upward for `cdd.config.yaml`. Stop after the root directory of the workspace folder of the document. The nearest file wins.
- If no file is found, the result is `no-config`.
- Parse the file with the `yaml` package and read only `reporter.outputFile`.
  - If the value is absent or `null`, the result is the configuration directory.
  - If the value is anything else, the result is `output-file-configured`. The extension does not run the CLI.
  - If the `yaml` package cannot parse the file, the result is `unparsable`. The extension does not run the CLI, because it cannot know if `outputFile` is set. Log the parser error.
- Cache the result for each directory. Trigger 5 clears the cache. One `FileSystemWatcher` for `**/cdd.config.yaml` provides trigger 5.
- Each workspace folder of a multi-root workspace is independent, because the search stops at the folder root.

### 3.7 Run classification

A run has a 10 second limit. After 10 seconds the extension kills the process. This section applies only to runs that were not aborted (section 3.4).

The runner returns `{ stdout, stderr, exitCode, durationMs, wasKilled, startError }`. A **valid report** is stdout that is JSON and passes report validation. The **file entry** is the element of `files` whose `path` is equal to the relative POSIX path that the extension passed. The **error line** is the last stderr line that starts with `cdd: `.

Classify with the first rule that matches:

| # | Condition | Outcome |
|---|---|---|
| 1 | `wasKilled` is true, or `startError` is set | `failed` |
| 2 | Valid report with `partial: true` | `not-measured` |
| 3 | Valid report with no file entry | `measured`, with zero units |
| 4 | Valid report, and the file entry has a non-empty `warnings` | `not-measured`, with the warnings |
| 5 | Valid report, all other cases | `measured`, with the units and `blocked` |
| 6 | The error line contains `is excluded by the configuration`, `no configured language claims this file`, or `the directory of the configuration` | `not-applicable` |
| 7 | The error line starts with `cdd: config: open` | `failed` (the configuration was deleted during the run) |
| 8 | The error line starts with `cdd: config:` or contains `is invalid:` | `config-error` |
| 9 | All other cases | `failed` |

- Rules 2 to 5 ignore the exit code. Rule 2 covers exit code `2`.
- Report validation checks the type of each field that the extension reads: `partial`, `blocked`, `files`, `files[].path`, `files[].warnings` (if present), and for each unit `name`, `kind`, `line`, `total`, `limit`, `exceeds`, and `metrics` with `metric`, `count`, `score`. A report that fails validation is not a valid report. It never produces a `measured` outcome.

### 3.8 Managed binary installation

- The extension installs only the release in section 2.5. The asset names and SHA-256 values are constants in the source code. The extension does not call the GitHub API.
- The checksum constant is part of the extension package, not of the GitHub release. It therefore detects a release asset that changed after this extension version was built, and a corrupt download.
- If the platform has no asset, do not offer installation. Show the warning `No prebuilt CDD binary exists for <platform>-<arch>. Install it with "go install github.com/jonasalessi/cdd-lint@latest", then run "CDD: Select Binary".`
- If a valid managed binary exists, `cdd.installBinary` shows the information message `CDD v0.1.0 is already installed.` and stops.
- **Approval.** An installation starts only after one of these two actions:
  - The user selects `Install` in the install prompt (section 3.11). The prompt names the version and the host.
  - The user runs `cdd.installBinary` and selects `Install` in a modal dialog: `Download and install CDD v0.1.0 from github.com?`
- **Steps**, in this order:
  1. Create the staging directory `<globalStorageUri>/staging-<random>`.
  2. Download the asset to the staging directory. Use the Node `https` module so that the VS Code proxy settings apply. Follow a maximum of 5 redirects. Accept only `https` URLs on `github.com` and on hosts that end with `.githubusercontent.com`. Use a 60 second limit. Show a cancellable progress notification.
  3. Compute the SHA-256 of the file. If it is not equal to the constant, stop.
  4. Extract only the entry `./cdd` or `cdd` (`cdd.exe` on Windows) to the staging directory. Accept the entry only if it is a regular file. Write it to a path that the extension selects. Never use an entry name as an output path. Use the `tar` package for `.tar.gz` and the `yauzl` package for `.zip`. Set mode `0755`.
  5. Validate the staged binary with the rules of section 3.5.
  6. Create `<globalStorageUri>/bin/v0.1.0/`. Delete an invalid file at the target path. Rename the staged binary to the target path. This step activates the installation.
- Always delete the staging directory at the end, also after a failure or a cancellation. Ignore deletion errors.
- A failure or cancellation before step 6 changes nothing in `<globalStorageUri>/bin/`.
- After step 6, delete the other directories in `<globalStorageUri>/bin/`. Ignore deletion errors. Then clear the resolver cache (trigger 6) and show the information message `CDD v0.1.0 is installed.`
- On a failure, show an error message with the reason and the actions `Retry` and `Select Binary`. `Retry` starts the steps again with no dialog. `Select Binary` runs `cdd.selectBinary`. A cancellation shows no message.
- The installer never changes `PATH` and never needs administrator rights.
- There are no automatic update checks. A later extension version can pin a later CLI release.

### 3.9 Analysis state

The analysis store keeps a maximum of one record for each document URI:

```ts
type DocumentRecord = {
  state:
    | "measured"
    | "not-applicable"
    | "warning"
    | "error"
    | "no-config"
    | "no-binary"
    | "invalid-binary"
    | "output-file-configured";
  detail?: string;         // the first warning, for state "warning"
  units: CddUnit[];        // empty unless the state is "measured"; lines adjusted to the buffer
  blocked: boolean;        // false unless the state is "measured"
  isStale: boolean;        // true while the buffer differs from the analyzed content
};
```

- The pipeline (section 3.4) replaces the record of the document. Outcomes map to states: `measured` to `measured`, `not-applicable` to `not-applicable`, `not-measured` with warnings to `warning`, `not-measured` with `partial`, `failed` and `config-error` to `error`.
- "The document has no record" is the condition of trigger 2. A record with any state prevents trigger 2.
- **Edits.** On each `onDidChangeTextDocument` event with content changes, for a document that has a record: set `isStale` to `true`, and adjust the line of each unit with one pure function. Process the content changes of the event one at a time, sorted by `range.start` in descending order. For a change with `start`, `end` and `text`, and a unit on 0-based line `u`, let `d = lineBreaks(text) - (end.line - start.line)`:
  1. If `end.line < u`, or `end.line == u` and `end.character == 0`: `u = u + d`.
  2. Else, if `start.line > u`, or `start.line == u` and `start.character > 0`: no change.
  3. Else, if `start.line == end.line` and `text` has no line break: no change.
  4. Else: remove the unit.
- A new record from the pipeline has `isStale: false`.
- Delete the record on `onDidCloseTextDocument`, and for each URI of `onDidDeleteFiles` and each old URI of `onDidRenameFiles`.
- Triggers 5 and 6 delete all records.
- The store emits one change event, with the URI, for each mutation. The Inlay Hints provider, the diagnostics publisher and the status item subscribe to this event.

### 3.10 Presentation

**Inlay Hints**

- Register the provider with one document selector for each supported extension: `{ scheme: "file", pattern: "**/*.<ext>" }`.
- One hint for each unit in the record of the document. Skip a unit when `unit.line - 1` is not a line of the document.
- Position: the end of line `unit.line - 1`. Set `paddingLeft: true`. Do not use `unit.col`.
- Label: `ICP: <total> / <limit>`. Format `total` with JavaScript `String(total)`. Do not round.
- Tooltip (`MarkdownString`), one item on each line:
  - `<kind> <name>`
  - `ICP <total> of limit <limit>`
  - `Over the limit by <excess>`, only when `exceeds` is true. `<excess>` is `Number((total - limit).toFixed(2))`.
  - `<metric>: <count> (<score>)` for each metric with a `count` greater than 0.
  - `Unsaved changes: the score is from the last saved version.`, only when `isStale` is true.
- The provider reads the store only. It never starts a process.
- Fire `onDidChangeInlayHints` on each store change event and when `cdd.showInlayHints` changes.
- Return no hints when `cdd.showInlayHints` is false.
- Known limits, to state in the README: VS Code hides all Inlay Hints when `editor.inlayHints.enabled` is `off`, and a hint cannot have a color.

**Diagnostics**

- One `DiagnosticCollection` named `cdd`.
- One diagnostic for each unit with `exceeds: true`. Skip a unit when `unit.line - 1` is not a line of the document.
- Range: line `unit.line - 1`, from the first non-whitespace character to the end of the line.
- Severity: `Error` when the record has `blocked: true`. `Warning` in all other cases.
- Message: `<kind> <name> has ICP <total>, limit <limit> (over by <excess>).` `<excess>` has the same format as in the tooltip.
- `source`: `CDD`. `code`: `icp-limit`.
- On each store change event for a document, replace all diagnostics of that document. A deleted record clears them.
- Publish no diagnostics when `cdd.showDiagnostics` is false. A change of the setting publishes or clears immediately.

### 3.11 Status and notifications

**Status.** One `LanguageStatusItem` with the same selectors as the Inlay Hints. VS Code shows it only when the active editor matches a selector. It shows the first row that applies to the active document:

| # | Condition | Text | Severity |
|---|---|---|---|
| 1 | The document is not supported | `CDD: file not supported` | Information |
| 2 | A pipeline is active for the document | `CDD: analyzing`, with `busy: true` | Information |
| 3 | No record, and the document is dirty | `CDD: save the file to analyze` | Information |
| 4 | No record, all other cases | `CDD: not analyzed` | Information |
| 5 | State `measured` with units | `CDD: max ICP <highest total> / <limit of that unit>` | Information |
| 6 | State `measured` with zero units | `CDD: no code units` | Information |
| 7 | State `not-applicable` | `CDD: file not in the CDD configuration` | Information |
| 8 | State `no-config` | `CDD: no cdd.config.yaml` | Information |
| 9 | State `no-binary` | `CDD: binary not found`, with the command `cdd.installBinary` | Warning |
| 10 | State `invalid-binary` | `CDD: configured binary not valid`, with the command `cdd.selectBinary` | Warning |
| 11 | State `output-file-configured` | `CDD: reporter.outputFile is not supported in the editor` | Warning |
| 12 | State `warning` | `CDD: <detail>` | Warning |
| 13 | State `error` | `CDD: analysis failed`, with the command `cdd.showOutput` | Error |

Update the item on each store change event, when a pipeline starts or ends, and when the active editor changes.

**Notifications.** The extension shows only these notifications, and those of sections 3.3 and 3.8:

| Condition | API | Message and actions | Frequency |
|---|---|---|---|
| The pipeline sets `no-binary`, and the platform has an asset | `showWarningMessage` | `CDD binary not found. Install CDD v0.1.0 from github.com?` Actions: `Install`, `Select Binary`, `Not Now`, `Don't Ask Again` | One time for each window session. Never when `globalState` key `cdd.suppressInstallPrompt` is true. |
| The pipeline sets `no-binary`, and the platform has no asset | `showWarningMessage` | The message of section 3.8 | One time for each window session. |
| The pipeline sets `invalid-binary` | `showErrorMessage` | `The configured CDD binary is not valid: <failure class>.` Actions: `Select Binary`, `Open Settings` | One time for each value of the setting. |
| The run outcome is `config-error`, or the configuration is `unparsable` | `showErrorMessage` | `The CDD configuration <relative path> is not valid.` Action: `Show Output` | One time for each configuration file. Trigger 5 for that file resets it. |
| The pipeline sets `output-file-configured` | `showWarningMessage` | `CDD cannot analyze files in the editor while reporter.outputFile is set in <relative path>.` | One time for each configuration file. Trigger 5 for that file resets it. |

In these messages, `<relative path>` is the path of the configuration file relative to the workspace folder of the document. `Open Settings` runs `workbench.action.openSettings` with the argument `cdd.binaryPath`. `Show Output` runs `cdd.showOutput`. `Select Binary` runs `cdd.selectBinary`.

Install prompt actions:

- `Install` starts the installation steps of section 3.8 with no second dialog.
- `Select Binary` runs `cdd.selectBinary`.
- `Not Now`, or closing the notification, does nothing.
- `Don't Ask Again` sets `cdd.suppressInstallPrompt` to true.

The states `no-config` and `not-applicable`, and the outcomes `failed` and `not-measured`, never show a notification.

### 3.12 Logging

- One Output Channel named `CDD`, created with `{ log: true }`.
- Log each run that was not aborted with the binary path, the working directory, the argument list, the duration, the exit code and the outcome of section 3.7.
- Log stderr for the outcomes `failed` and `config-error`.

### 3.13 Out of scope for the MVP

- `--explain` and hints for each counted construct.
- Automatic update checks and installation of a release that is not pinned.
- Publication to Open VSX.
- A setting for the timeout, the hint format, or a minimum score.
- Analysis of dirty buffers.
- Static musl binaries and platforms that are not in section 2.5.
- Extension-host tests on Windows (section 4.1).

## 4. Architecture

### 4.1 Tooling

| Topic | Decision |
|---|---|
| Runtime and package manager | Node.js 20 or later, npm. CI uses Node.js 20. |
| Bundler | esbuild: one CommonJS file `dist/extension.js`, `external: ["vscode"]` |
| Runtime dependencies | `yaml`, `tar`, `yauzl`. esbuild bundles them. |
| Lint and format | ESLint with `typescript-eslint`, Prettier |
| Unit tests | Vitest. Files `src/**/*.test.ts`, next to the code. They never import `vscode`. |
| Contract tests | Vitest. Files in `contract/`. They run the real binary from the environment variable `CDD_BIN`. |
| Extension-host tests | `@vscode/test-cli` with `@vscode/test-electron`. Files in `e2e/`, compiled with `tsc -p e2e` to `out/e2e`. They run on macOS and Linux only, because Node.js cannot start the fake binary script on Windows without a shell. |
| Packaging | `vsce package --no-dependencies` |

npm scripts:

| Script | Action |
|---|---|
| `build` | `tsc --noEmit` and the esbuild bundle |
| `lint` | ESLint and `prettier --check` |
| `test` | Unit tests |
| `test:contract` | Contract tests. Fails if `CDD_BIN` is not set. |
| `test:e2e` | `build`, `tsc -p e2e`, then the extension-host tests |
| `package` | Creates the VSIX, then runs `scripts/check-vsix.mjs` |
| `verify` | `lint`, `build`, `test`, `test:contract`, `test:e2e`, `package`, in this order |
| `verify:windows` | `lint`, `build`, `test`, `test:contract`, `package`, in this order |

On the development machine, `cdd` is on `PATH`. Use `CDD_BIN="$(command -v cdd)"`.

**Extension-host test rules**

- `e2e/fake-cdd/cdd` is an executable Node.js script with a `#!/usr/bin/env node` line. For `version` it prints `cdd v0.1.0 (fake)`. For `check` it reads the JSON file named by the environment variable `FAKE_CDD_RESPONSE`, with the form `{ stdout, stderr, exitCode, delayMs }`, waits `delayMs`, writes the two streams, and exits with `exitCode`. It appends its argument list as one line to the file named by `FAKE_CDD_LOG`.
- "A run" in an extension-host test is a log line that starts with `check`. The tests ignore `version` lines.
- A test that changes a file of the test workspace restores it at its end.
- A test closes a document with the command `workbench.action.closeActiveEditor`.
- The tests run in the extension host process. They set `process.env.FAKE_CDD_RESPONSE` and `process.env.FAKE_CDD_LOG`, and the fake binary inherits them.
- The tests write `cdd.binaryPath` with `ConfigurationTarget.Global`, because a `machine` setting is ignored in workspace settings.
- The test workspace is `e2e/workspace/`. It has no `cdd.config.yaml` at its root. `e2e/workspace/with-config/` has one. `e2e/workspace/no-config/` has none.
- A test waits for the result of an action by polling the call log or the store-driven output (hints, diagnostics) with a 5 second limit.

### 4.2 Folder structure

The structure is feature-based. Each file has one responsibility.

```text
cdd-lint-vs-code/
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── .gitignore                      # exists; must list node_modules/, dist/, out/, .vscode-test/, *.vsix
├── .vscodeignore
├── .vscode-test.mjs
├── esbuild.mjs
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── scripts/
│   ├── fetch-cdd.mjs               # CI only: downloads the pinned binary, verifies its SHA-256
│   └── check-vsix.mjs              # fails if the VSIX has a file that is not allowed
├── src/
│   ├── extension.ts                # composition root: creates and connects the modules
│   ├── logging/
│   │   └── logger.ts
│   ├── binary/
│   │   ├── pinnedRelease.ts        # version, asset names, SHA-256 constants
│   │   ├── managedBinaryPath.ts
│   │   ├── findOnPath.ts
│   │   ├── parseCddVersion.ts
│   │   ├── validateBinary.ts
│   │   ├── BinaryResolver.ts
│   │   └── selectBinaryCommand.ts
│   ├── install/
│   │   ├── selectAsset.ts          # platform and architecture to asset
│   │   ├── downloadAsset.ts
│   │   ├── verifyChecksum.ts
│   │   ├── extractBinary.ts
│   │   ├── installManagedBinary.ts # steps 1 to 6 of section 3.8, with cleanup
│   │   └── installBinaryCommand.ts
│   ├── config/
│   │   ├── findConfig.ts
│   │   ├── readOutputFile.ts
│   │   ├── ConfigResolver.ts       # resolution with the cache
│   │   └── configWatcher.ts        # FileSystemWatcher for trigger 5
│   ├── analysis/
│   │   ├── report.ts               # types of section 2.3
│   │   ├── parseReport.ts          # JSON validation
│   │   ├── isSupportedDocument.ts
│   │   ├── runCddCheck.ts          # process start, time limit, abort
│   │   ├── classifyRun.ts          # rules of section 3.7
│   │   ├── analyzeDocument.ts      # pipeline of section 3.4
│   │   ├── shiftUnits.ts           # edit rules of section 3.9
│   │   ├── AnalysisStore.ts
│   │   ├── requestQueue.ts         # scheduling rules of section 3.4
│   │   ├── AnalysisScheduler.ts    # maps VS Code events to requests and to store updates
│   │   └── analyzeCurrentFileCommand.ts
│   ├── inlay-hints/
│   │   ├── buildHints.ts
│   │   └── CddInlayHintsProvider.ts
│   ├── diagnostics/
│   │   ├── buildDiagnostics.ts
│   │   └── CddDiagnostics.ts
│   └── status/
│       ├── statusText.ts           # status table of section 3.11
│       ├── CddStatusItem.ts
│       ├── notifyOnce.ts
│       └── installPrompt.ts
├── contract/
│   ├── fixtures/                   # small projects, one for each row of section 2.2
│   └── *.contract.test.ts
└── e2e/
    ├── tsconfig.json
    ├── fake-cdd/cdd
    ├── workspace/
    └── *.test.ts
```

### 4.3 Code rules

- A function has one responsibility. Prefer functions shorter than 10 lines.
- A function has a maximum of 4 parameters. Group related parameters into one object.
- Do not create an interface that has one implementation. Use `type` for data.
- Only these **adapter files** import `vscode`: `extension.ts`, `logging/logger.ts`, `binary/selectBinaryCommand.ts`, `install/installBinaryCommand.ts`, `config/configWatcher.ts`, `analysis/AnalysisScheduler.ts`, `analysis/analyzeCurrentFileCommand.ts`, `inlay-hints/CddInlayHintsProvider.ts`, `diagnostics/CddDiagnostics.ts`, `status/CddStatusItem.ts`.
- All other files are **pure files**. They receive what they need as plain values or as functions: the process function (`execFile`), the network function (`https.get`), the setting values, the storage directory, the `globalState` read and write functions, the message functions, and an `AbortSignal`. Unit tests replace these functions.
- Pure files return plain data. For example, `buildHints` returns `{ line, label, tooltipLines }`, and the provider converts it to `InlayHint` objects.
- Adapter files contain no decision logic. The extension-host tests that section 5 names cover them. No other adapter test is necessary.
- Write a comment only when the code cannot express the reason.
- Prefer positive conditions.

## 5. Development phases

Implement the phases in this order. Each phase ends when its verification passes. Each phase adds its own settings, commands and subscriptions to `package.json` and `extension.ts`. From Phase 2, each verification includes `npm run verify`.

### Phase 1: Scaffold and CI

**Tasks**

1. Create `package.json` with the manifest of section 3.1 and the scripts of section 4.1.
2. Configure TypeScript strict mode, ESLint, Prettier, Vitest, `@vscode/test-cli` and esbuild.
3. Create `logging/logger.ts` and the command `cdd.showOutput`.
4. Create `extension.ts` with `activate` and `deactivate`. Add each disposable to `context.subscriptions`.
5. Create `README.md` and `CHANGELOG.md` with a title only. Phase 10 writes their content.
6. Make sure that `.gitignore` lists `node_modules/`, `dist/`, `out/`, `.vscode-test/` and `*.vsix`. Create `.vscodeignore` and `scripts/check-vsix.mjs`. In the `extension/` folder of the VSIX, the only allowed files are `dist/extension.js`, `package.json`, `readme.md`, `changelog.md` and `LICENSE.txt` (compare the names with no case sensitivity). The script ignores the files that `vsce` adds at the VSIX root.
7. Create `scripts/fetch-cdd.mjs`. It downloads the asset of section 2.5 for the current platform, verifies the SHA-256, extracts the binary, and prints its path.
8. Create `.github/workflows/ci.yml` with a matrix of `ubuntu-latest`, `macos-latest` and `windows-latest`. Steps: `npm ci`, `fetch-cdd` (sets `CDD_BIN`), and then `xvfb-run -a npm run verify` on Linux, `npm run verify` on macOS, `npm run verify:windows` on Windows. Set `CDD_NETWORK_TESTS=1`.

**Verification**

- `npm run lint && npm run build && npm run test && npm run test:e2e && npm run package` exits `0`.
- A unit test reads `package.json` and asserts `untrustedWorkspaces.supported: false`, `virtualWorkspaces: false` and `extensionKind: ["workspace"]`.
- An extension-host test asserts that the extension activates and that `cdd.showOutput` is registered.

### Phase 2: Report contract

**Tasks**

1. Create the fixture projects in `contract/fixtures/`, one for each row of section 2.2.
2. Create `analysis/report.ts` and `analysis/parseReport.ts`.
3. Create `analysis/classifyRun.ts` with the rules of section 3.7. Its parameters are the runner result and the relative path.
4. Create a contract test that runs the real binary for each fixture and asserts the outcome of `classifyRun`. Each contract test copies its fixture to a temporary directory and runs the binary there. The `outputFile` fixture is the exception: the test asserts only that stdout is not a valid report.

**Verification**

- Unit tests cover each rule of section 3.7, a report with a missing field, a report with a field of the wrong type, non-JSON stdout, and a decimal `total` (16.5 stays 16.5).
- `npm run test:contract` exits `0` for all rows of section 2.2. The timeout row uses `timeout: 1ns` in its configuration.
- A contract test asserts that the first line of `CDD_BIN version` matches the expression of section 2.4.

### Phase 3: Binary discovery

**Tasks**

1. Create `pinnedRelease.ts` with the constants of section 2.5, and `managedBinaryPath.ts`.
2. Create `findOnPath.ts`. Its parameter is `{ name, pathValue, platform }`.
3. Create `parseCddVersion.ts`, `validateBinary.ts` and `BinaryResolver.ts` with the rules of section 3.5.
4. Add the setting `cdd.binaryPath` and the command `cdd.selectBinary`.
5. Clear the resolver cache when `cdd.binaryPath` changes.

**Verification**

Unit tests with a replaced `execFile` and temporary directories assert:

- The order of the four candidates.
- An invalid `cdd.binaryPath` stops the search. A relative value gives `not-absolute`.
- An invalid `cdd` on `PATH` continues to `cdd-lint`.
- Each failure class of section 3.5.
- Each version example of section 2.4, and `v0.0.9` as unsupported.
- Two resolutions with no change start the process one time. A failed resolution is not cached.
- With `platform: "win32"`, `findOnPath` finds `cdd.exe`, does not find `cdd.cmd`, and does not search a directory that is not in `pathValue`.
- `package.json` declares `cdd.binaryPath` with scope `machine`.

### Phase 4: Configuration and runner

**Tasks**

1. Create `config/findConfig.ts`, `config/readOutputFile.ts` and `config/ConfigResolver.ts` with the rules of section 3.6.
2. Create `analysis/isSupportedDocument.ts` with the rules of section 3.4. Its parameter is `{ scheme, filePath, workspaceFolderPath }`.
3. Create `analysis/runCddCheck.ts`. Its parameter is `{ binaryPath, configDir, relativePath, signal }`. It uses `execFile` with no shell, the working directory `configDir`, and the 10 second limit. It returns the runner result of section 3.7.

**Verification**

- Unit tests for `findConfig`: the nearest file wins, the search stops after the workspace folder root, no file gives `no-config`.
- Unit tests for `readOutputFile`: `null`, absent, a string value, an empty string, YAML that cannot be parsed.
- Unit tests for `isSupportedDocument`: each extension, another scheme, no workspace folder, a comma in the name.
- Unit tests for `runCddCheck` with a replaced `execFile`: the exact argument list of section 2.1, the time limit, an abort, a start error.
- A contract test runs `runCddCheck` with the real binary on a path that contains a space.

### Phase 5: Analysis state and triggers

**Tasks**

1. Create `analysis/shiftUnits.ts` and `analysis/AnalysisStore.ts` with the rules of section 3.9.
2. Create `analysis/analyzeDocument.ts` with the pipeline of section 3.4. It receives the resolvers, the runner and the notification functions as parameters. Until Phase 9, `extension.ts` passes notification functions that do nothing.
3. Create `analysis/requestQueue.ts` with the scheduling rules of section 3.4. It receives the timer functions, the pipeline function, and a `getDocumentState(uri)` function that returns `{ isOpen, isSupported, isClean, version }`.
4. Create `config/configWatcher.ts` and `analysis/AnalysisScheduler.ts`. The scheduler maps the triggers of section 3.4 to requests. It also passes the content changes of `onDidChangeTextDocument` to the store, and deletes records on the events of section 3.9.
5. Add the command `cdd.analyzeCurrentFile`.
6. Create `e2e/fake-cdd/cdd` and the test workspace of section 4.1.

**Verification**

- Unit tests for `shiftUnits`:
  - A line added above a unit.
  - A line removed above a unit (the range ends at column 0 of the unit line).
  - A line break added at column 0 of the unit line.
  - A line break added at the end of the unit line.
  - Text typed in the unit line.
  - The unit line removed.
  - An edit below the unit.
  - One event with two changes, one above and one below the unit.
- Unit tests for the store: each outcome maps to its state, `units` is empty unless the state is `measured`, one change event for each mutation.
- Unit tests for `requestQueue` with fake timers:
  - Two requests in 50 ms give one pipeline start.
  - A request for a document that is dirty when the 50 ms end gives no start.
  - A new start aborts the active pipeline.
  - A result with a changed document version is discarded.
  - A close cancels the pending request and aborts the active pipeline.
- Unit tests for `analyzeDocument`: each pipeline step that sets a record, and the run is not started for `no-config`, `output-file-configured`, `unparsable` and no binary.
- Extension-host tests with the fake binary assert the call log:
  - Opening a clean supported document starts one run.
  - Typing starts no run.
  - Saving starts one run.
  - Undo to the saved state starts one run.
  - A document in `no-config/` starts no run.
  - An unsupported document starts no run.
  - Two saves with a response delay of 500 ms: the result of the second run is applied.
  - A change of `with-config/cdd.config.yaml` starts a minimum of one new run for the visible document.
  - A change of `cdd.binaryPath` starts one run for the visible document.

### Phase 6: Inlay Hints

**Tasks**

1. Create `inlay-hints/buildHints.ts` and `inlay-hints/CddInlayHintsProvider.ts` with the rules of section 3.10.
2. Add the setting `cdd.showInlayHints`.

**Verification**

- Unit tests for `buildHints`: the label format, a decimal total, each tooltip line, an excess of `0.3` for total `10.3` and limit `10`, zero units, a unit line that is not in the document.
- Extension-host tests use `vscode.executeInlayHintProvider` and assert:
  - The labels and lines are equal to the response of the fake binary.
  - After a line is added above a unit, the hint is one line lower.
  - After a save with a new response, the labels change.
  - With `cdd.showInlayHints` false, the provider returns no hints.
  - The call log shows no new run after a hint request.

### Phase 7: Diagnostics

**Tasks**

1. Create `diagnostics/buildDiagnostics.ts` and `diagnostics/CddDiagnostics.ts` with the rules of section 3.10.
2. Add the setting `cdd.showDiagnostics`.

**Verification**

- Unit tests for `buildDiagnostics`: only units with `exceeds: true`, the message text, severity `Error` with `blocked: true`, severity `Warning` with `blocked: false`.
- Extension-host tests use `vscode.languages.getDiagnostics` and assert:
  - A violating unit gives one diagnostic with source `CDD`, on the line of its hint.
  - A save with a passing response removes the diagnostic.
  - A `not-applicable` response removes the diagnostic.
  - With `cdd.showDiagnostics` false, the document has no `CDD` diagnostics.
  - Closing the document removes its diagnostics.

### Phase 8: Managed binary installation

**Tasks**

1. Create the files of `src/install/` with the rules of section 3.8.
2. Add the command `cdd.installBinary`.

**Verification**

Unit tests with a replaced `https.get` and a temporary storage directory assert:

- Each row of section 2.5 maps to its asset, and `win32`/`arm64` maps to no asset.
- A wrong checksum stops the installation, and `bin/` does not change.
- A redirect to a host that is not allowed is rejected. A redirect to `http` is rejected.
- An archive with an entry `../cdd`, and an archive where `cdd` is a symlink, install nothing.
- A validation failure in step 5 leaves an existing managed binary in place.
- A cancellation removes the staging directory.
- A successful installation creates `bin/v0.1.0/cdd`, removes the other directories of `bin/`, and removes the staging directory.
- An installation with a valid managed binary present does not start a download.

One contract test installs the real pinned release for the current platform into a temporary directory and validates it. It runs only when the environment variable `CDD_NETWORK_TESTS` is `1`.

### Phase 9: Status and notifications

**Tasks**

1. Create `status/statusText.ts` and `status/CddStatusItem.ts` with the status table of section 3.11.
2. Create `status/notifyOnce.ts` and `status/installPrompt.ts` with the notification table of section 3.11.
3. Pass the real notification functions to `analyzeDocument`.

**Verification**

- Unit tests for `statusText`: one test for each row of the status table.
- Unit tests for `notifyOnce`: the second call with the same key shows nothing, and a reset of the key shows the notification again.
- Unit tests for `installPrompt` with replaced message and storage functions:
  - Two `no-binary` results show one prompt.
  - `Install` starts the installation function. No other action starts it.
  - `Select Binary` starts the select function.
  - `Don't Ask Again` writes `cdd.suppressInstallPrompt`, and a new session shows no prompt.
  - A platform with no asset shows the message of section 3.8 and no `Install` action.
- Unit tests for `analyzeDocument`: `config-error` and `unparsable` call the configuration notification, and `no-config`, `not-applicable`, `failed` and `not-measured` call no notification.
- An extension-host test replaces `window.showWarningMessage` and `window.showErrorMessage`, opens and saves a document in `no-config/`, and asserts that no message function was called.

### Phase 10: Documentation and release

**Tasks**

1. Write `README.md`: purpose, supported files, when analysis starts, the settings, the commands, binary discovery, the consent rule for installation, the `cdd init` requirement, and the known limits of sections 2.5, 3.5, 3.6 and 3.10.
2. Write `CHANGELOG.md` with the first version.
3. Create `.github/workflows/release.yml`, started by a tag `v*`:
   - Fail if the tag is not equal to `v` plus the `version` of `package.json`.
   - Run `npm ci`, `fetch-cdd` and `xvfb-run -a npm run verify` on `ubuntu-latest`.
   - Upload `cdd-lint-vscode-<version>.vsix` to the GitHub Release of the tag.
   - A separate job `publish-marketplace` runs after the upload. Its first step reads the secret `VSCE_PAT` into an environment variable and sets a step output that says if the value is not empty. The step `vsce publish --packagePath <vsix>` runs only when that output is true. A failure of this job does not remove the uploaded VSIX.
4. Do not add a screenshot. The owner adds it (section 7).

**Verification**

- `npm run verify` exits `0`.
- A unit test asserts that the README names each setting and each command of `package.json`.
- The two workflow files are valid YAML (a unit test parses them with the `yaml` package). Their first real run is an item of section 7.

## 6. Definition of Done (agent)

The agent's work is complete when all of these are true:

1. `npm run verify` exits `0` on the development machine, with `CDD_BIN` set to the real binary.
2. `CDD_NETWORK_TESTS=1 npm run test:contract` exits `0`. If the machine has no network access, the final report states that this item was not verified.
3. All verification items of Phases 1 to 10 are implemented as automated tests and pass.
4. The VSIX exists and passes `scripts/check-vsix.mjs`.
5. The final report lists each phase, the commands that were run, and their results. It states each item that was not verified and the reason. It does not claim a result that was not observed.

The CI run on GitHub and the items of section 7 are not part of the agent's Definition of Done, because the agent cannot observe them.

## 7. Manual release checklist (owner)

1. Confirm or change the `publisher` and `repository` values in `package.json`.
2. Push the branch and confirm that the CI workflow passes on the three operating systems.
3. Install the VSIX: `code --install-extension cdd-lint-vscode-<version>.vsix`.
4. Open a trusted project that has a `cdd.config.yaml` and a supported file. ICP hints appear with no save.
5. Make a unit exceed its limit and save. The Problems panel shows the violation.
6. Correct the unit and save. The diagnostic disappears.
7. Remove `cdd` from `PATH`, restart VS Code, and open the file. The install prompt appears. Select `Install`. Hints appear.
8. Restart VS Code. Hints appear, and no prompt and no download occur.
9. Open the project in an untrusted window. The extension is disabled.
10. Add a screenshot of the Inlay Hints to the README.
11. Create the Marketplace publisher and the `VSCE_PAT` secret, then push a version tag and confirm that the release workflow passes.

## 8. Instructions for the coding agent

- Read this plan fully before you write code.
- Implement the phases of section 5 in order. Do not start a phase before the verification of the earlier phase passes.
- Sections 2 and 3 are final. Do not replace a decision with a different design. If a fact of section 2 is wrong when you observe the real binary, stop and report the difference.
- Write the tests of a module together with the module.
- Correct each failure of a verification before you continue.
- Do not add features, settings, commands or dependencies that this plan does not name. Development dependencies that section 4.1 needs are allowed.
- Do not change the cdd-lint repository.
- Do not create accounts, publisher identities or credentials. Do not push tags.
- Do not claim that a feature or a test works unless you observed the result.

## Sources

- https://github.com/jonasalessi/cdd-lint
- https://github.com/jonasalessi/cdd-lint/blob/main/docs/editor-integration.md
- https://github.com/jonasalessi/cdd-lint/releases/tag/v0.1.0
