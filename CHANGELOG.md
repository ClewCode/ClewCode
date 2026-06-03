# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] — 2026-05-30

### Added

- First public Clew package release.
- Added `clew` as the primary CLI command.
- Added `clewcode` as a secondary alias.
- Bundled the current reconstructed CLI codebase with multi-provider routing, tools, plugins, skills, MCP, LSP, agents, daemon mode, scheduled tasks, bridge, research, and memory systems.
- Background Agents batch: `!bg` shell tasks, dispatch autocomplete, PR columns, and agent logout.
- **Goal command overhaul**: `/goal` parsing simplified to use explicit keywords; removed verb sets.
- **Goal pause state**: Paused indicator in footer with `totalPausedMs` tracked across state.
- **Goal enhancements**: Edit, status, last-achieved recall, and richer status display.
- **Ultracode**: Auto-classifier, dynamic workflow coordinator, and `workflow`/`ultracode` commands.
- **Spinner component**: New Spinner component with ignore directory configuration for crawl data.

### Changed

- Reframed the project as Clew, an unofficial independent rebuild and extension project.
- Updated package metadata, README, license notice, security policy, contributor docs, issue templates, and GitHub workflows for the Clew release line.
- Reset version to `0.0.1` for the Clew line.
- Removed Code Index; fixed `/context` to use real context data.
- Replaced old logo with new long-format branding image.
- Removed context hearts (diamonds) from the status line.
- **HTML docs**: Redesigned documentation with clean Anthropic-style theme.
- **Ultracode animation**: Refined concentric circular ripple animation speed.

### Fixed

- `/goal` parsing: removed `update` from edit verbs to prevent false matches.
- `/model` and `/providers` interactive pickers no longer persist selections to `provider.json`.
- Removed stale `CLAUDE_CODE_TEAM_NAME` references; fixed `settings/types.ts` encoding.

### Notes

- This is the first Clew release.
- Earlier `2.1.x` entries below are preserved as pre-Clew reconstruction history.
- The `2.1.x` numbers do not represent Clew package releases.

---

# Pre-Clew Reconstruction History