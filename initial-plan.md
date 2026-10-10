# CDD VS Code Extension: Software Development Plan

This plan is intended for an AI coding agent to implement the extension from start to finish.

It excludes human-operated activities such as creating Microsoft accounts, registering a Marketplace publisher, manually approving releases, and managing credentials.

**Objective\:** Deliver a production-ready VS Code extension that integrates with [cdd-lint](https://github.com/jonasalessi/cdd-lint), automatically discovers or installs the CDD binary with user consent, analyzes saved source files, displays ICP scores through Inlay Hints, and reports complexity violations through VS Code diagnostics.

## 1\. Development principles

The implementation must follow these rules\:

- Use TypeScript and the official VS Code Extension API.
- Treat the CDD CLI and its JSON output as the authoritative source for all metrics.
- Reuse the existing CDD CLI without changing its source code unless a confirmed incompatibility makes a change necessary.
- Keep the architecture simple. Do not introduce a language server, backend service, daemon, or external framework unnecessarily.
- Run complexity analysis only when a supported file is saved.
- Never analyze the entire project as a substitute for file-level analysis.
- Never install or update executable binaries without explicit user approval.
- Never modify source files when displaying metrics.
- Validate all external inputs, downloaded artifacts, CLI output, and executable paths.
- Create automated tests for expected behavior, edge cases, and failure scenarios.
- Complete each development phase with working, tested functionality before moving to the next.

## 2\. Target architecture

```text
cdd-vscode/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .vscodeignore
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── src/
│   ├── extension.ts
│   ├── binary/
│   │   ├── CddBinaryResolver.ts
│   │   ├── CddBinaryInstaller.ts
│   │   └── CddReleaseClient.ts
│   ├── analysis/
│   │   ├── CddConfigResolver.ts
│   │   ├── CddRunner.ts
│   │   ├── CddReport.ts
│   │   └── CddAnalysisService.ts
│   ├── providers/
│   │   ├── CddInlayHints.ts
│   │   └── CddDiagnostics.ts
│   └── utils/
│       └── CddLogger.ts
└── test/
    ├── binary/
    ├── analysis/
    ├── providers/
    └── integration/
```



The module boundaries describe responsibilities, not a requirement to create unnecessary abstraction layers.

## 3\. Development phases

### Phase 1: Project initialization

**Tasks**

1. Initialize a VS Code extension project using TypeScript.
2. Configure TypeScript strict mode, ESLint, formatting, and automated tests.
3. Define the minimum supported VS Code version based on APIs actually used.
4. Configure extension activation and file-save event subscriptions.
5. Register extension settings and commands.
6. Set up structured logging through a VS Code Output Channel.
7. Add build, test, lint, and VSIX packaging scripts.

**Acceptance criteria**

- The project compiles without TypeScript errors.
- The extension activates correctly in an Extension Development Host.
- Save events are received for supported languages.
- Opening or editing files does not trigger CDD analysis.
- The package can be built into a VSIX.

### Phase 2: CDD binary discovery

**Tasks**

1. Implement `CddBinaryResolver`\.
2. Read `cdd.binaryPath` from global User Settings.
3. If configured, validate that executable using its `version` command.
4. Otherwise attempt `cdd version`\.
5. If unsuccessful, attempt `cdd-lint version`\.
6. If neither succeeds, check for a previously installed extension-managed binary.
7. Cache successful binary resolution.
8. Invalidate the cache when configuration changes.
9. Distinguish missing executables, permission errors, timeouts, and unsupported versions.
10. Implement a command to select an existing executable and save its path globally.

Use Node.js `execFile` rather than launching a shell or manually searching `PATH`\.

**Acceptance criteria**

- Existing CDD installations work without user configuration.
- The fallback executable name works.
- Explicitly configured paths take priority.
- Invalid paths produce useful errors.
- The resolver does not repeatedly execute version checks on every save.

### Phase 3: Automatic binary installation

**Tasks**

1. Implement `CddReleaseClient` to access releases from `jonasalessi/cdd-lint`\.
2. Query the latest stable release, excluding draft and prerelease versions.
3. Detect operating system and architecture.
4. Match the platform to an available release artifact.
5. Locate the corresponding SHA-256 checksum.
6. Implement an installation confirmation notification.
7. Download artifacts only after explicit approval.
8. Store downloads in a temporary directory.
9. Validate the archive checksum before extraction.
10. Safely extract the expected executable.
11. Install the binary inside VS Code's `globalStorageUri`\.
12. Validate the installed binary using `version`\.
13. Activate the installation only after successful validation.
14. Implement rollback and temporary-file cleanup on failure.
15. Add `CDD: Install Binary` and `CDD: Update Binary` commands.
16. Avoid automatic background update checks in the MVP.

The CDD repository documents prebuilt archives and checksum files. The agent must inspect the actual release assets and derive the supported platform matrix from them instead of guessing filenames. 

**Acceptance criteria**

- The extension never installs software without user approval.
- No Go compiler or administrative permissions are needed for supported prebuilt binaries.
- Corrupt or mismatched downloads are rejected.
- Failed installations do not damage an existing working installation.
- Selecting *Not Now* does not result in repeated prompts during the session.
- The installer never changes the system `PATH`\.

### Phase 4: Configuration and CLI integration

**Tasks**

1. Implement `CddConfigResolver`\.
2. Find the nearest applicable `cdd.config.yaml`, searching upward from the saved file to the workspace root.
3. Use the configuration directory as the CDD process's working directory.
4. If no configuration exists, show guidance for `cdd init`\.
5. Implement `CddRunner` using `execFile`\.
6. Run `cdd check` against the saved file only.
7. Use `--all --format json`\.
8. Parse standard output independently of process exit status.
9. Handle blocking violations, configuration errors, and timeout exit codes.
10. Add cancellation and execution timeout protection.
11. Prevent outdated executions from overwriting newer results.
12. Handle multiple workspace folders independently.

CDD supports file-specific analysis, `--all`, and structured JSON output. Named files must belong to the configuration's directory and satisfy its language and include/exclude rules. 

**Acceptance criteria**

- Saving a supported file analyzes only that file.
- A file outside the applicable configuration scope is not analyzed.
- Valid reports are processed even when complexity violations produce a nonzero exit status.
- CLI errors are reported without crashing the extension.
- Concurrent saves do not display outdated results.

### Phase 5: JSON parsing and analysis state

**Tasks**

1. Define TypeScript interfaces matching the CDD JSON contract.
2. Validate external JSON before using its fields.
3. Map file paths and 1-based line/column positions to VS Code document locations.
4. Extract each code unit's ICP total, limit, declaration location, and violation status.
5. Preserve decimal ICP values without unnecessary rounding.
6. Recognize partial reports and analyzer warnings.
7. Store successful results in a file-specific in-memory cache.
8. Track the document version associated with each analysis.
9. Invalidate results when a document changes, is deleted, or leaves the workspace.
10. Ensure invalid or incomplete reports do not produce false passing results.

Refer to the [CDD editor integration contract](https://github.com/jonasalessi/cdd-lint/blob/main/docs/editor-integration.md), including its `filter`, `partial`, and `warnings` fields. :chatgpt-content-reference{index="6"}

**Acceptance criteria**

- ICP values match the CLI output exactly.
- Every result maps to the correct document and code unit.
- Missing optional fields do not crash the extension.
- Stale and partial results are handled explicitly.
- The extension never calculates ICP itself.

### Phase 6: VS Code Inlay Hints

**Tasks**

1. Implement `CddInlayHints` using `InlayHintsProvider`\.
2. Display the total ICP for each code unit.
3. Position each hint at the end of its declaration line.
4. Use the format `ICP: <total> / <limit>`\.
5. Display scores for units below, equal to, and above their limits.
6. Add tooltips containing unit name, ICP total, limit, and excess where relevant.
7. Notify VS Code when analysis results change.
8. Read results from the cache without executing the CLI inside the provider.
9. Respect `cdd.showInlayHints`\.
10. Remove or suppress stale hints when the document changes without being saved.

**Acceptance criteria**

- Every reported code unit receives the correct ICP hint.
- Hints appear on the intended declaration lines.
- Hints do not modify source files.
- Scrolling and editor refreshes never execute the binary.
- Saving a file updates its metrics.

### Phase 7: Problems panel integration

**Tasks**

1. Implement `CddDiagnostics` using `DiagnosticCollection`\.
2. Create warning diagnostics for code units exceeding their ICP limits.
3. Use the declaration position as the diagnostic range.
4. Set the diagnostic source to `CDD`\.
5. Include the actual ICP, configured limit, and excess in the message.
6. Respect CDD's reported violation status, including nonblocking enforcement modes.
7. Clear outdated diagnostics before publishing replacements.
8. Clear diagnostics when a previously violating unit passes.
9. Respect `cdd.showDiagnostics`\.
10. Dispose all resources correctly during extension deactivation.

**Acceptance criteria**

- Violations appear in the Problems panel.
- Diagnostics point to the correct source locations.
- Fixing a violation and saving removes its diagnostic.
- Files without violations have no CDD warning diagnostics.
- Diagnostics remain consistent with the Inlay Hints.

### Phase 8: Error handling and user experience

**Tasks**

1. Provide helpful notifications for missing binaries and configuration.
2. Avoid repeated notifications for the same unresolved condition.
3. Show installation progress and allow cancellation where supported.
4. Log actionable technical errors in the CDD Output Channel.
5. Handle unsupported or excluded files without noisy failures.
6. Disable binary execution and installation in untrusted workspaces.
7. Handle network failures, GitHub rate limits, invalid archives, and missing release assets.
8. Handle files saved while another analysis is running.
9. Ensure editor responsiveness during CLI execution and downloads.
10. Keep the extension functional when network access is unavailable but a valid local binary exists.

**Acceptance criteria**

- Routine failures do not interrupt editing.
- Installation failures have recovery options.
- Users can locate or configure binaries manually.
- Untrusted workspaces never execute arbitrary CDD binaries.
- Normal analysis requires no network connection.

### Phase 9: Automated testing

Implement unit tests, integration tests, and extension-host tests.

| Area | Required coverage |
|--------|--------|
| Binary resolver | Discovery priority, fallback, missing binary, invalid path |
| Binary installer | Release selection, checksum verification, rollback, cancellation |
| CLI runner | Success, violations, invalid JSON, timeout, configuration errors |
| Configuration | Nested configurations, missing configuration, multi-root workspaces |
| JSON mapping | File paths, line positions, decimal scores, partial reports |
| Inlay Hints | Correct positions, totals, refresh, disabling |
| Diagnostics | Create, update, clear, violation transitions |
| Extension lifecycle | Save-only execution, file deletion, unsaved changes, concurrent saves |
| Security | Untrusted workspace, unsafe archives, executable path validation |

Use mocks for network and process failure tests. Include real CDD CLI fixtures for contract testing.

**Acceptance criteria**

- All automated tests pass.
- All critical error paths have coverage.
- The extension is tested in a real VS Code Extension Development Host.
- CI verifies compilation, linting, tests, and packaging.

### Phase 10: Documentation and release automation

**Tasks**

1. Write a README explaining the extension, supported languages, and installation behavior.
2. Document every extension setting.
3. Explain automatic binary installation and its consent requirement.
4. Document required CDD configuration and `cdd init`\.
5. Add a screenshot or animated example of ICP Inlay Hints.
6. Create a changelog and third-party license notices.
7. Configure VSIX packaging and exclude development-only files.
8. Create a GitHub Actions CI workflow.
9. Create a release workflow triggered by version tags.
10. Build and test before producing release artifacts.
11. Publish a versioned VSIX artifact to GitHub Releases.
12. Prepare an optional Marketplace publishing job using credentials supplied through repository secrets or supported federated authentication.
13. Ensure publishing fails clearly when credentials or publisher configuration are missing, without preventing VSIX packaging.

No automated workflow should create publisher accounts, obtain credentials, or bypass required external approvals.

**Acceptance criteria**

- The VSIX installs successfully in VS Code.
- The README accurately describes the implemented behavior.
- CI produces reproducible build artifacts.
- A tagged release produces a versioned VSIX.
- Marketplace publishing is ready to use when external credentials are available.

## 4\. Definition of Done

The extension is complete when the following end-to-end scenario passes\:

1. Install the packaged VSIX in VS Code.
2. Open a trusted project containing a supported language and `cdd.config.yaml`\.
3. Save a source file.
4. If a system CDD executable exists, the extension finds and uses it.
5. If no binary exists, the extension asks permission to install one.
6. After installation, the extension runs CDD against the saved file.
7. ICP totals appear beside each reported code unit.
8. Units exceeding their limits appear in the Problems panel.
9. Modify the code and save again.
10. ICP values and diagnostics update correctly.
11. Close and reopen VS Code.
12. Verify that the extension reuses the existing validated binary without reinstalling it.

The implementation must also pass automated tests, static checks, and VSIX packaging.

## 5\. Instructions for the coding agent
<agent>
# CDD VS Code Extension Implementation Instructions

Implement the CDD VS Code extension according to the Software Development Plan.

## Working rules

- Implement the phases in order.
- Inspect the current cdd-lint repository, its editor integration documentation, JSON schema, and release assets before implementing their integrations.
- Use TypeScript strict mode and the official VS Code Extension API.
- Do not modify the CDD CLI unless a verified incompatibility prevents the integration.
- Prefer simple components and explicit interfaces over unnecessary abstractions.
- Keep all ICP calculations inside the existing CLI.
- Run analysis only when a supported source file is saved.
- Analyze only the saved file, not the whole project.
- Never install binaries without explicit user consent.
- Never run external executables in untrusted workspaces.
- Write automated tests as each component is implemented.
- Run relevant tests and static checks after every phase.
- Fix test failures before continuing.
- Avoid unrelated refactoring or features outside the MVP.

## Execution

1. Inspect the repository and determine the existing project structure.
2. Identify which planned components already exist and reuse them.
3. Implement the smallest functional vertical slice first: binary discovery, file analysis, JSON parsing, and Inlay Hints.
4. Add automatic binary installation, diagnostics, lifecycle handling, and error recovery.
5. Complete integration tests, documentation, and release packaging.
6. Validate the full user workflow with a packaged VSIX.
7. Report what was implemented, what was tested, and any remaining limitations.

Do not perform human account-management activities, create external publisher identities, or request publishing credentials.

Do not claim that a feature or test works unless it has been verified.

## Completion criteria

The final deliverable must be a working, tested, documented VS Code extension that can be packaged as a VSIX and supports the complete agreed MVP.
</agent>

# Sources
https://github.com/jonasalessi/cdd-lint/releases