# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Removed

- **`/mode` slash command**: Removed in favor of the existing `shift+tab` keyboard shortcut for mode switching. The command was duplicating functionality already covered by the shortcut. (ponytail: deletion over addition)

### Fixed

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

## [Unreleased]

## [0.2.16] — 2026-06-14

### Fixed

- **Auto-relaunch after update**: `UpdateDialog.startInstall()` now spawns a detached child process immediately after `bun/npm install -g` completes and exits — no more manual restart required. The new version launches automatically.

## [0.2.15] — 2026-06-14

### Added

- **ACP + Mesh integration**: `AcpMeshBoundary` (`src/acp-agents/AcpMeshBoundary.ts`) — shared execution boundary routing both editor ACP and REST ACP through the process peer / mesh layer with `AbortSignal` and `onProgress` support.
- **AcpRunController** (`src/acp-agents/AcpRunController.ts`) — lifecycle owner for ACP runs: creates run, wires `AbortController`, executes through mesh boundary, maps results to terminal state via `ACPRunManager`.
- **Terminal state guards**: `ACPRunManager` now prevents overwriting completed/failed/cancelled runs. `isTerminalStatus()` helper exported.
- **Cancel path**: Editor `session/cancel` and REST `DELETE /runs/:id` both route through `AcpRunController.cancel()` → `AbortController.abort()` → boundary returns `'Cancelled'`.
- **WebSocket transport**: `ACPWebSocketServer.ts` — Bun-native WebSocket server bridging remote editor connections to `AgentSideConnection` via NDJSON stream. `clew acp serve --port 3099` now starts WebSocket server.
- **SSE streaming**: `GET /runs/:id/stream` endpoint with 500ms polling, keepalive comments every 15s, auto-close on terminal state.
- **ACPMessageConverter fixes**: Added missing `content_encoding: 'plain'` and `created_at`/`completed_at` fields to match `acp-sdk` `Message`/`MessagePart` types.

### Changed

- **Editor ACP shapes fixed**: `PromptResponse` now returns only `{ stopReason }` (removed invalid `messages`/`error`). `sessionUpdate` uses `SessionNotification` shape with `agent_message_chunk` discriminated union.
- **REST ACP**: Replaced inline execution with `AcpRunController`. Fixed bug where missing provider called both `completeRun` AND `failRun`.
- **`acp-agents/index.ts`**: Exports `AcpRunController`, `runPromptThroughMesh`, `isTerminalStatus`, and their types.

### Fixed

- ACP REST fallback no longer produces both completed and failed states.
- `content_encoding: 'plain'` now present on all ACP MessagePart outputs.

## [0.2.14] — 2026-06-14

### Added

- **Peer task queue system**: `PeerServer` now supports queuing commands when busy (`/peer-exec`). Tasks are queued with priority levels (`low`/`normal`/`high`), auto-dequeued when the server is free, and exposed via `/peer-queue-status`, `/peer-queue-cancel`, `/peer-queue-cancel-all` endpoints with SSE queue events.
- **Peer health monitoring**: `peerHealth.ts` with `getPeerHealth()` (healthy/lagging/offline), `formatPeerLatency()`, and `summarizePeerMesh()`. PeerStore tracks liveness ping latency (`latencyMs`), busy/queue state, and connection errors.
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
- **Docs regenerated**: All HTML docs rebuilt to reflect swarm rename and latest features.

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

- **Agent Client Protocol (ACP) fully functional**: `@agentclientprotocol/sdk@0.25.0` — Clew Code now runs as a full ACP agent that editors like Zed can connect to.
  - `clew acp` (or `clew acp serve`) starts the ACP server — defaults to stdio mode for editor subprocess integration
  - `clew acp --port 15793` starts in WebSocket mode for remote connections
  - `clew --acp` CLI flag as backward-compatible alias
  - `session/prompt` executes prompts through the Codex process peer, sends `session/update` streaming notifications, and returns results with proper `stopReason`
  - `/acp start`, `/acp status`, `/acp sessions`, `/acp config` commands for managing the ACP server
  - `ACPStatusLine` component shows server status in footer with active session count
  - `ACPStatusManager` singleton tracks server state with signal-based subscriptions
  - Handles `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/list`, `session/delete`, `session/close`, `session/set_mode`, `session/set_config_option`, `logout`
  - New module `src/services/acp/`: `ACPServer.ts`, `ACPSessionManager.ts`, `ACPConfig.ts`
  - 5 unit tests for session management

- **Agent Communication Protocol (i-am-bee ACP) REST API server**: `acp-sdk@1.0.3` — Clew Code can now be used as an ACP/A2A-compatible agent via HTTP.
  - `clew --acp-rest [--acp-rest-port 8000]` starts the REST API server
  - `GET /agents` — agent discovery (returns clew-code manifest)
  - `POST /runs` — create and execute a task (runs via Codex process peer, returns `run_id` for polling)
  - `GET /runs/:id` — check run status and output
  - `DELETE /runs/:id` — cancel a running task
  - `GET /ping` — health check endpoint
  - CORS headers for cross-origin access
  - New files: `ACPRestServer.ts`, `ACPRestConfig.ts`

- **ACP agent client for external agents**: `ACPAgentClient` wraps the `acp-sdk` Client to discover and delegate tasks to external ACP/A2A-compatible agents.
  - `discoverAgents()`, `getAgent()`, `runAgentSync()`, `runAgentAsync()`, `runAgentStream()`, `getRunStatus()`, `cancelRun()`
  - New module `src/acp-agents/`: `ACPAgentManifest.ts`, `ACPRunManager.ts`, `ACPMessageConverter.ts`, `ACPAgentClient.ts`, `ACPRestServer.ts`, `ACPRestConfig.ts`
  - 10 unit tests for run management and message conversion

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
