# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] — 2026-06-04

### Added

- **Guardian auto-review mode** (`/guardian`): LLM-based permission request reviewer using Haiku-class model. Routes boundary-crossing actions to a separate reviewer agent instead of pausing for user. Includes circuit breaker (3 consecutive denials → interrupt turn), rolling-window tracking (10/50), and custom policy support.
- **`/approve` command**: Override Guardian denials for one-time retry. Lists recent denials (up to 10) and allows selective override by ID.
- **`/pr` command**: Full GitHub PR lifecycle — create, list, view, review (AI diff analysis), merge, and CI status check.
- **Bridge v2 — Provider-agnostic Remote Control** (`/remote`): Direct WebSocket-based remote control without claude.ai OAuth. Includes RemoteServer (HTTP API + WebSocket), SHA-256 hashed one-time token store, RelayClient for NAT traversal, and REPL session bridging via `useRemoteBridge` hook.
- **Dynamic Workflow Bootstrap**: Wired ultracode globals into AppStateProvider and entrypoints. Interactive Y/n confirm hook for first-run cost warning.
- **Dynamic Workflow Progress UI**: Live progress component in PromptInputFooter showing subtask completion and verification status. Polls `.claude/runs/` every 3s.
- **Transcript classifier suggestion**: Context-aware suggestion — `/effort ultracode` for complex tasks, `/ultracode on` for moderate ones.

### Changed

- Bumped version to 0.2.0.
- AgentRunner uses role-specific system prompts (researcher cites files, verifier adversarial).
- Confirm hook now properly prompts user (Y/n) with 30s timeout.

---

## [0.1.3] — 2026-06-03