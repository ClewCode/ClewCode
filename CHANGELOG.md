# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.5.0] — 2026-07-08

### Added
- **Context usage HUD**: TokenWarning now renders a segmented context bar with per-category breakdown (system prompt, tools, messages, tool results). Shows `N% until auto-compact` with color-coded segments. (`src/components/TokenWarning.tsx`)
- **Compact regret detection**: Tracks tool signatures dropped during compaction and flags when the model re-references them within a 3-turn window — measurement-only phase. (`src/services/compact/autoCompact.ts`, `src/query.ts`)
- **Auto-compact hard threshold**: Added `AUTOCOMPACT_HARD_BUFFER_TOKENS` (20K) for force-compaction mid-tool-chain when `CLEW_CODE_BOUNDARY_COMPACT` is enabled. Includes `isAtNaturalBoundary()` and `estimateCompressibility()` heuristics. (`src/services/compact/autoCompact.ts`)
- **Streaming retry with backoff**: Changed from single retry to configurable limit (default 3) with exponential backoff before non-streaming fallback. Controlled via `CLEW_CODE_STREAMING_RETRIES`. (`src/services/api/claude.ts`)
- **MCP url→urls normalization**: `normalizeMcpToolArgsForSchema()` converts single `url` string to `urls` array for tools whose `inputSchema` expects array type — fixes compatibility with web-scraping MCP servers. (`src/services/mcp/client.ts`)
- **Session search background indexing**: Debounced (30s) async FTS5 indexing, precompiled query statement for reuse, incremental vacuum every hour. (`src/services/sessionSearch/sessionSearchDb.ts`)
- **Search cache + codegraph integration**: Glob/Grep results cached in-memory with LRU eviction (max 500). FileEdit/FileWrite invalidate cache and schedule codegraph update on write. (`src/utils/searchCache.ts`, `src/utils/codegraphUpdate.ts`, `src/tools/{FileEditTool,FileWriteTool,GlobTool,GrepTool}/`)
- **Enterprise audit logging**: Added NDJSON audit log writer/service, env-based opt-in, tool execution audit events, command/file access audit events, rotation/filtering, and focused tests. (`src/services/auditLog/`, `src/services/tools/toolExecution.ts`)
- **README sections**: Added table of contents, prerequisites, use cases, screenshots, configuration reference, FAQ, contributing guide, and star history chart. (`README.md`)
- **Terminal title utility**: Extracted shared `setTerminalTitle()` to `src/utils/terminalTitle.ts`. (`src/utils/terminalTitle.ts`)
- **Screenshot asset**: Added REPL screenshot for README. (`assets/screenshots/`)
- **Test for media fallback**: Added `AnthropicAdapter` test covering DeepSeek text-only model image stripping. (`src/services/ai/adapter/AnthropicAdapter.test.ts`)

### Changed
- **`.js` shadow cleanup complete**: Removed 401 committed `.js` shadow files that had `.ts`/`.tsx` twins — the final batch of the JS→TS migration. All 148 remaining shadow pairs were reconciled: 130 body-drifted `.ts` pairs (verified TS canonical in all cases), 15 `.tsx` transpiler-noise pairs, and 3 in-sync pairs. `/js-shadow-sync --all` now reports 0 shadows. (`src/`, multiple commits)
- **Search performance optimizations**: Added LRU eviction (max 500 entries) to in-memory search cache. Debounced session search indexing (30s cooldown). Precompiled FTS5 query statement. Enabled `auto_vacuum=INCREMENTAL`. (`src/utils/searchCache.ts`, `src/services/sessionSearch/sessionSearchDb.ts`)
- **Prompt suggestions always enabled**: Removed growthbook feature flag gate (`tengu_chomp_inflection`) from prompt suggestion toggle. Setting is now unconditionally available in config UI. (`src/services/PromptSuggestion/promptSuggestion.ts`, `src/components/Settings/Config.tsx`)
- **Colorize ansis API**: Updated from deprecated `ansis.ansi256()`/`ansis.bgAnsi256()` to `ansis.fg()`/`ansis.bg()`. Applied to both `.ts` and `.js` twins. (`src/ink/colorize.ts`, `src/ink/colorize.js`)
- **Auth error retry**: `withRetry` no longer retries auth errors when provider error info is available — avoids infinite retry loops on bad credentials. (`src/services/api/withRetry.ts`)
- **REPL tool JSX clearing**: `/resume` picker local JSX now properly cleared before returning to prompt. (`src/screens/REPL.tsx`)
- **Spinner verbs**: Changed from generic whimsical verbs to Harry Potter-themed phrases. (`src/components/Spinner/whimsy.ts`)
- **File permission dialog**: Symlink resolution failure now gracefully caught with debug log instead of crashing. (`src/components/permissions/FilePermissionDialog/FilePermissionDialog.tsx`)
- **Debug logging**: Added debug logs for SIGINT handler, uncaught exceptions, and invalid settings dialog exit in `main.tsx`.
- **`useTerminalTitle` hook**: Refactored to delegate title-setting to the shared utility. (`src/ink/hooks/use-terminal-title.ts`)
- **`main.tsx`**: Uses shared `setTerminalTitle` with `DEFAULT_TERMINAL_TITLE` constant instead of inline `process.title`. (`src/main.tsx`)
- **Vision/media graceful degradation**: `modelSupportsVision()` now defaults to `false` (instead of `true`) when registry lookup fails. (`src/services/ai/adapter/AnthropicAdapter.ts`)
- **DeepSeek text-only sanitization**: `OpenAICompatibleProvider` now strips `image_url` blocks before sending to DeepSeek's API. (`src/services/ai/providers/OpenAICompatibleProvider.ts`)
- **Rewind UI improvements**: Refined MessageSelector layout — grouped Rewind header, added "Current point" indicator, extracted `DiffStatsSummary` component. (`src/components/MessageSelector.tsx`)

## [0.4.8] — 2026-07-04

### Changed
- **README overhaul**: Rewrote README.md in the style of OpenClaw/Hermes Agent — cleaner layout, feature table, punchier tagline, streamlined install + CLI reference sections. (`README.md`)
- **Task list layout styling**: Changed task list in-progress spinner to a static yellow circle status indicator, and removed strikethroughs from completed tasks. (`src/components/TaskListV2.tsx`)
- **Rebrand `CLAUDE_CODE` → `CLEW_CODE`**: Renamed all `CLAUDE_CODE_*` environment variables, class names, comments, and URLs to `CLEW_CODE_*` across the entire codebase (390 files). Documentation links updated from `code.claude.com` to `clew-code.org`. (`src/`)
- **Soften ultracode effort glow**: Reduced visual intensity of ultracode mode — smaller initial radius (12→4), subtler wave/ring effects, lower saturation variance, reduced feather distance. Makes the purple radial spotlight read better in terminals with coarse background cells. (`src/commands/effort/effort.tsx`)

### Added
- **Project rules system**: Auto-observed behavioral rules scoped to the working repo, stored in `.clew/rules.json`. Includes `ProjectRule` tool (save/list/remove), `/rule` slash command (supports `/rule on`/`/rule off` to toggle), rules injection into system prompt, startup notification, and footer indicator showing rule count (e.g. `3R`). (`src/utils/projectRules.ts`, `src/tools/ProjectRuleTool/`, `src/commands/rule/`)
- **OpenRouter live pricing fallback**: `getModelCosts()` now falls back to live OpenRouter API pricing for unknown models. Fetches `https://openrouter.ai/api/v1/models` on startup, caches to `~/.clew/model-pricing-cache.json` with 6-hour TTL, with prefix matching for model ID resolution. (`src/utils/modelCost.js`, `src/utils/modelCost.ts`)
- **New model pricing entries**: Added pricing for gemini-3.5-flash, gemini-3.1-pro, qwen3.6-plus, glm-5.1, and kimi-k2.6 to `PROVIDER_PRICING`. (`src/utils/modelCost.js`, `src/utils/modelCost.ts`)

### Removed
- **`/mobile` command**: Deleted iOS/Android QR code display command that linked to Claude mobile app — no longer relevant. (`src/commands/mobile/`)
- **`/login` and `/logout` auth commands**: Disabled auth commands entirely — removed login/logout imports and registration from the command registry. (`src/commands.ts`)

### Fixed
- **Resume system crash**: Fixed `ReferenceError: Cannot access 'agentToolResultSchema' before initialization` that caused resume (`/resume`, `--resume`, `--continue`) to crash the app. Root cause: `buildTool` in `Tool.ts` used object spread which eagerly invoked getters like `outputSchema` during module init — for AgentTool, the `agentToolResultSchema` lazy import was still in the temporal dead zone. Fixed by preserving getters via `Object.defineProperties` instead of spread.
- **Bash mode crash from auth import**: Removed `isActiveProviderAnthropic()` import which caused undefined reference crashes in bash mode (`-p` one-shot). (`src/commands.ts`)
- **`CLAUDE_CODE` env alias fallback**: Fixed `getEnvWithAlias()` calls in `envUtils.js` — `CLEW_CONFIG_DIR` was incorrectly aliased to itself instead of `CLAUDE_CONFIG_DIR`, and `CLEW_CODE_SIMPLE` similarly lacked the `CLAUDE_CODE_SIMPLE` fallback. (`src/utils/envUtils.js`)

## [0.4.6] — 2026-07-02

