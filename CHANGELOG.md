# Changelog

## 0.1.0 (not released)

The first version.

### Added

- Inlay Hints that show the ICP score and the ICP limit of each code unit in `.go`, `.java`, `.kt`, `.ts` and `.tsx` files.
- Diagnostics for each code unit that is over its ICP limit.
- A language status item that shows the highest ICP score of the file, or the reason why the file has no result.
- Analysis of saved content: when a file becomes visible, on save, and when `cdd.config.yaml` or the `cdd.binaryPath` setting changes.
- Discovery of the `cdd` binary: the `cdd.binaryPath` setting, then `cdd` and `cdd-lint` on `PATH`, then the managed binary.
- Installation of cdd-lint `v0.1.0` as a managed binary, with a SHA-256 check. The installation starts only after your approval.
- The settings `cdd.binaryPath`, `cdd.showInlayHints` and `cdd.showDiagnostics`.
- The commands `CDD: Analyze Current File`, `CDD: Select Binary`, `CDD: Install Managed Binary` and `CDD: Show Output`.
