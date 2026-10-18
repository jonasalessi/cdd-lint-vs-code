# Changelog

## 0.1.0 (2026-10-18)

The first version.

### Added

- CodeLens that shows the ICP score and the ICP limit of each code unit in `.go`, `.java`, `.kt`, `.ts` and `.tsx` files.
- ICP details in the body of a code unit: a label at the end of each line that adds points, and a hover on each counted construct. The `Show ICP Details` action next to each score switches the labels on.
- Diagnostics for each code unit that is over its ICP limit.
- A language status item that shows the highest ICP score of the file, or the reason why the file has no result.
- Analysis of saved content: when a file becomes visible, on save, and when `cdd.config.yaml` or the `cdd.binaryPath` setting changes.
- Discovery of the `cdd` binary: the `cdd.binaryPath` setting, then `cdd` and `cdd-lint` on `PATH`, then the managed binary.
- Installation of cdd-lint `v0.1.0` as a managed binary, with a SHA-256 check. The installation starts only after your approval.
- The settings `cdd.binaryPath`, `cdd.showCodeLens` and `cdd.showDiagnostics`.
- The commands `CDD: Analyze Current File`, `CDD: Toggle ICP Details`, `CDD: Select Binary`, `CDD: Install Managed Binary` and `CDD: Show Output`.