### Added
- **Workflow-backed `/code-review` UI**: Added a local JSX `/code-review` workflow panel with phase navigation, parallel review agents, live token/tool progress, compact task-tree overview, and per-agent detail panes. (`src/commands/code-review/`)
- **`/cd` command**: New slash command to change working directory from the REPL. (`src/commands/cd/`)
- **`/privacy-settings` made local**: Privacy settings now render in-terminal instead of opening a browser. (`src/commands/privacy-settings/`)
- **Peer state persistence**: PeerStore now persists connections, messages, todos, and tags to `~/.clew/peer/state.json` with debounced atomic writes — survives CLI restarts. (`src/peer/PeerStore.ts`, `src/peer/peerPersistence.ts`)
- **Checkpoint on every compaction**: Previously checkpoints only wrote when a goal with `maxTurns` was active. Now every compaction writes a checkpoint snapshot first, so `tryRebuildFromCheckpoint()` always has state to work with. (`src/services/checkpoint/checkpointWriter.ts`)
- **Memory maintenance**: `saveMemory` now deduplicates identical content; `pruneMemories()` removes stale low-value memories on session init. (`src/memory/database.ts`)
- **Cross-peer memory sync**: Replaced broken `/memory/export` + `/peer memory-sync` path with a working `GET /peer-memory-export` endpoint, `src/memory/peerSync.ts` (validation, confidence discount, provenance), and new `peer_memory_sync` tool. (`src/memory/peerSync.ts`, `src/peer/PeerServer.ts`, `src/tools/PeerMemorySyncTool/`)
- **Long-turn recap**: Turns exceeding a threshold (default 5 min) now get an automatic "Goal / Next" recap appended on completion. Configurable via `recapEnabled` / `longTurnRecapThresholdMs`. (`src/services/longTurnRecap.ts`)
- **Provider selection validation**: Provider must be in registry, model must be in registry catalog or live model list. Unverifiable setups (no key, offline, custom endpoints) accepted as before. (`src/services/ai/providerSelection.ts`)

- **Notification placement utility**: New `src/components/notifications/notificationPlacement.ts` for managing notification UI positioning.

- **README rewrite**: Removed fictional model IDs (gpt-5.5 → gemini-2.5-flash), inflated feature counts, unverified claims, and SWE-bench Verified section. Replaced with honest, code-backed descriptions.

- **CI: Install Playwright browsers before tests**: Added `npx playwright install chromium --with-deps` step to ci.yml and publish.yml to fix `BrowserSession` test failure. Made publish job depend on quality job passing.

- **Build: AWAY_SUMMARY flag**: Added `--define.AWAY_SUMMARY=true` to the build script to gate away-summary feature at compile time. (`package.json`)
- **Away summary improvements**: Enhanced prompt to produce structured `Goal: ... Next: ...` output, added `cleanAwaySummary()` to strip prefixes, switched from GB/telemetry gating to `config.recapEnabled` setting. (`src/services/awaySummary.ts`, `src/hooks/useAwaySummary.ts`)
- **Goal blocked/stopped display**: StatusLine now shows `blocked`/`stopped` states with progress bar format changed to `[####-]`. (`src/components/StatusLine.tsx`)

### Removed
- **Fast mode system removed**: Deleted entire fast mode system — `src/utils/fastMode.ts` (470 lines), `/fast` command, `FastIcon` component, `useFastModeNotification` hook, `useShowFastIconHint` hook, and all references across 40+ files (QueryEngine, query.ts, config.ts, main.tsx, AppStateStore, StatusLine, constants/prompts, systemPromptSections, commands.ts, etc.). Fast mode state hardcoded to `'off'`. (`src/utils/fastMode.ts`, `src/commands/fast/`, `src/components/FastIcon.tsx`, `src/hooks/notifs/useFastModeNotification.tsx`, `src/components/PromptInput/useShowFastIconHint.ts`)
- **init-verifiers command**: Removed import from commands.ts. (`src/commands.ts`)
- **`/profile` command removed**: Deleted `src/commands/profile/` — the profile system is now a background state only, no longer user-togglable via slash command. (`src/commands/profile/`, `src/commands.ts`)
- **Duplicate AGENT.md removed**: `AGENT.md` was a subset of `AGENTS.md` — consolidated to single `AGENTS.md`. (`AGENT.md`)

### Changed
- **Context and workflow terminal UI polish**: Refined `/context` category coloring/provider display, redesigned resume-session rows into compact metadata-first entries, and moved selected alert notifications into the LogoV2 header while keeping prompt-only status notices near the input. (`src/components/ContextStats.tsx`, `src/components/LogSelector.tsx`, `src/components/LogoV2/`, `src/components/PromptInput/Notifications.tsx`)
- **`/clear` description updated**: Updated the `/clear` slash command description for clarity.
- **Documentation URL**: Replaced all `clew-code.org/docs` references with `clew-docs.pages.dev` across README, chrome command, IDE command, and preflight checks. (`README.md`, `src/commands/chrome/chrome.tsx`, `src/commands/ide/ide.tsx`, `src/utils/preflightChecks.tsx`)
- **ProcessPeer → ProcessDelegate rename**: Renamed `ProcessPeerTool`/`ProcessPeerProvider` to `ProcessDelegateTool`/`ProcessDelegateProvider` for clearer semantics. Updated all imports across peer, tools, and commands. (`src/tools/ProcessDelegateTool/`, `src/peer/ProcessDelegateProvider.ts`, `src/commands/peer/peer.tsx`, `src/tools.ts`)
- **GoalTool rendering enhancements**: Added React-based tool use summary with truncation preview via `renderToolUseMessage()`, `getToolUseSummary()`, and `summarizeGoalInput()` helpers. (`src/tools/GoalTool/GoalTool.ts`)

### Fixed
- **Anthropic provider registration**: Registered anthropic as a first-class `PROVIDER_REGISTRY` entry. Previously `provider: "anthropic"` was silently rejected and fell back to openai. Anthropic API keys stored in `provider.json` now reach the native client. (`src/services/ai/providers.json`, `src/services/ai/providerRegistry.ts`)
- **`clew provider` CLI rebuilt on registry**: Deleted hardcoded provider table from `provider-select-cli.ts` and the unreferenced legacy `provider-select.js`. Provider selection now reads from `PROVIDER_REGISTRY`. Fixes stale defaults (gpt-4.1-mini on `--reset`) and the `gemini` key writing an unregistered provider id. (`src/commands/provider-select-cli.ts`)
- **gemini → google migration alias**: `normalizeProviderId()` applies legacy alias migration in-memory when `provider.json` loads, to `AI_PROVIDER`, session values, and CLI/slash-command arguments. Legacy `apiKeys` entries copied, not deleted. (`src/services/ai/providerRegistry.ts`)
- **Clew Internal Protocol v1**: Declared Anthropic Messages format as the canonical internal protocol with type aliases and docs. (`src/services/api/clewProtocol.ts`)
- **Provider system architecture docs**: New `docs/architecture/provider-system.md` documenting provider registration, adapter normalization, and the `.js` shadow caveat.

