# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3] — 2026-06-07

### Added

- **Effort support for all providers**: `/effort` now works with any provider that has `reasoningEffort: true` in its capabilities (NVIDIA, DeepSeek, OpenRouter, etc.)
  - `modelSupportsEffort()` checks provider registry for `reasoningEffort` capability in addition to Claude model name matching
  - `AnthropicAdapter.convertToOpenAI()` maps Anthropic `output_config.effort` → OpenAI `reasoning_effort` parameter, so effort settings are actually sent to the API

- **NVIDIA model fetching from API**: `/model` now fetches live models from NVIDIA's `/v1/models` endpoint instead of relying solely on `providers.json`
  - Added `nvidia` to `supportsModelFetching()` in `fetchProviderModels.ts`
  - When API-fetched models are available, they replace the static `providers.json` list entirely (API is source of truth)

- **Model picker capability display**: Shows context window, vision, tools, reasoning, and free tags per model

- **Taste auto-learn system**: New `src/services/taste/auto-learn/` module
  - `PatternDetector` — detects repeating coding patterns from accept/reject/edit events
  - `AutoLearnEngine` — manages suggestions with confidence tracking and cooldown
  - Auto-detection runs automatically on every signal (accept/reject), no manual trigger needed
  - `/taste suggest` — view detected patterns, `/taste suggest accept <id>` — add as rule, `/taste suggest reject <id>` — dismiss

- **AI-driven codebase analysis**: `/taste init` now analyzes git log, config files, and source samples via the current AI provider to generate 3-10 initial taste rules with confidence scores

- **Taste init progress bar**: ASCII progress bar animation during initialization (`████████░░░░░░░░░░░░ 40%`)

- **Relay server** (`src/remote/relay-server.ts`): WebSocket relay for cross-network remote control
  - `/remote listen --relay <url>` — host connects through relay
  - `/remote connect <url> --token <token> --relay` — connector connects
  - `/remote exec <command>` — execute commands on remote host

- **Dynamic workflow live subagent status**: Footer now shows running subagents in real-time
  - `◈ ultracode [2/5] ⟐coder ⟐researcher` — live per-subtask status
  - Runner saves "running" state to disk so the progress UI can poll it

- **Voice input via browser Web Speech API**: `/voice` now captures speech through Google Chrome's built-in speech recognition — no API keys needed. Clean card UI with waveform visualization, Record/Stop/Send buttons, 20+ languages. Auto-submits transcript via `/voice check`. See `src/services/voiceInput/`
- **Buddy card UI**: `/buddy` shows a full card with ASCII sprite, rarity badges, stat bars, and personality. `/buddy name <name>` renames companion.
- **Context grid layout**: `/context` redesigned with 10×10 usage grid (⛁/⬚), model info, categories, and detail sections
- **Usage history & preview data**: `ContextData` includes `usageHistory` array for sparkline and `preview` field on system prompt sections

### Fixed

- **Model picker scroll bugs**:
  - `onUpFromFirstItem` now correctly detects the first non-disabled option instead of `options[0]`, which could be a section header (e.g. "Recent") that can never receive focus
  - Focus position is preserved when options change (e.g. API-fetched models arrive mid-scroll) instead of resetting to the default
  - Removed redundant `onUpFromFirstItem` from ModelPicker (search is already active by default)

- **NVIDIA model validation**: Added `nvidia` to `nonAnthropicProviders` list in `validateModel.ts` to skip API validation for NVIDIA models

- **NVIDIA model IDs**: Fixed model IDs in `providers.json` to match NVIDIA NIM API format (`glm-5.1` → `z-ai/glm-5.1`, `nemotron-3-super-120b-a12b` → `nvidia/nemotron-3-super-120b-a12b`)

- **SPARKLINE_WIDTH missing**: Added missing constant in `ContextStats.tsx`

### Changed

- **Terminal title**: `process.title` changed from `claude` to `clew` in `src/main.tsx`
- **Taste status line removed**: `ⓘ taste: N rules` no longer shown in footer
- **Buddy rendering**: `CompanionSprite` no longer gated by compile-time flag — checks companion config directly; `/buddy hide` now respects `companion.visible` field
- **Ultra mode decoration**: When ultracode is active (via `/effort ultracode`), prompt input shows a purple double-line border with "ultra" label
- **PR badge refresh**: `usePrStatus` hook fetches immediately after a turn ends, so badge updates right after `gh` commands

### Changed

- **Model picker API-fetched capability display**: API-fetched models now show the same rich capability badges (`vision · tools · reasoning · free`) as static models
  - Extended `FetchedModel` interface with `supportsTools`, `supportsVision`, `supportsReasoning`, `maxOutput`, `free` fields
  - After fetching from API, capability data is merged from static `providers.json` by matching model IDs
  - `/model list` text output now shows capability tags like `[200K ctx, vision, tools, reason]`
  - Models not in `providers.json` still work — fall back to showing context window only

- **CLI hints rebranded from `claude` to `clew`**: All user-facing CLI command hints in exit messages, session manager, bridge, teleport, auth, MCP, plugins, and SSH output now reference `clew` instead of `claude`
  - Exit/resume messages now show `clew --teleport`, `clew remote-control --continue`
  - Session manager commands: `clew agents`, `clew attach`, `clew stop`, etc.
  - `clew auth login`, `clew mcp add`, `clew plugin install`, `clew ssh`
  - `clew --bg` for background sessions

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