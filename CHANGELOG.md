# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] — 2026-06-06

### Fixed

- **Stats provider aggregation**: `/stats` now correctly aggregates usage across multiple providers
  - Added `normalizeProviderId()` to map aliases (Bedrock→Anthropic, Vertex→Google, Grok→XAI, etc.) to canonical registry keys
  - Provider extraction now prioritizes model name format (`provider/model`) over unreliable message metadata
  - All merge paths (live + cache, cache-to-cache, filtered ranges) normalize provider IDs for consistent aggregation
  - Added provider breakdown in Overview tab showing tokens, percentage, and cost per provider
  - Models tab now correctly groups models by normalized provider ID

## [0.2.1] — 2026-06-06

### Added

- **Taste interactive menu** (`/taste`): Arrow-key navigable Dialog with 11 actions (learn, forget, profile, events, decay, eval, export, import, on, off, status). Spinner/loading state for async operations (decay, eval). Inline success messages. Pre-fills input for learn/forget/export via `nextInput`.
- **Edit validation via taste**: `validateEdit()` called in `FileEditPermissionRequest.tsx` — shows `⚠ Taste flagged this edit` warning in dialog title/question when edit violates learned rules.
- **Settings change subscription**: `subscribeToSettingsChanges()` called during `initTasteOnStartup()` — live-reloads taste config when `settings.json` changes.
- **TasteStatusLine component** (`src/components/TasteStatusLine.tsx`): Shows `ⓘ taste: N rules` in `PromptInputFooter.tsx` alongside `DynamicWorkflowStatusLine`.
- **MessageDisplay hook infrastructure**: Added `onMessageDisplay` prop to Messages component with transform tracking ref and useEffect. Wired in REPL.tsx via `executeMessageDisplayHooks` with `ToolUseContext`. Enables future session hooks to hide or modify displayed messages.

### Changed

- **Model picker grouped by all providers**: `/model` now iterates `PROVIDER_IDS` and shows models from every provider in separate named sections, instead of only the active provider's models. Recent models still appear at top with defaults.
- **XML tag rename**: `<clew_taste1>` → `<clew_taste>`, `<clew_taste1_constraints>` → `<clew_taste_constraints>` in `TastePromptInjector.ts`, `TasteRegressionSuite.ts`, and tests.
- **Provider auto-persist**: Last-used provider and model are saved to `provider.json` even without `--global` flag.
- **Commander program name**: `.name('claude')` → `.name('clew')` in `src/main.tsx:1394`.
- **Documentation**: All docs HTML, CHANGELOG, README (en/zh/th) updated with taste system, version bump.

### Fixed

- **Autocomplete hint duplication**: `PromptInput.tsx` clears `argumentHint` when `inlineGhostText` is present, preventing duplicate hint display.
- **Blank screen on startup**: Fixed SentryErrorBoundary + TDZ race in `REPL.tsx`.
- **ProviderManager base URL**: Session-level `/providers` overrides now correctly resolve base URLs.
- **PowerShell prefix/wildcard rules for native executables (Security 2.2)**: Rules like `PowerShell(dotnet.exe build:*)` now correctly pre-approve native executables. Added `ruleContentNamesElement()` check at the `nameType` gate in `powershellPermissions.ts:1339`.
- **Malformed PowerShell tool calls misclassification (Security 2.4)**: Added `!input?.command` guard in `PowerShellTool.isReadOnly()`.
- **Bash runtime output byte limit (Security 2.5)**: Added 100MB max output threshold in `BashTool.tsx exec()`.

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