- **Tool input schema render crash**: Guarded UI rendering for dynamic/remote tools whose `inputSchema` is not a Zod schema, and fixed remote permission tool stubs to use a real loose Zod object schema. (`src/utils/safeParseToolInput.ts`, `src/remote/remotePermissionBridge.ts`)
- **Goal evaluation skip when blocked**: Added `!goalState.blocked` check to prevent goal evaluation when the goal is blocked. Removed stale goal turn counter increment in query.ts. (`src/query.ts`)
- **Import path cleanup**: Moved tool constants (`FILE_EDIT_TOOL_NAME`, `TODO_WRITE_TOOL_NAME`, `TASK_CREATE_TOOL_NAME`) to their respective `constants.ts` files; fixed relative→absolute import paths in AppStateStore.ts. (`src/constants/prompts.ts`, `src/state/AppStateStore.ts`)
- **Peer tool de-duplication**: Extracted `clampTimeout()` and `retryUntil()` helpers into `src/tools/peer/peerFeedback.ts`, replacing 12 duplicated timeout-clamping formulas and 2 copy-pasted retry loops across 9 peer tools. (`src/tools/peer/peerFeedback.ts`, `src/tools/PeerPingTool/`, `src/tools/PeerInfoTool/`, `src/tools/PeerRunTool/`, `src/tools/PeerSendMessageTool/`, `src/tools/PeerListMessagesTool/`, `src/tools/PeerDiscoverTool/`, `src/tools/PeerListRolesTool/`, `src/tools/PeerSwarmTool/`, `src/tools/ProcessPeerTool/`)
- **Dead code removal**: Deleted `cost.ts.backup`, removed duplicate `ProviderAdapter` interface in AnthropicAdapter, removed unused `__CODE_INDEX_FEATURE` constant, removed dead `getWorkflowCommands` null placeholder and dead `filePersistence/types.js` stub. (`src/commands/cost/cost.ts.backup`, `src/services/ai/adapter/AnthropicAdapter.ts`, `src/tools.ts`, `src/commands.ts`, `src/utils/filePersistence/types.js`)
- **Debug log cleanup**: Removed 25+ debug `console.log` statements across ResearchTool, semanticSearch, webSearch, dossierGenerator, smartSourceRanking, and fetchProviderModels. (`src/tools/ResearchTool/`, `src/memdir/semanticSearch.ts`, `src/research/collectors/webSearch.ts`, `src/utils/model/fetchProviderModels.ts`)
- **Stale TODO cleanup**: Removed 15+ stale TODOs referencing Anthropic-internal devs (hackyon, paulc), tickets (ANT-344, #23985), completed migrations (onKeyDown, keybindings), and dead systems (Lulu agent). (`src/tools.ts`, `src/utils/advisor.ts`, `src/utils/config.ts`, `src/server/lsp.ts`, `src/services/api/withRetry.ts`, `src/commands/mcp/xaaIdpCommand.ts`, `src/hooks/useVoiceIntegration.tsx`, `src/hooks/useBackgroundTaskNavigation.ts`, `src/hooks/useTypeahead.tsx`, `src/hooks/useSearchInput.ts`, `src/hooks/useHistorySearch.ts`, `src/keybindings/`, `src/components/permissions/ExitPlanModePermissionRequest/`, `src/state/AppState.tsx`)
- **Fix conflicting MemorySearchResult types**: Renamed `MemorySearchResult` in `src/memdir/semanticSearch.ts` to `SemanticMemoryResult` to avoid shadowing the distinct `MemorySearchResult` type in `src/memory/types.ts`. (`src/memdir/semanticSearch.ts`, `src/commands/memory/memorySearch.tsx`)

## [0.4.0] — 2026-06-29

### Added
- **Peer security hardening**: Auth token (randomUUID) required on all POST endpoints (`/peer-msg`, `/peer-todo`, `/peer-exec`, `/broker/*`, `/peer-queue-cancel`, `/peer-queue-cancel-all`, `/memory/export`). Tokens generated per-instance on server start, written to peer files (`~/.clew/peers/`), and exchanged via UDP beacon for cross-machine auth. (`src/peer/PeerServer.ts`, `src/peer/PeerDiscovery.ts`, `src/peer/PeerStore.ts`)
- **Body size limit**: 10MB max request body on all HTTP endpoints, enforced via Content-Length header check and streaming accumulation. (`src/peer/PeerServer.ts`)
- **Client disconnect handling**: Long-poll broker endpoints and async exec handlers check `res.destroyed` before writing response — prevents errors when client disconnects mid-request. (`src/peer/PeerServer.ts`)
- **Peer token sync in tools**: All tools that discover peers now sync tokens from PeerDiscovery into PeerStore via `populateTokensFromDiscovery()`. (`PeerSendMessageTool`, `PeerRunTool`, `PeerSwarmTool`, `PeerBroadcastTool`, `PeerSetRoleTool`, `PeerSetNameTool`, `PeerDiscoverTool`)

### Changed
- **PeerServer binds 0.0.0.0**: Previously bound to `127.0.0.1` which prevented cross-machine communication despite LAN discovery advertising the real IP. Now listens on all interfaces with per-request token auth. (`src/peer/PeerServer.ts`)
- **Peer share passes server token to discovery**: `PeerShareTool`, `main.tsx`, `agentLoop.ts`, `peer.tsx`, `PeerMenu.tsx` all pass `server.token` to `discovery.startAdvertising()` so the peer file and UDP beacon carry the correct auth token. (`src/tools/PeerShareTool/PeerShareTool.ts`)

### Removed
- **WebSocket dead code**: Removed unused `wsClients` set, `upgrade` event listener, and `handleWebSocketUpgrade()` method — WebSocket chat was never implemented. (`src/peer/PeerServer.ts`)
- **Host header check**: Removed ALLOWED_HOSTS / `checkHostHeader()` — was redundant with per-request token auth and blocked LAN peers. (`src/peer/PeerServer.ts`)
- **Unused `PROTECTED_POST` constant**: Documentation-only constant for protected endpoints, never actually used in code. (`src/peer/PeerServer.ts`)

## [0.3.7] - 2026-06-25

### Changed
- **LSP Tool enabled by default**: Removed `ENABLE_LSP_TOOL` env gate — LSP tool is now always registered and available without environment variable. (`src/tools.ts`)
- **Agent Tool enabled for AI model**: Registered `AgentTool` in `getAllBaseTools()` so the AI model can directly invoke subagents via the Agent tool with `subagent_type`. Previously only accessible through `/agent` slash command. (`src/tools.ts`)

### Fixed
- **Startup crash in proxy module**: `bun run dev` crashed with `TypeError: undefined is not an object (evaluating 'ofetch.defaults.proxy = void 0')` in `configureGlobalAgents()`. The `proxy.js`/`proxy.ts` files were partially migrated from `axios` to `ofetch` v1.5.1 but retained axios-specific APIs (`ofetch.defaults`, `ofetch.interceptors.request`) that don't exist in ofetch v1.x. Rewrote `createFetchInstance()` to use `ofetch.create()` with undici dispatcher (Node.js) or Bun-native `proxy` option, and simplified `configureGlobalAgents()` to only use `undici.setGlobalDispatcher()`. (`src/utils/proxy.js`, `src/utils/proxy.ts`, `src/cli/transports/ccrClient.ts`)

## [0.3.6] - 2026-06-23

### Added
- **`/fork` command**: New slash command that forks the current conversation into a new session, leaving the original intact. Use `/resume <session-id>` to return to the original. (`src/commands/fork/`)

## [0.3.5] - 2026-06-23

### Changed
- **`clew update` simplified**: Replaced complex multi-path update system (~370 lines) with a simple `npm install -g clew-code@latest` exec call (~35 lines). Removed installation type detection, lock mechanism, native/local installer fallbacks, and auto-relaunch. The current session continues running uninterrupted. (`src/cli/update.ts`)
- **`autoUpdater.ts` simplified**: Removed `installGlobalPackage()`, lock mechanism, and package manager detection — kept only `getLatestVersion()`, `getNpmDistTags()`, `assertMinVersion()`, `classifyUpdateError()`. (~745→~430 lines) (`src/utils/autoUpdater.ts`)
- **`localInstaller.ts` simplified**: Removed `installOrUpdateClaudePackage()` and installation helpers — kept only `localInstallationExists()`. (~162→~35 lines) (`src/utils/localInstaller.ts`)
- **Background auto-updater simplified**: `AutoUpdater.tsx` now only shows "Update available" notification instead of auto-installing. Removed `NativeAutoUpdater.tsx` and `PackageManagerAutoUpdater.tsx`. Simplified `AutoUpdaterWrapper.tsx`. (`src/components/AutoUpdater.tsx`)
- **Peer system UX improvements**: `peer_send_message` now defaults `waitResponse: true` (most common case). `/peer` menu auto-discovers LAN peers on open. Fixed variable shadowing bug in PeerMenu peers view. Added `PeerIndicator` showing connected peer count in REPL footer. (`src/tools/PeerSendMessageTool/`, `src/commands/peer/`, `src/components/PeerIndicator.tsx`)
- **`process_peer` renamed to `delegate`**: Renamed tool from `process_peer` to `delegate` to avoid confusion with LAN P2P system. Updated all references in prompts, profiles, and types. (`src/tools/ProcessPeerTool/`, `src/skills/bundled/personalDelegate.ts`, `src/constants/profilePrompts.ts`, `src/types/tools.ts`)

### Fixed
- **MACRO globals not set at build time**: `clew update` crashed with `TypeError: undefined is not an object (evaluating 'Fy.PACKAGE_URL')` because `MACRO.PACKAGE_URL` was never injected into the bundle. Added `scripts/postbuild-inject-macro.mjs` that reads `package.json` and prepends `var MACRO={...}` to `dist/main.js` at build time.

### Removed
- **`/looplock`**: Removed the `/looplock` command — it was redundant with `/daemon start` + `/task`. Replaced UI hints with `/task` and `/daemon` throughout.
- **`/agents`**: Removed the `/agents` command — it was identical to `/agent view`. Moved `getAgentViewDisabledReason` utility to `src/cli/handlers/agents.ts`.
- **17 dead stub commands**: Removed `ant-trace`, `backfill-sessions`, `break-cache`, `bughunter`, `ctx_viz`, `debug-tool-call`, `env`, `good-claude`, `issue`, `mock-limits`, `oauth-refresh`, `onboarding`, `perf-issue`, `reset-limits`, `share`, `summary`, `teleport` — all were `isEnabled: () => false, isHidden: true` stubs. Also removed the `INTERNAL_ONLY_COMMANDS` array and its conditional inclusion.

### Added
- **Compact Orchestrator**: Added `src/services/compact/orchestrator.ts` as a unified entry point for all compaction strategies (micro-compaction, session-memory, and auto-compaction).
- **Cross-platform Computer Use Tool**: Unifed the computer use execution paths by routing the primary `ComputerUseTool` through the new platform-native adapter (`getPlatformAdapter()`). Added support for macOS and Linux in addition to Windows when `ENABLE_COMPUTER_USE=1` is specified.
- **User-visible fallback warning**: Added a console warning message printed to stderr when `COMPUTER_USE_BACKEND="anthropic"` is explicitly requested but the `@ant/computer-use-mcp` or `@ant/computer-use-input` packages are missing.

### Changed
- **Auto-compact threshold adjusted**: Changed background auto-compact min threshold percentage (`BACKGROUND_AUTOCOMPACT_MIN_THRESHOLD_PCT`) from `0.8` to `0.65` to trigger background compaction earlier.
- **CLAUDE → CLEW full rename**: Renamed all remaining `.claude/` → `.clew/` directory references, `getClaudeConfigHomeDir` → `getClewConfigHomeDir` (83 files), `CLAUDE_FOLDER_PERMISSION_PATTERN` → `CLEW_FOLDER_PERMISSION_PATTERN`, `CLAUDE_CODE_DOCS_MAP_URL` → `CLEW_CODE_DOCS_MAP_URL`, `CLAUDE_CODE_GUIDE_AGENT_TYPE` → `CLEW_CODE_GUIDE_AGENT_TYPE`. Updated `.npmignore`, `.gitignore`, permission scope strings, env var fallbacks, readme translations (12 languages), and comments throughout.
- **PlatformAdapter automation extension**: Extended `PlatformAdapter` with `mouseDown`, `mouseUp`, `holdKey`, `listWindows`, and `focusWindow` methods, implementing them for Windows, macOS, and Linux, and refactoring `ComputerUseTool` Action Handler to use these adapter methods directly instead of `require('./input.js')` fallbacks.
- **URL rebranding**: Replaced all `claude.ai` and `claude.com` URLs with `clew-code.org` across OAuth config, product links, usage, desktop, chrome, privacy, and prompts. Removed Anthropic production OAuth endpoints. (`535d2c8`, `38c0b19`, `37c48ac`)
- **`/login` and `/logout` now gateway-native**: Commands use gateway mode by default when `isGatewayConfigured()` returns true. `/login` type changed to `'local'`, `/logout` type changed to `'local'` — both load gateway-specific modules (`gwlogin.ts`, `gwlogout.ts`). (`src/commands/login/index.ts`, `src/commands/logout/index.ts`)
- **Interrupted prompt renamed**: "Interrupted by user" message now branded as "Clew". (`src/components/InterruptedByUser.tsx`)
- **README restructured**: Moved Install, Quick start, Provider setup above Features for better flow. Updated provider count 28→27. Removed GenerateImage/GenerateVideo from features list.
- **README cleaned**: Removed all "fork of Claude Code" and "reverse-engineered" references. Fixed `check:ci` description. Fixed peer docs link → wiki.
- **Onboarding wizard redesigned**: New flow: Theme → Provider (all 27) → API Key → Model → Done. Removed Auth method selector, OAuth login, terminal settings step. Removed Anthropic Claude from provider list.
- **AGENTS.md updated**: Added gateway mode, dashboard deployment instructions, removed commands section. (`e6ed8e8`)
- **Screenshot scaling and compression**: Unified screenshot output to JPEG quality 75 with scaling on Windows platform adapter to match the canonical tool behavior.

### Fixed
- **Clipboard race condition in `typeText`**: Fixed race condition where text typing via clipboard paste would overwrite user clipboard without locking/restoring, and synchronized the logic across Windows platform paths.
- **Workflow test paths**: Updated `tests/commands/workflow.test.ts` to use `.clew/runs/` instead of `.claude/runs/`, fixing 4 failing tests on Windows.
- **Auth logout message**: Changed "Successfully logged out from your Anthropic account" to generic "Successfully logged out." for gateway compatibility.

### Removed
- **Dead code cleanup**: Removed unregistered commands (`extra-usage`, `tag`, `remote-setup`, `vim`), commented-out tools (`BrowserAgentTool`, `MultiSearchTool`), and Anthropic-gated tools (`ConfigTool`, `TungstenTool`, `REPLTool`). Cleaned up imports and references across tools.ts, caches.ts, and REPL.tsx. Approximately 1,900 lines removed.
- **docs/ directory**: Deleted all static HTML docs (44 files). Documentation moved to GitHub Wiki.
- **Sensitive files untracked**: `.claude/settings.json`, `.claude/skills/graphify/`, `.claude-plugin/marketplace.json`, `.clew/taste/` — removed from git tracking.
- **Gitignore updated**: Added `.obsi/`, `.claude/`, `.claudeignore`, `ClewCode.wiki`, `test/`, `tests/`, `examples/` to `.gitignore`.
- **Unintended assets**: Removed website assets from main repo after moving website to separate repo. (`d25393d`)

### Changed
- **MCP docs URL rebranded**: Changed all `code.claude.com/docs/en/mcp` references to `https://clew-code.org` across 5 files (MCP dialog, settings, warnings, panel, and config suggestions).
- **Windows clipboard now uses PowerShell Set-Clipboard**: `clip.exe` corrupts non-ASCII text (Thai, Japanese, emoji, etc.) due to console code page limitations. Replaced with `powershell.exe Set-Clipboard` forced to UTF-8 stdin. Windows is also now counted as `'native'` clipboard path in `getClipboardPath()`. Both `.ts` source and `.js` mirror updated.

### Removed
- **`.mcp.json` untracked**: Added to `.gitignore` and removed from git tracking (contains `GITHUB_TOKEN`).

## [0.3.2] - 2026-06-18

### Fixed
- **`schema._zod.def` crash during tool API schema conversion**: `zodToJsonSchema()` now checks for `_zod` branding before calling `toJSONSchema()`, preventing crashes when a non-Zod value is passed as a tool schema. Added warning log to identify the offending tool.
- **`generateSettingsJSONSchema()` crash**: Wrapped `toJSONSchema()` call in `schemaOutput.ts` and `.js` with try-catch to gracefully handle Zod v4 serialization failures for complex schemas.

## [0.3.1] - 2026-06-18

### Fixed
- **PeerStore infinite recursion hang**: Removed 7 duplicate "alias" methods (`addPeer`, `getPeerByPort`, `findPeer`, `setPeerName`, `setPeerRole`, `getPeerTags`, `getAllPeerTags`) that overrode their real implementations and called themselves recursively, causing `Maximum call stack size exceeded` and hanging the app during `peer_discover`.

## [0.3.0]

### Added
- **Peer memory sync**: `/peer memory sync` imports memories from all connected peers into local MemoryDB via new `/memory/export` HTTP endpoint. Each peer returns top-50 memories ordered by importance; upsert ensures idempotent cross-machine deduplication.
- **Peer memory auto‑sync**: `/peer memory auto on [minutes]` schedules periodic memory sync via cron system (default 60 min, min 15, max 1440). `/peer memory auto off` cancels the cron task. Runs an initial sync immediately on enable.
- **Memory system dashboard**: `/memory dashboard` shows a unified view of profile, MemoryDB stats, Dream, Distill, Peer auto-sync state, and recent timeline events.
- **Legacy migration**: `migrateFromSessionDB()` reads old `session-memory.db` (sessions, digests, topics) and upserts into MemoryDB with deterministic keys. Auto-runs during `/memory init`. `queryTimeline()` now reads from MemoryDB as primary source, falls back to legacy DB.
- **Removed redundant files**: Deleted `autoExtract.ts`, `consolidator.ts`, `index.ts`, `prompts.ts` from `src/services/longTermMemory/`.
- **Redirected longTermMemory to MemoryDB**: `dream.ts`, `graph.ts`, `experience.ts`, `consolidate.ts`, `crossSession.ts` all now read/write to MemoryDB instead of their own SQLite DB or JSON files. Exports stay the same — zero breakage for callers like `/memory graph`, `/memory xp`, `/memory timeline`, `/memory dashboard`.
- **autoDream logs to MemoryDB**: `dream_completed` event written to `memory_timeline` after each Dream run, so dashboard can show dream status without reading old state files.

### Changed
- **Hidden `clew-gateway` provider**: Filtered out from `PROVIDER_IDS` so it no longer appears in `/providers` or `/model` selectors.
- **Removed Anthropic provider**: Since clew-gateway + cline providers cover Anthropic models, the standalone `anthropic` entry (models, UI sub-menus, OAuth login, provider class) has been removed from the provider system. Use Claude Code directly for Anthropic-first workflows.
- **`/model` now fetches from API for all providers**: `supportsModelFetching()` expanded from a 14-provider whitelist to all providers (except google-assist). Every provider tries its `/models` endpoint first; if unavailable, falls back to static models in `providers.json`.
- **`/peer swarm`**: New command that sends a shell command to ALL connected peers in parallel via `/peer-exec`, collects and displays aggregated results. Supports `--timeout`, `--filter`, and `--dry-run` flags.
- **`peer_swarm` tool**: New AI-callable tool that runs a shell command on all connected peers in parallel and returns aggregated results. Analogous to `peer_broadcast` but for `/peer-exec` instead of `/peer-todo`.
- **In-process message broker**: New endpoints on PeerServer — `POST /broker/send`, `GET /broker/recv` (long-poll), `POST /broker/reply`. Messages are queued in PeerStore with delivery tracking, correlation IDs, and waiter resolution. No new process needed — runs inside existing `/peer share` server.
- **Peer task dashboard**: New `formatPeerTaskDashboard()` utility, `/peer dashboard` command, and `peer_dashboard` AI tool. Shows connected peers, their assigned tasks (with status), and result summaries in a collapsed format — giving the AI full visibility into peer work as a "checklist person".
- **MemoryDB — SQLite-backed memory store**: New `src/memory/database.ts` + `src/memory/schema.ts` implementing a durable memory system with `memories` table (importance, confidence, access_count, type) and `memory_timeline` table (event lifecycle tracking). Supports budgeted querying by importance × recency ranking, auto-eviction, and timeline event logging.
- **Memory hierarchy**: New `src/memory/hierarchy.ts` for managing `.clew/memory/` directory with MEMORY.md, DECISIONS.md, TASTE.md, task directories. Auto-initializes on first use.
- **Budgeted injection**: New `src/memory/budgetInjector.ts` for importance-ranked memory injection into system prompt. Loads file hierarchy + SQLite memories, ranks by importance × confidence × recency, and fits into configurable token budget.
- **`/memory scan`**: New subcommand that scans the repo, detects stack/language/package-manager/entrypoints/provider-architecture, and bootstraps seed memories into MemoryDB + MEMORY.md/DECISIONS.md/TASTE.md.
- **`/memory rebuild`**: New subcommand to reconstruct context from memories using budgeted injection. Shows per-memory detail (key, type, importance, score, tokens), budget usage, and skipped memories with reasons.
- **`/memory scan` idempotent**: Scanner uses deterministic keys (`scan.*`) with upsert. Output shows created/updated/unchanged counts. Content-hash change detection skips unchanged entries.
- **`/memory recall`**: New subcommand that recalls memories ranked by combined score (importance×0.3 + confidence×0.15 + recency×0.2 + access_count×0.1). Bumps access_count on recall. Supports `--verbose` for score breakdown.
- **`/memory feedback`**: New subcommand supporting 7 signals (accepted, rejected, corrected, preferred, disliked, important, wrong). Updates importance/confidence deltas, writes `preferred` signals to TASTE.md, and records all events in memory_timeline.
- **MemoryDB hardening**: Added upsertMemory (INSERT OR REPLACE by key), findByKey, deleteMemoryByKey, recallMemories with scoring, and content-hash change detection.
- **recall relevance scoring**: Added lexical relevance computation (0..1) between query and memory content/key/type. New score formula: relevance×0.45 + importance×0.20 + recency×0.15 + access×0.10 + confidence×0.10. `--verbose` shows all 5 components.
- **feedback aliases**: Added signal aliases (`correct`→corrected, `incorrect`→wrong, `like`→preferred, `dislike`→disliked). Only canonical signals stored in memory_timeline.
- **In-compact memory extraction**: Compact prompt now asks LLM to output `<memories>` block with structured facts (`[decision]`, `[architecture]`, `[taste]`, `[bug]`, etc.). `parseCompactMemories()` extracts them, `autoExtractFromSession()` saves to MemoryDB + markdown files. Works for both manual `/compact` and auto-compact. Shows `N memories extracted` in status line.
- **Dream → MemoryDB**: After Dream consolidation runs, `syncDreamToMemoryDB()` reads updated markdown files and upserts tagged lines into MemoryDB (SQLite). Bridges Dream's file-based consolidation with structured memory store.
- **Distill → MemoryDB**: Rewrote `autoDistill()` to query MemoryDB for recent memories instead of file-based digests. Extracts patterns from memory types and content themes; generates skill suggestions from MemoryDB data.
- **Fix GoalTool crash**: Added missing `mapToolResultToToolResultBlockParam` method to GoalTool (required by `Tool` interface but never defined). Fixes runtime `$.mapToolResultToToolResultBlockParam is not a function` error when Goal tool was called.
- **Hide auto-compact %**: Removed `N% until auto-compact` display from TokenWarning component — only shown when context is actually low.
- **Memory types**: Added `task_progress`, `command`, `note` to MEMORY_TYPES schema.
- **Memory tests**: 8 new tests covering upsert idempotency, content-hash change detection, recall ranking by relevance, access_count increment, feedback effects (important, preferred→TASTE.md, wrong→confidence), signal alias resolution, and budgeted query limits.
- **Auto memory lifecycle**: `ensureMemorySystem()` auto-inits DB + auto-scans on first access. Budgeted memories auto-injected into system prompt every turn via `loadBudgetedMemory()`. `memory_feedback` AI tool lets the agent give feedback directly without human typing.

## [0.2.33] — 2026-06-17

### Fixed

- **REPL TDZ errors at startup**: Moved `restoreReadFileState` and `processInitialMessage` effect to before their dependent `const` declarations, fixing `Cannot access X before initialization` render errors. Added optional chaining for `initialMessages?.length` in dependency array. (`src/screens/REPL.tsx`)

## [0.2.32] — 2026-06-17

### Fixed
- Version now baked at build time via `prebuild-version.mjs` instead of reading `package.json` at runtime. Fixes `clew update` showing stale version for npm-global installs.

### Changed
- Removed stale `--define.MACRO.*` flags from package.json scripts (VERSION, PACKAGE_URL, FEEDBACK_CHANNEL, ISSUES_EXPLAINER). These values are now supplied by `src/generated/version.ts`, auto-generated before build/dev.

## [0.2.31] — 2026-06-17

### Changed

- **Install scripts auto-open terminal**: After installation, `install.sh` and `install.ps1` now open a new terminal window with `clew` ready to run — no need to manually open a new shell. (`scripts/install.sh`, `scripts/install.ps1`)
- **README install section**: Added one-liner install instructions (`curl | bash` and `irm | iex`) with the install scripts. (`README.md`)

### Fixed

- **Suppress blank assistant messages**: Filtered out assistant messages containing only system reminders so they do not render as empty `▶` bullet points in the terminal UI.
- **Fix provider/model session bleed**: `/providers set` without `--global` no longer writes to `provider.json`, preventing provider/model changes in one session from affecting other sessions. Only `--global` persists the selection. (`src/commands/provider-select/provider-select.ts`)
- **Remove sharp from optionalDependencies**: Sharp's install script fails on Windows without build tools. All sharp imports are dynamic with fallbacks — removed from package.json so `npm install -g clew-code` works everywhere. Install sharp separately for image processing features. (`package.json`, `src/tools/FileReadTool/imageProcessor.ts`)
- **Install scripts**: New `scripts/install.sh` (Unix) and `scripts/install.ps1` (Windows) that auto-install bun then run `bun install -g clew-code`. No manual setup needed. (`scripts/install.sh`, `scripts/install.ps1`)
- **Node 12 compatibility**: Use `||` instead of `??` in `bin/clew.cjs` to support Node.js 12 (npm's global shim runs the entry point with Node before spawning bun). (`bin/clew.cjs`)
- **`clew update` uses wrong package manager**: When clew was installed via `bun install -g`, running `clew update` still ran `npm install -g` — installing the new version in npm's global dir while the shell still found the bun-installed old version. Now uses the same package manager that installed it (`bun` vs `npm`). (`src/utils/autoUpdater.ts`)

## [0.2.28] — 2026-06-16

### Added

- **Personal profile overhaul**: Rewrote `PERSONAL_PROFILE_PROMPT` with delegation, memory-driven learning, proactive skill creation, scheduling, and autonomy instructions. Personal profile now acts as a personal AI control center. (`src/constants/profilePrompts.ts`)

- **`/delegate` bundled skill**: New personal profile skill for delegating coding work to a Codex worker via `process_peer`. Creates structured tasks with goal, scope, constraints, and validation. Aliases: `/code`, `/worker`. (`src/skills/bundled/personalDelegate.ts`)

- **Personal profile documentation**: New `docs/personal-profile.html` page covering delegation workflow, memory-driven learning, skill creation, scheduling, and coding vs personal profile comparison. Updated `docs/commands.html` with `/profile` command reference.

- **Streaming text display**: Removed Windows viewport yank bug gate that prevented real-time streaming text on Windows. Streaming text now shows full content character-by-character instead of line-by-line. (`src/screens/REPL.tsx`)

- **Cross-provider model context lookup**: `toProviderModelInfo()` now searches all provider registries for model context window info when the current provider doesn't have the model in its registry. Fixes missing `maxContext`/`maxOutput` for models like `deepseek-v4-flash-free` on OpenCode. (`src/services/ai/providerModels.ts`)

- **RTK (Rust Token Killer) integration**: BashTool now auto-detects `rtk` and wraps shell commands to compress output before it enters the context window. Reduces token consumption by 60-90% on common dev commands. (`src/utils/Shell.ts`)

### Removed

- **`/commit-push-pr` command, `PRTool`, `SuggestBackgroundPRTool`**: All git/PR tooling consolidated to `BashTool` for `git`/`gh` commands. Deleted `src/commands/commit-push-pr.ts`, `src/tools/PRTool/`, `src/tools/SuggestBackgroundPRTool/`. (ponytail: BashTool covers all git/PR operations, no need for wrappers)

- **`/mode` slash command**: Removed in favor of the existing `shift+tab` keyboard shortcut for mode switching. The command was duplicating functionality already covered by the shortcut. (ponytail: deletion over addition)

### Fixed

- **`clew update` showing wrong version / not updating**: Added missing `MACRO.VERSION`, `MACRO.PACKAGE_URL`, `MACRO.FEEDBACK_CHANNEL`, and `MACRO.ISSUES_EXPLAINER` compile-time defines to `dev`, `start`, and `build` scripts in `package.json`. These Bun `--define` constants were not being injected, causing the updater to compare against `undefined` and never detect or install the correct version.
- **Empty response retry for reasoning models**: `OpenAICompatibleAdapter.streamMessage` now catches `empty_response` errors and retries once without `reasoning_effort`. Some models (e.g. minimax-m3 via OpenAI-compatible proxy) return empty content when `reasoning_effort` is sent; the auto-retry bypasses this without per-model configuration. (ponytail: generic fix, no per-model config needed)
- Personal profile UI now redraws the frozen header as `Clew Personal`, hides the workspace path in condensed mode, and keeps the persona visible in the prompt footer.
- **GenerateImageTool ENOENT crash**: Replaced runtime `readFileSync` of `providers.json` with build-time JSON import, fixing `ENOENT: no such file or directory` when the bundled CLI resolves `import.meta.dirname` to `dist/` instead of `src/tools/GenerateImageTool/`.
- Assistant text now strips leading blank lines before Markdown render, so empty-looking `⏵` rows no longer appear ahead of the actual response text.
- API client debug messages now use the debug logger instead of `console.error`, preventing Ink from rendering internal stream diagnostics as blank assistant turns.
- **Moonshot/Kimi 400 on tool schemas**: `normalizeOpenAIToolInputSchema` no longer forces `type: "object"` at the root when the schema carries `anyOf`/`oneOf` (e.g. `z.union` / `z.discriminatedUnion` at the tool root). Fixes `tools.function.parameters is not a valid moonshot flavored json schema: when using anyOf, type should be defined in anyOf items instead of the parent schema` for `FileReadTool`, `PRTool`, `SendMessageTool`, etc.
- **Compaction crash on models without vision**: `stripImagesFromMessages` now also strips `video` content blocks (both top-level and nested in `tool_result`), fixing `model does not accept image or video input` errors on models like GLM-5.1 during `/compact`.
- **DeepSeek 400 on tool schemas with `anyOf`/`oneOf`**: Reverted the Moonshot/Kimi workaround from `normalizeOpenAIToolInputSchema` that dropped `type: "object"` for all providers with union schemas — this broke DeepSeek which requires it. Moonshot-specific type stripping is now done in the adapter's `convertToOpenAI` where provider-specific logic belongs.
- **Empty assistant response shows blank ▶**: `AssistantTextMessage` now shows `Model returned an empty response` (dimmed) instead of returning null and leaving a bare `▶` indicator when the model sends back no content. Also detects empty streams in the OpenAI-compatible adapter (`wrapStream`) and throws a structured `empty_response` error so users see a clear failure instead of a silent empty turn.

### Added

- **Bounded tool output + ReadArtifact tool**: Large tool outputs are truncated to 200 lines with the full output saved to disk. A `ReadArtifact(file_path, offset, limit)` tool allows the agent to read persisted outputs in line-based chunks, preventing context overflow from large logs.
- **Profile system** (`/profile`): Users can switch between `coding` (default — file editing, validation, implementation) and `personal` (command center — planning, task splitting, delegation to coding workers). Active profile is shown in the footer. Profile is persisted across sessions. Each profile remembers its last permission mode and restores it on switch (personal defaults to `ask`). Profile-specific prompts are injected into the system prompt to guide LLM behavior.
- **Video input support**: Users can now paste video files (mp4, mov, webm, etc.) into the REPL and send them to video-capable models (Gemini 3.1/2.5, GPT-5.5/5.4). Video blocks are converted to `image_url` base64 data URIs for OpenAI-compatible APIs. Includes paste handler detection, orphaned cleanup, history restore, and UI label rendering.
- **Image & Video generation tools**: Two new AI-callable tools — `GenerateImage` (DALL-E 3 / Imagen 3 / OpenRouter) and `GenerateVideo` (Runway Gen-4). Models can generate images and videos via tool use. Auto-discover image models from provider APIs. Auto-enabled when the respective API keys are configured (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `RUNWAY_API_KEY`).
- **Execution modes** (`/mode`): Five user-facing execution modes — `safe` (ask before edits), `yolo` (auto-approve normal tools), `afk` (auto-run + summarize), `review-only` (read only, no edits), `browser-safe` (browser allowed, no destructive bash). Footer shows current mode badge. Maps to existing permission modes underneath.
- **Goal system improvements**: `/goal` now integrates with AFK mode (auto-switch). Heuristic pre-check saves LLM evaluation cost (build exit code, test output, lint results). Goal templates (`/goal fix-build`, `green-tests`, `refactor`, `fix-lint`, `fix-typecheck`). Goal chains with `then` syntax (`/goal "lint passes" then "tests pass"`). Evaluator sees tool results directly.
- **Structured checkpoint system**: New `src/services/checkpoint/checkpointWriter.ts` — captures structured task state at 20%, 45%, and 70% progress milestones. Checkpoints record files modified, commands run, decisions made, blockers, and next steps. Integrated with QueryEngine turn counting and GoalState tracking.
- **Session rebuild from checkpoints**: Enhanced `src/services/compact/compact.ts` — when autoCompact runs, it first checks for existing checkpoints and rebuilds context from the latest checkpoint + delta messages. Falls back to LLM summarization if no checkpoints exist. Preserves more detail than pure summarization.
- **Automated Dream process**: New `src/services/longTermMemory/dream.ts` — 7-day memory consolidation cycle. Groups sessions from the past week, merges duplicate insights, deduplicates topic_index entries, creates weekly digests with patterns, and prunes low-value records. Runs automatically on session start.
- **Automated Distill process**: New `src/services/longTermMemory/distill.ts` — 30-day pattern extraction cycle. Analyzes weekly digests, identifies recurring patterns (file types, tool usage, problem categories), creates experience records, and generates reusable skill suggestions. Keeps 12 months of experiences.


## [0.2.22] — 2026-06-15

### Added

- **Team dashboard**: New `/team` slash command opens real-time dashboard of all in-process teammates with status, activity, tool/token counts, and drill-down detail view.
- **Teammate badge**: Footer bar now shows live count of running teammates (e.g. `2Tm`).
- **Memory store system**: New `src/context/memoryStore.ts` — persistent key-value context store with SQLite backend for agent-learned facts and preferences.
- **Auto-memory capture**: New `src/context/autoMemory.ts` — automatically captures lessons from FileEdit/Write/Bash tool results, extracts tags and decisions, and persists to memory store, knowledge graph, and session history with XP awards.
- **Memory UI components**: Ink TUI components for memory browsing (`MemoryList`), timeline (`MemoryTimeline`), and stats dashboard (`MemoryStats`) with activity sparklines and expertise XP bars.
- **Semantic search**: Embedding-based search in `src/memory/search.ts` using Xenova Transformers (`all-MiniLM-L6-v2`) as a boost on top of FTS5, with graceful fallback.

### Changed

- **Migrated `.claude/` → `.clew/`**: All project-level config (agents, skills, workflows, settings) moved from `.claude/` to `.clew/`. Source code strings updated across 40+ files. `.gitignore` updated to track `.clew/` instead of `.claude/`.

### Fixed

- Remove ⏵⏵ mode-change notification banner on permission switch
- Rebrand `/memory` description from "Edit Claude memory files" to "Edit Clew memory files"
- Fix `updateConfig` Zod v4 schema shape access (`_def.shape` is object, not method)

### Removed

- Remove `scripts/` directory from repository (already in `.gitignore`, ~2.5K lines deleted)
- Remove temp screenshot PNGs (`docs-index-check.png`, `docs-peer-check.png`) from root
- Remove `package-lock.json` (using `bun.lock` exclusively)
- Remove `index.json` cache and `scratch/` directory from root

## [0.2.16] — 2026-06-14

### Fixed

- **Auto-relaunch after update**: `UpdateDialog.startInstall()` now spawns a detached child process immediately after `bun/npm install -g` completes and exits — no more manual restart required. The new version launches automatically.

## [0.2.15] — 2026-06-14


## [0.2.14] — 2026-06-14

### Added

- **Peer task queue system**: `PeerServer` now supports queuing commands when busy (`/peer-exec`). Tasks are queued with priority levels (`low`/`normal`/`high`), auto-dequeued when the server is free, and exposed via `/peer-queue-status`, `/peer-queue-cancel`, `/peer-queue-cancel-all` endpoints with SSE queue events.
- **Peer health monitoring**: `peerHealth.ts` with `getPeerHealth()` (healthy/lagging/offline), `formatPeerLatency()`, and `summarizePeers()`. PeerStore tracks liveness ping latency (`latencyMs`), busy/queue state, and connection errors.
- **Long-term memory system**: New module `src/services/longTermMemory/` with auto-extraction (`autoExtract.ts`), session consolidation (`consolidate.ts`, `consolidator.ts`), cross-session history (`crossSession.ts`), timeline querying (`timeline.ts`), and `prompts.ts` — all exported via `index.ts`.
- **Session memory consolidation**: `src/services/SessionMemory/consolidation.ts` parses notes sections, de-duplicates redundant content, and compacts session memory into structured summaries.
- **Gemini Code Assist provider**: `CodeAssistProvider.ts` — OAuth-based Google Code Assist provider with token caching and project ID detection, registered as `google-assist` in `CLI_PROVIDER_DEFAULTS`.
- **Dashboard Monitor**: `DashboardMonitor.tsx` — real-time agent, daemon, and task execution monitor with tabbed views (queue, agents, timeline).
- **Fallback UI**: `fallbackUI.ts` — strips unsupported ANSI escape sequences on legacy Windows consoles (conhost.exe) and non-TTY terminals.
- **Windows terminal utilities**: `windowsTerminal.ts` (console detection, ANSI support checks) and `windowsEncoding.ts` (code page handling).
- **Local provider keys store**: `localProviderKeys.ts` for managing per-provider API keys.
- **Auto-relaunch on update**: `main.tsx` now spawns a child process before shutting down during auto-update, so the new version launches immediately without manual re-run.
- **Auto-ingest workspace memory**: `setup.ts` calls `autoIngestWorkspaceMemory(cwd)` asynchronously on startup to load workspace-level memories.

### Changed

- **peer → swarm rename**: All `src/commands/peer/` → `src/commands/swarm/` and docs (`peer.html` → `swarm.html`, `peer.th.html` → `swarm.th.html`). Import references updated across `commands.ts`, components, and tools.
- **PeerStore fields**: Extended `PeerInfo` with `isBusy`, `queueDepth`, `latencyMs`, `lastConnectionError`. On liveness pings, latency is measured via `performance.now()`.
- **`/agents` command registered**: New `agentsCmd` imported and added to the command registry.
- **Docs regenerated**: HTML docs rebuilt to reflect peer terminology and latest features.

### Fixed

- Fixed `displayName?.startsWith()` optional chaining in `PeerStore` (removed redundant `displayName &&` guard).

## [0.2.13] — 2026-06-13

### Changed

- **Formatting pass**: Trailing commas and line breaks fixed across the codebase via Biome.
- **bun.lock synchronized**: Lockfile updated to match updated `package.json` dependencies.

## [0.2.12] — 2026-06-13

### Added

- **PR #37 — Provider consolidation & Zod v4 migration**:
  - `GoogleProvider` and `ClewGatewayProvider` now extend `OpenAICompatibleProvider`, eliminating 679 lines of duplicated HTTP client/streaming/error-handling logic.
  - Deleted `GoogleAdapter.ts` (496 lines) — no longer needed after consolidation.
  - Migrated `.passthrough()` → `.loose()` and `z.object({}).passthrough()` → `z.looseObject({})` across 7 files for Zod v4 compatibility.
  - Refactored `PR` command and `PRTool` list/status to use `--json` + `JSON.parse` instead of `--jq`.
  - Renamed SDK type files `runtimeTypes.d.ts` → `runtimeTypes.ts` and `toolTypes.d.ts` → `toolTypes.ts` for consistency.
  - Updated dependencies: `@agentclientprotocol/sdk@^0.25.1`, `@ai-sdk/*`, `@anthropic-ai/sdk@^0.104.1`, `@aws-sdk/*@^3.1068.0`, `@commander-js/extra-typings@^15.0.0`, and others.

## [0.2.11] — 2026-06-13

### Fixed

- **UpdateDialog mascot removal**: Removed CLAWD mascot entirely to avoid terminal-dependent layout breakages on Windows and non-UTF-8 terminals.
- **UpdateDialog box border alignment**: Fixed layout by treating block characters (`─`, `│`) as double-width for proper box-drawing alignment.

## [0.2.10] — 2026-06-13

### Fixed

- **CLI early input capture during update dialog**: `cli.ts` now defers stdin listening until after the update dialog resolves, preventing the keyboard from freezing when the dialog appears.
- **UpdateDialog stdin consumption**: Removed `createInterface` call that was consuming stdin and blocking keypress events during the update prompt.

## [0.2.9] — 2026-06-13

### Fixed

- **UpdateDialog layout alignment**: Fixed layout misalignment in the update notification dialog and enabled arrow-key navigation for Yes/No options.

## [0.2.8] — 2026-06-12

### Added

### Fixed

- **`reasoning_effort` 400 error on unsupported models**: `getOpenAIReasoningEffort()` now checks both provider-level (`reasoningEffort` capability) and model-level (`reasoning` capability) before sending `reasoning_effort` to OpenAI-compatible APIs. If the model is not in the registry, `reasoning_effort` is skipped conservatively — preventing 400 errors on models like `codestral-latest`, `deepseek-v4-flash-free`, and `stepfun/step-3.7-flash:free`.

- **Update dialog not showing when npm is unavailable**: The auto-update system (`getLatestVersion()`, `getNpmDistTags()`) now has a 3-tier fallback strategy — tries `npm view` first, then `bun x npm` when running on Bun, and finally fetches directly from the npm registry HTTP API. This ensures the interactive update dialog appears even when users don't have `npm` installed. The silent `catch` in `main.tsx` was also replaced with a `logForDebugging` call so update failures are no longer swallowed without trace.

- **`installOrUpdateClaudePackage()` Bun fallback**: The local package installer now falls back to `bun install` when `npm install` fails and the runtime is Bun, instead of immediately returning `install_failed`.


## [0.2.8] — 2026-06-12

### Added

- **`ReadMediaFile` tool**: New capability-gated media input tool that sends image/video files as multimodal content blocks to the model. Availability is gated per-model by `imageIn`/`videoIn` capability flags — vision-free models never see the tool, preventing wasted tool_use blocks that the API would reject.
- **`imageIn`/`videoIn` capability fields**: Added to both `ModelCapabilities` and `ProviderCapabilities` interfaces (`providerRegistry.ts`) and populated for all 32 providers in `providers.json`. Each model entry now carries `imageIn: true/false` and `videoIn: false` (video support is opt-in; default off).
- **`video` content block type**: Added `{ type: 'video'; source; media_type }` to `ProviderContentBlock` union and wired through `contentBlockUtils.ts` (`fromAnthropicContentBlock` / `toAnthropicContentBlock`) so video blocks survive the Anthropic ↔ provider-agnostic conversion round-trip.
- **AnthropicAdapter video support**: `convertToOpenAI()` now handles `type: 'video'` content blocks (converted to `image_url` parts for OpenAI-compatible APIs). New `modelSupportsVideo()` method checks `videoIn` capability before sending.
- **AnthropicAdapter `imageIn` gating**: `modelSupportsVision()` now checks `imageIn` first (model-level, then provider-level), falling back to legacy `vision` flag for backward compatibility.

### Changed

- **ProviderManager exposed methods**: `getActiveProviderName()` and `getModelForProvider()` are now accessible from tool code, enabling tools like `ReadMediaFile` to check model capabilities at runtime.

## [0.2.7] — 2026-06-11

### Added

- **process_peer PTY terminal box UI**: When `mode: "pty"`, the tool progress now renders a bordered terminal-style Ink box showing provider, mode, cwd, elapsed time, and the command being run. PTY output is tailed with bounded recent-output buffer (16 lines) preserving ANSI SGR color while stripping unsupported terminal controls. Periodic progress updates keep elapsed time moving even when Codex produces no output.
- **`/peer run codex <task>` command**: New interactive command to run a one-shot Codex process peer directly from chat. Supports `-C, --cwd <dir>`, `-m, --model <model>`, and `-t, --timeout <seconds>` options.
- **Auto-update dialog**: Shows an update notification dialog before starting the Ink app when a newer npm version is available, with options to update or exit.
- **Model fetching from provider API**: API-fetched models now include `contextWindow`, `maxOutput`, `supportsTools`, `supportsVision`, `supportsReasoning`, and `free` fields parsed from API responses. Smart fallback between API data and static `providers.json` — API data takes priority, static fills gaps, with fuzzy model ID matching.
- **`/model list` capability tags**: Text output now shows per-model capability badges like `[200K ctx, vision, tools, reason, free]`.
- **`/model list` fetch timeout**: API model fetches now race against a 15-second timeout so a hung endpoint doesn't block the command.
- **Loading bar Unicode figures**: Added `█`, `▒`, `░`, `▔`, `▕` characters for custom progress rendering.
- **Message model display**: `MessageModel` component now shows provider label alongside model name (e.g. `OpenAI · gpt-5.5`) instead of the bare model string.
- **Cost in status line**: Total session cost is now shown in the status footer when spend is greater than $0.
- **GlimmerMessage gradient animation**: Rewritten shimmer animation with per-character color interpolation and fade-out effect at the tail end.
- **Added `displayCommand` field** to `ProcessPeerProgress` so the UI shows the logical command (e.g. `codex exec -C ...`) instead of the internal shell invocation.
- **Tool registry**: `ProcessPeerTool` registered in `getAllBaseTools()`.

### Changed

- **Model name rendering**: `renderModelName` now preserves `provider/model` format when the model contains a slash, instead of stripping the prefix.
- **Stats: sessionModel extraction**: Stats processing now prefers `message.sessionModel` for accurate provider and model extraction, improving aggregation accuracy across providers.
- **File edit message**: Updated file summary now shows compact `+N -M` format instead of verbose "Added N lines, Removed M lines" text.
- **PR merge strategy**: `gh pr merge` now uses `--squash` with the PR title as commit subject for cleaner history.
- **Mascot color UI**: Simplified color panel layout with section-cycle navigation and horizontal layout.
- **Anthropic API adapter**: OpenAI-compatible response path now correctly preserves the `provider` field and uses the more specific model name from the API response.

### Removed

- Removed unused `isCompact` variable.

## [0.2.6] — 2026-06-10

### Removed

- **GitHub Copilot provider**: Removed entire Copilot provider (CopilotProvider.ts, GitHubCopilotAuthFlow.tsx) and all copilot references from registry, provider list, onboarding, login, stats, model validation, and ComputerUseTool.
- **sharp from core dependencies**: Moved sharp to optionalDependencies so npm/bun install does not fail when native builds cannot compile. Added graceful fallback error in imageProcessor.ts.

### Added

- **User-visible Taste feedback**: Taste now shows notification toasts for init, learn, forget, suggest, auto-add, enable/disable actions. Added `onTasteFeedback` callback and `notifyTaste()` method. `recordEdit()` now triggers `processAutoLearn()`.
- **User-visible Peer feedback**: Added peerFeedback helper with REPL notification wiring. Peer tool calls now show progress and result notifications for discover, join, ping, run, send-message, list-roles, list-messages.
- **Peer HTTP liveness pings**: PeerStore now pings joined connections every 60s via `/peer-info`. Offline peers are marked immediately with `onPeerLost` callback instead of waiting 90s stale timeout.

### Changed

- **PeerSpawnTool**: Replaced `bun run start` with `clew` for spawning peer sessions.
- **`/agents` visual polish**: Redesigned AgentViewDashboard header with colored status dots, improved AgentViewRow column layout, cleaned up AgentViewGroupHeader with collapse arrows and counts, removed border clutter from AgentViewPeekPanel, and polished AgentsList dialog with cleaner agent grouping and typography.

## [0.2.5] — 2026-06-10

### Added

- **Provider and model selection**: Added `/providers` for session-level provider overrides and expanded provider/model picker behavior, including live provider support and Clew Gateway provider registration.
- **Ask User Question tool**: Added an interactive multiple-choice prompt tool with 2-4 options, multi-select support, optional previews, annotations, and channel-aware availability.
- **Memory search command**: Added `/memory search` for searching stored memory entries from the CLI.
- **Peer collaboration improvements**:
  - Added `peer_send_message` and peer help tooling for LAN peer workflows.
  - Added `PeerHelpTool` with discovery, messaging, roles, chunking, and request-response guidance.
  - Added peer auto-injection support so peer identity and status are sent automatically.
  - Show peer connection count in the status footer.
- **Taste tooling and UI**:
  - Added taste AI tools for learn, forget, profile, and suggest workflows.
  - Added taste system notifications when learned rules are applied.
  - Show taste briefs as chat system messages with rule summaries.
- **Agent and workflow enhancements**: Added agent command support, loop lock command support, and dynamic workflow runner/persistence improvements.
- **Documentation system**: Added `.clew/` config directory support and project `AGENTS.md` priority ordering.

### Changed

- Rebranded documentation and UI copy from Claude/Claude Code references to Clew Code.
- Rewrote README intro, commands, project layout, and changelog sections with a clearer feature narrative.
- Expanded multilingual README coverage and added Thai README/changelog content.
- Added Clew Code logo to README and refreshed Clew logo assets.
- Collapsed and reorganized command, project layout, peer, and taste documentation sections.
- Redesigned the buddy card as a Pokédex-style layout.
- Compacted all 15 peer tool result outputs into single-line success/failure summaries.
- Updated repository URLs from `JonusNattapong/ClewCode` to `ClewCode/ClewCode`.

### Fixed

- **`/providers` broken at runtime**: Fixed duplicate `const info` declaration in `provider-select.ts` that caused a runtime error preventing the provider picker from rendering.
- Fixed PR tool result mapping with `mapToolResultToToolResultBlockParam`.
- Fixed provider label ordering and fallback display in the model header.
- Fixed taste brief rendering so it appears as a proper chat system message instead of a task notification.
- Restored missing peer, loop, and MCP Thai documentation to git tracking.
- Updated AskUserQuestion result copy to say "Clew's questions" instead of the old product name.

## [0.2.4] - 2026-06-08

### Added

- **Peer-to-peer collaboration** (`/peer`): LAN peer discovery (UDP multicast + file registry), task delegation, role-based naming
  - 14 AI peer tools: discover, join, send_task, send_message, run, broadcast, ping, disconnect, list_tasks, list_roles, list_messages, set_name, set_role, share
  - Interactive PeerMenu with keyboard navigation
  - Inbound tasks/messages auto-inject into AI prompt
  - Compact single-line tool results with ✓/✗ markers
- **Taste AI tools** (4): taste_learn, taste_forget, taste_profile, taste_suggest
- **AGENTS.md support**: loads alongside CLAUDE.md at all levels (Managed, User, Project, Additional dirs)
- **`.clew/` config directory**: primary instruction/config directory — `AGENTS.md`, `CLAUDE.md`, and `rules/*.md` in `.clew/` load before `.claude/` variants (legacy fallback preserved)
  - User-level: `~/.clew/` via `getClewConfigHomeDir()` with `CLEW_CONFIG_DIR` env var support
  - Load order per directory: `AGENTS.md` → `CLAUDE.md` → `.clew/*` → `.claude/*`
- **Taste brief** — system message in chat when `<clew_taste>` injects rules
- **Autonomous agents** — agent loop, supervisor integration, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient highlight for "workflow" keyword
- **Model stats** — icon-based display with clickable provider switching

### Fixed

- PeerServer.start() made idempotent to fix "already started" error on `/peer share`
- PeerStore.getPeerByPort() now searches both discovered and connected peers
- Taste brief uses proper SystemMessage instead of task-notification

### Changed

- Dev script: `bun run dev` builds with `--external` flags before running

## [0.2.3] - 2026-06-07

### Fixed

- **Box-in-Text render error**: Fixed `<Box> can't be nested inside <Text>` crash in `AssistantToolUseMessage` when a tool's `renderToolUseMessage` returns a `<Box>` layout component (e.g. `PRTool`). The result is now handled based on type - strings are safely wrapped in `<Text>`, while React elements are rendered as siblings to avoid Ink's nesting constraint.

### Added

- **Peer system** (`/peer`): LAN + same-machine worker discovery and task assignment
  - `/peer share` - advertise as a worker (writes to temp dir + UDP multicast)
  - `/peer discover` - scan for workers (reads temp dir + LAN), shows hostname, IP, port, shell, cwd
  - `/peer list` - interactive worker table with keyboard navigation
  - `/peer todo <worker> <task>` - assign tasks to workers
  - `/peer todos` - view received tasks, `/peer todo done <id>` - mark complete
  - **File-based registry** for same-machine (OS temp dir) + **UDP multicast** for LAN
  - Each instance gets a unique peer ID (includes PID for multi-shell support)
  - Per-instance color from peer ID hash
  - New files: `src/peer/` (types, discovery, server, store) + `src/commands/peer/`

- **AI peer tools**: 6 new tools for autonomous worker coordination
  - `peer_discover` - AI scans for workers on LAN/same-machine
  - `peer_send_task` - AI assigns tasks to workers via HTTP POST
  - `peer_list_tasks` - AI checks pending/completed tasks
  - `peer_share` - AI can start/stop/check advertising
  - `peer_info` - AI gets detailed info about a specific peer
  - `peer_run` - AI runs shell commands on remote workers (with exec endpoint)
  - `peer_set_name` - AI assigns a custom display name to a worker
  - `peer_set_role` - AI assigns a role (builder, tester, deployer, etc.) to a worker
  - `peer_list_roles` - AI lists all workers with their names and roles
  - `/peer inbox` - View pending messages from peers; selecting one injects it into the AI prompt with `submitNextInput: true`

- **Effort support for all providers**: `/effort` now works with any provider that has `reasoningEffort: true` in its capabilities (NVIDIA, DeepSeek, OpenRouter, etc.)
  - `modelSupportsEffort()` checks provider registry for `reasoningEffort` capability in addition to Claude model name matching
  - `AnthropicAdapter.convertToOpenAI()` maps Anthropic `output_config.effort` → OpenAI `reasoning_effort` parameter, so effort settings are actually sent to the API

- **NVIDIA model fetching from API**: `/model` now fetches live models from NVIDIA's `/v1/models` endpoint instead of relying solely on `providers.json`
  - Added `nvidia` to `supportsModelFetching()` in `fetchProviderModels.ts`
  - When API-fetched models are available, they replace the static `providers.json` list entirely (API is source of truth)

- **Model picker capability display**: Shows context window, vision, tools, reasoning, and free tags per model

- **Taste auto-learn system**: New `src/services/taste/auto-learn/` module
  - `PatternDetector` - detects repeating coding patterns from accept/reject/edit events
  - `AutoLearnEngine` - manages suggestions with confidence tracking and cooldown
  - Auto-detection runs automatically on every signal (accept/reject), no manual trigger needed
  - `/taste suggest` - view detected patterns, `/taste suggest accept <id>` - add as rule, `/taste suggest reject <id>` - dismiss

- **AI-driven codebase analysis**: `/taste init` now analyzes git log, config files, and source samples via the current AI provider to generate 3-10 initial taste rules with confidence scores

- **Taste init progress bar**: ASCII progress bar animation during initialization (`████████░░░░░░░░░░░░ 40%`)

- **Relay server** (`src/remote/relay-server.ts`): WebSocket relay for cross-network remote control
  - `/remote listen --relay <url>` - host connects through relay
  - `/remote connect <url> --token <token> --relay` - connector connects
  - `/remote exec <command>` - execute commands on remote host

- **Dynamic workflow live subagent status**: Footer now shows running subagents in real-time
  - `◈ ultracode [2/5] ⟐coder ⟐researcher` - live per-subtask status
  - Runner saves "running" state to disk so the progress UI can poll it

- **Voice input via browser Web Speech API**: `/voice` now captures speech through Google Chrome's built-in speech recognition - no API keys needed. Clean card UI with waveform visualization, Record/Stop/Send buttons, 20+ languages. Auto-submits transcript via `/voice check`. See `src/services/voiceInput/`
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
- **Buddy rendering**: `CompanionSprite` no longer gated by compile-time flag - checks companion config directly; `/buddy hide` now respects `companion.visible` field
- **Ultra mode decoration**: When ultracode is active (via `/effort ultracode`), prompt input shows a purple double-line border with "ultra" label
- **PR badge refresh**: `usePrStatus` hook fetches immediately after a turn ends, so badge updates right after `gh` commands

### Changed

- **Model picker API-fetched capability display**: API-fetched models now show the same rich capability badges (`vision · tools · reasoning · free`) as static models
  - Extended `FetchedModel` interface with `supportsTools`, `supportsVision`, `supportsReasoning`, `maxOutput`, `free` fields
  - After fetching from API, capability data is merged from static `providers.json` by matching model IDs
  - `/model list` text output now shows capability tags like `[200K ctx, vision, tools, reason]`
  - Models not in `providers.json` still work - fall back to showing context window only

- **CLI hints rebranded from `claude` to `clew`**: All user-facing CLI command hints in exit messages, session manager, bridge, teleport, auth, MCP, plugins, and SSH output now reference `clew` instead of `claude`
  - Exit/resume messages now show `clew --teleport`, `clew remote-control --continue`
  - Session manager commands: `clew agents`, `clew attach`, `clew stop`, etc.
  - `clew auth login`, `clew mcp add`, `clew plugin install`, `clew ssh`
  - `clew --bg` for background sessions

## [0.2.2] - 2026-06-06

### Fixed

- **Stats provider aggregation**: `/stats` now correctly aggregates usage across multiple providers
  - Added `normalizeProviderId()` to map aliases (Bedrock→Anthropic, Vertex→Google, Grok→XAI, etc.) to canonical registry keys
  - Provider extraction now prioritizes model name format (`provider/model`) over unreliable message metadata
  - All merge paths (live + cache, cache-to-cache, filtered ranges) normalize provider IDs for consistent aggregation
  - Added provider breakdown in Overview tab showing tokens, percentage, and cost per provider
  - Models tab now correctly groups models by normalized provider ID

## [0.2.1] - 2026-06-06

### Added

- **Taste interactive menu** (`/taste`): Arrow-key navigable Dialog with 11 actions (learn, forget, profile, events, decay, eval, export, import, on, off, status). Spinner/loading state for async operations (decay, eval). Inline success messages. Pre-fills input for learn/forget/export via `nextInput`.
- **Edit validation via taste**: `validateEdit()` called in `FileEditPermissionRequest.tsx` - shows `⚠ Taste flagged this edit` warning in dialog title/question when edit violates learned rules.
- **Settings change subscription**: `subscribeToSettingsChanges()` called during `initTasteOnStartup()` - live-reloads taste config when `settings.json` changes.
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

## [0.2.0] - 2026-06-04

### Added

- **Guardian auto-review mode** (`/guardian`): LLM-based permission request reviewer using Haiku-class model. Routes boundary-crossing actions to a separate reviewer agent instead of pausing for user. Includes circuit breaker (3 consecutive denials → interrupt turn), rolling-window tracking (10/50), and custom policy support.
- **`/approve` command**: Override Guardian denials for one-time retry. Lists recent denials (up to 10) and allows selective override by ID.
- **`/pr` command**: Full GitHub PR lifecycle - create, list, view, review (AI diff analysis), merge, and CI status check.
- **Bridge v2 - Provider-agnostic Remote Control** (`/remote`): Direct WebSocket-based remote control without claude.ai OAuth. Includes RemoteServer (HTTP API + WebSocket), SHA-256 hashed one-time token store, RelayClient for NAT traversal, and REPL session bridging via `useRemoteBridge` hook.
- **Dynamic Workflow Bootstrap**: Wired ultracode globals into AppStateProvider and entrypoints. Interactive Y/n confirm hook for first-run cost warning.
- **Dynamic Workflow Progress UI**: Live progress component in PromptInputFooter showing subtask completion and verification status. Polls `.claude/runs/` every 3s.
- **Transcript classifier suggestion**: Context-aware suggestion - `/effort ultracode` for complex tasks, `/ultracode on` for moderate ones.

### Changed

- Bumped version to 0.2.0.
- AgentRunner uses role-specific system prompts (researcher cites files, verifier adversarial).
- Confirm hook now properly prompts user (Y/n) with 30s timeout.

---

## [0.1.3] - 2026-06-03

