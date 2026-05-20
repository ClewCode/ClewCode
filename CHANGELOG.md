# Changelog

All notable changes to this project will be documented in this file.

This project follows a practical changelog format based on:
- `Added` for new capabilities
- `Changed` for behavior, naming, architecture, or UX changes
- `Fixed` for bug fixes
- `Security` for permission, sandbox, auth, and trust-related hardening
- `Internal` for tests, types, refactors, and developer-facing implementation work
## [2.1.149] - 2026-05-21

### Added

- **Agent Runtime & Orchestration Engine (PLAN I)** — Local-first, durable orchestration engine for spawning, checkpointing, and executing complex multi-agent workflows.
  - **`src/agentRuntime/` Core Engine** — Includes `orchestrator.ts` driving agents through step-by-step state graph transitions, checkpointing state to disk, handling manual or automatic pause/resume, and routing handoffs between agent profiles.
  - **`runStore.ts` with Secret Scrubbing** — Saves and loads execution runs locally (`.ceph/runs/`) with robust token and key scrubbing rules, ensuring zero leakage of API keys (e.g., Google, Anthropic, custom keys) into diagnostic history logs.
  - **`toolGateway.ts` Security Layer** — Multi-permission agent capability gateway validating sandbox access and halting on guarded shell commands (e.g., destructive operations like `rm`, `push`) to request explicit human approval.
  - **`agentRegistry.ts` & `workflowRegistry.ts`** — Markdown frontmatter parser for `.ceph/agents/` configurations and YAML validator for `.ceph/workflows/` DAG pipelines.
  - **`reportBuilder.ts` Summarizer** — Generates standardized markdown outcomes summarizing agent steps, file changes, and test validations.
- **`/agent` CLI command suite** — Built-in slash command for comprehensive local agent management:
  - `/agent run "<prompt>"` starts a designated workspace agent workflow.
  - `/agent status` displays current background execution state and stats.
  - `/agent trace` shows color-coded step-by-step task logs.
  - `/agent pause` and `/agent resume` controls execution loops.
  - `/agent approvals` / `approve` / `deny` gates guarded shell commands and checkpoints interactively.
  - `/agent report` prints markdown diagnostic summaries.
  - `/agent doctor` tests configurations and workspaces health.

### Internal

- Registered `/agent` and `agentCmd` in `src/commands/agent/` and `src/commands.ts`.
- Added extensive agent execution tests in `tests/agentRuntime/agentRuntime.test.ts`.

## [2.1.148] - 2026-05-21


### Added

- **`/tools` slash command** — view real-time tool usage stats (call count, estimated token cost, last used time).
  - `/tools reset` clears the stats.
  - Usage tracking hooks into tool execution pipeline automatically.
- **`src/utils/toolUsageTracker.ts`** — module-level singleton tracking tool name, call count, input/output tokens, and timestamp.

## [2.1.147] - 2026-05-20

### Added

- **Self-hosted SearXNG search** — Docker-based SearXNG instance in `searxng/`.
  - `docker-compose.yml` with port 18889, writable config dir, and relaxed rate limiter.
  - Pre-configured `settings.yml` with JSON API enabled (DuckDuckGo, Google, Wikipedia, StackOverflow, GitHub engines).
  - Start/stop/restart/logs batch wrappers for Windows.
- **`/searxng` slash command** — `on`, `off`, `status`, `restart` subcommands.
  - Uses `docker compose ps -q` for reliable status checks on Windows (avoids Go template quoting issues).
  - Supports `start`/`stop`/`up`/`down` aliases.
- **Docs redesign** — "Terminal Luxe" theme across all 5 documentation pages.
  - Warm dark palette with amber/cyan accents, JetBrains Mono + DM Sans fonts.
  - Terminal window hero with typing animation and staggered line reveals.
  - Stats grid, feature cards with hover glow, callout blocks, noise texture overlay.
  - Shared sidebar navigation and responsive hamburger menu across all pages.
  - Consistent header/sidebar/footer layout replacing per-page inline CSS.

### Changed

- **Search provider auto-selection** — `selectBestDirectProvider()` no longer auto-selects public SearXNG instances (all return 403/429).
  - DuckDuckGo is now the default free fallback (always available, no API key).
  - SearXNG is only auto-selected when `SEARXNG_INSTANCE_URL` is explicitly set (self-hosted).
  - Applied consistently in both `WebSearchTool` and `MultiSearchTool`.
- **`.env`** — Added `SEARXNG_INSTANCE_URL=http://localhost:18889` for self-hosted discovery.
- **`.gitignore`** — `scratch/` replaces `scratch/index.json` to exclude Chromium browser cache.

### Removed

- **`scratch/` directory** — Deleted tracked Chromium cache (~700 files) including a leaked Google API key (`AIzaSyA2KlwBX3mkFo30om9LUFYQhpqLoa_BNhE`).

### Internal

- Removed `searxng` from search provider auto-select priority in `WebSearchTool.ts` and `MultiSearchTool.ts`.
- Registered `/searxng` command in `src/commands/searxng/` and `src/commands.ts`.
- Created `docs/features/searxng-search.html` documentation page.

## [2.1.146] - 2026-05-19

### Added

- **Profile system** — built-in multi-profile isolation using `~/.claude/profiles/<name>/`.
  - Each profile has its own `provider.json`, `settings.json`, sessions, memory, and credentials.
  - Global config (`~/.claude.json`) stays shared across profiles (OAuth tokens, user ID, theme).
  - New `/profile` command with interactive Ink picker: navigate with ↑↓, Enter to switch, `d` to delete, `q` to quit.
  - New `--profile <name>` CLI flag for one-shot profile selection.
  - Profile resolution priority: `CLAUDECODE_PROFILE` env var > `--profile` flag > `active-profile` file > default (no profile).
  - Added `src/utils/profileManager.ts` — ProfileManager singleton with CRUD operations.
  - Added `src/utils/profileManager.test.ts` — 23 tests covering all operations.
  - `getClaudeConfigHomeDir()` is now profile-aware; falls back to `~/.claude/` when no profile is active.

### Changed

- **Cross-provider structured outputs** — `modelSupportsStructuredOutputs()` now returns `true` for non-Anthropic providers.
  - `AnthropicAdapter`: maps `output_config.format` → OpenAI `response_format` (json_schema).
  - `GoogleAdapter`: maps `output_config.format` → Gemini `generationConfig.response_mime_type` + `response_schema`.

## [2.1.145] - 2026-05-19

### Breaking / Migration Notes

- Rebranded the project-facing name from **Claude Code** / **dek1milliontoken** to **Ceph Code** across README, docs, terminal UI, onboarding, trust dialogs, stats, and logo components.
- Renamed the npm package metadata from `@jonusnattapong/claudecode` to `cephcode`.
- Added the direct global binary mapping:

  ```json
  {
    "bin": {
      "cephcode": "./dist/main.js"
    }
  }
  ```

- Updated install and launch examples from:

  ```bash
  npm install -g @jonusnattapong/claudecode
  bun install -g @jonusnattapong/claudecode
  claude
  ```

  to:

  ```bash
  npm install -g cephcode
  bun install -g cephcode
  cephcode
  ```

### Added

- Added **KiloCompact**, a local context compaction engine under `src/services/compact/kiloCompact.ts`.
  - Collapses verbose directory trees, glob outputs, stack traces, and large text dumps locally.
  - Consolidates redundant failed tool runs.
  - Applies keyword-based semantic pruning while preserving protected early and recent turns.
  - Returns compaction metadata: original token estimate, new token estimate, and compaction status.
- Added KiloCompact tests covering:
  - verbose directory/tree output snipping,
  - sequential failed tool-state consolidation,
  - token reduction behavior,
  - skip behavior when history is already below the target token budget.
- Added `/resume <N>` support.
  - A numeric argument resumes the latest conversation with only the last `N` user/assistant exchanges.
  - Example: `/resume 10`.
- Added `--resume <N>` CLI support.
  - Allows resuming the latest conversation with a limited history window.
  - Supports combining numeric resume limits with explicit session IDs where applicable.
- Added `limitMessagesToLastNExchanges()` in `src/utils/messages.ts`.
  - Walks message history backward and keeps only the last `N` user exchanges.
  - Used by both `/resume <N>` and `--resume <N>`.
- Added `sliceMessagesByUserLimit()` helper for user-turn-based message slicing.
- Added recent model tracking for the `/model` picker.
  - Recently used models are stored in the `recentModels` user setting.
  - Recent model list is capped at 5 entries.
  - Recent models are surfaced near the top of the picker for faster switching.
- Added `src/utils/model/recentModels.ts`.
  - Provides `getRecentModels()` and `addRecentModel()`.
- Added a dedicated statusline spinner mode.
  - Uses arc frames: `['◜', '◠', '◝', '◞', '◡', '◟']`.
  - Runs at 80ms for smoother statusline animation.
- Added background session improvements:
  - `claude ps`, `stop`, `attach`, and `--bg` now work at runtime, not only in build-time paths.
  - Added `--name` support for background sessions.
  - `/resume` now marks background sessions with a `[bg]` badge.
  - Background agent completion notifications now include elapsed duration.
- Added stream-stall recovery.
  - Pre-response stream stalls retry streaming once before falling back to non-streaming mode.
- Added clearer background gate messages.
  - `claude agents` and `--bg` rejection messages now name the specific gate, such as non-TTY or environment-variable restrictions.
- Added `/usage-credits` command.
  - Keeps `/extra-usage` as an alias.
- Added plugin metadata display improvements.
  - `/plugin browse` and plugin discovery now show last-updated timestamps.
- Added doctor guidance for hook misconfiguration.
  - Missing hook `command` fields now show an exec-form example.
- Added post-survey follow-up hint after every non-dismiss survey response.

### Changed

- Updated README title and introduction to use **Ceph Code**.
- Updated docs homepage title, hero text, install snippets, launch command, and footer branding to use **Ceph Code**.
- Updated `LICENSE.md` modification attribution from `dek1milliontoken contributors` to `Ceph Code contributors`.
- Updated onboarding command description from “configure Claude Code” to “configure Ceph Code”.
- Updated onboarding wizard title to **Ceph Code Setup Wizard**.
- Updated trust dialog wording to say **Ceph Code** will be able to read, edit, and execute files.
- Updated stats loading and empty-state copy to use **Ceph Code**.
- Updated `LogoV2` and `CondensedLogo` titles from **Claude Code** to **Ceph Code**.
- Updated `/resume` command argument hint from:

  ```txt
  [conversation id or search term]
  ```

  to:

  ```txt
  [conversation id or search term or number of messages]
  ```

- Changed `/model` behavior so model selection applies to the current session, while pressing `d` sets the default.
- Changed resumed sessions to preserve the model they were using through the `sessionModel` transcript field.
- Changed statusline context usage handling.
  - The context bar now freezes to the last known non-zero usage instead of collapsing to `0%` during thinking, tool execution, or early streaming phases.
- Changed permission-mode cycling behavior.
  - `bypassPermissions` no longer immediately follows `auto`.
  - Permission cycling is now more explicit and less surprising across `default`, `ask`, `plan`, `auto`, `bypassPermissions`, and `dontAsk`.
- Changed spinner behavior so custom `spinnerVerbs` are not applied to post-turn duration messages.

### Fixed

- Fixed startup hangs caused by slow side-channel API calls.
  - Side-channel API calls now timeout after 15 seconds instead of waiting up to 75 seconds.
- Fixed MCP `tools/list` pagination.
  - Paginated responses using `nextCursor` are now handled.
- Fixed MCP SVG image handling.
  - Unsupported MIME types such as SVG are saved to disk instead of crashing.
- Fixed MCP config error visibility.
  - `claude mcp list` now shows configuration parse errors.
- Fixed grep-style command exit handling.
  - `egrep`, `fgrep`, `git grep`, and `git diff` exit code `1` are no longer treated as hard failures when the command semantics allow it.
- Fixed read-before-edit checks for `head` and `tail`.
  - Files viewed through `head` or `tail` now satisfy the read-before-edit requirement.
- Fixed image extension mismatch handling.
  - Files with incorrect image extensions can fall back to text handling instead of failing.
- Fixed skill file watcher file-descriptor exhaustion.
  - Non-Markdown files inside skill directories no longer trigger unnecessary reloads.
- Fixed session-title generation.
  - Task-notification messages are excluded from title input.
- Fixed skill usage in headless/non-interactive mode.
  - Skills are auto-allowed in SDK and non-interactive paths where prompts cannot be shown.
- Fixed side-query model fallback with custom `ANTHROPIC_BASE_URL`.
  - Side queries fall back to the main-loop model where appropriate.
- Fixed plugin cache-miss errors.
  - “Not cached” now shows an actionable `claude plugin install` hint.
- Fixed VS Code rendering glitches by reducing spinner animation color count.
- Fixed Windows background commands.
  - `claude ps`, `stop`, `attach`, and `--bg` work correctly on Windows.
- Fixed `/branch` after worktree entry.
  - The command now falls back to the original CWD transcript path.
- Fixed IDE model sync.
  - Model changes through the IDE picker now apply at runtime through `applySettingsChange`.
- Fixed `Ctrl+C` behavior in `!` commands.
  - Interrupting a shell command now kills the running process correctly.
- Fixed scrolling in attached background sessions.
  - `PgUp` and `PgDn` now work in attached background session views.
- Fixed redundant provider display in welcome/logo UI.
  - Provider prefixes are stripped where they would otherwise duplicate provider labels.

### Security

- Updated trust and safety copy to reflect the Ceph Code name.
- Improved permission-mode cycling to reduce accidental bypass-mode transitions.
- Improved background-mode rejection messages so unsafe or unsupported execution gates are clearer.

### Internal

- Extended `LocalJSXCommandContext.resume()` to accept an optional message limit.
- Updated REPL resume flow to apply the message limit after deserializing resumed messages.
- Added CLI parsing logic for numeric `--resume` values.
- Added settings schema support for `recentModels`.
- Added model picker option reordering:
  - default option first,
  - recent models next,
  - remaining deduplicated provider models,
  - custom model input last.
- Added KiloCompact implementation and tests.
- Updated package metadata, README, docs, license, onboarding, logo, stats, trust dialog, statusline, REPL, command types, message utilities, and permission-mode utility.

### Notes

- KiloCompact is present as a local compaction engine and has tests, but it should still be checked for integration with the main `/compact` or automatic context-compaction flow.
- `addRecentModel()` is currently called from multiple model-selection paths. The recent-model helper deduplicates entries, but the write path can still be cleaned up to avoid redundant settings writes.

## [2.1.139] - 2026-05-13

### Added

- Added subagent API headers.
  - Subagent API requests now include `x-claude-code-agent-id` and `x-claude-code-parent-agent-id`.
  - OTEL `llm_request` spans now include `agent_id` and `parent_agent_id`.
  - Parent agent ID is captured at subagent creation time.
- Added OAuth gating when API-key override is active.
  - Remote-control-dependent features are disabled when `ANTHROPIC_API_KEY`, `apiKeyHelper`, or `ANTHROPIC_AUTH_TOKEN` is set.
  - claude.ai MCP connectors are gated by the same API-key override check.
- Added compaction prompt protection for sensitive instructions.
  - Compaction now explicitly preserves sensitive user instructions verbatim.
- Added Ctrl+Shift+T as fallback thinking-mode hotkey on macOS when Option is not bound as Meta.

### Fixed

- Fixed keybinding validation for `cmd`, `super`, and `win` modifiers.
- Fixed settings hot-reload for symlinked `~/.claude/settings.json`.
  - The watcher now resolves real paths before watching.
- Fixed sandbox auto-allow behavior with shell expansions such as `$VAR` and `$(cmd)`.
- Fixed Ctrl+Z hangs in `npx` and `bun run` wrappers.
  - Added explicit SIGTSTP handling to exit alternate screen and stop correctly.
- Fixed diff truncation line-count off-by-one behavior.
- Fixed regex metacharacters in skill argument names.
  - Skill argument names are now escaped before substitution.

## [2.1.137] - 2026-05-12

### Added

- Added bundled `/commit` skill for conventional commit workflows.
- Added per-model provider tracking in model usage.
  - `/stats` now displays the correct provider prefix per model.
- Added short display mode to `renderModelName()` for model-only display.

### Fixed

- Fixed Backspace and Ctrl+Backspace behavior after Ctrl+G by resetting Kitty keyboard protocol mode on alternate-screen exit.
- Fixed `/resume` tab-complete behavior.
  - `/resume` now reliably shows the picker dialog instead of immediately resuming.
- Fixed idle sub-agent summaries repeating every 30 seconds.
  - After three identical summaries, the interval extends to 5 minutes.
- Fixed claude.ai MCP connectors after `/clear`.
  - `claudeai-proxy` servers now skip the needs-auth cache.
- Fixed fork transcript creation with dangling `tool_use` blocks.
- Fixed `/stats` display for unknown model names.
  - Unknown models now show only the provider label instead of `Provider: unknown`.
- Fixed statusline percentage dropping to `0%` during streaming.
- Added max context-window display to the statusline.

## [2.1.136] - 2026-05-12

### Added

- Added `clearAllMcpServerCaches()`.
  - Disposes cached MCP connections.
  - Clears tool, resource, and command caches.
  - Runs automatically on `/clear`.
- Added retry behavior when an MCP server advertises tools but `tools/list` returns zero tools.
- Added MCP `alwaysLoad` support through `_meta['anthropic/alwaysLoad']`.
- Added reconnect summary notifications for MCP reconnect events.
- Added plugin orphan-version in-use detection.
- Added `DEFAULT_TOKEN_TTL_S` constant for OAuth token expiry fallback.
- Added Brief mode retry logic to recover from plain-text model responses.
- Added Focus Mode system prompt for non-interactive sessions.
- Added `/team-onboarding` command.
- Added automatic default cloud environment creation in `teleportToRemote`.
- Added interactive Google Vertex AI setup wizard on the login screen.
- Added `CLAUDE_CODE_PERFORCE_MODE` for read-only handling in Perforce environments.
- Added `Monitor` tool for streaming events from background scripts.
- Added Linux subprocess sandboxing with PID namespace isolation.
- Added `--exclude-dynamic-system-prompt-sections` flag to print mode.
- Added `workspace.git_worktree` to statusline JSON input.
- Added W3C `TRACEPARENT` env var to Bash tool subprocesses for OTEL tracing.
- Added `defer` permission decision to PreToolUse hooks for headless session pausing.
- Added `CLAUDE_CODE_NO_FLICKER=1` for flicker-free alternate-screen rendering.
- Added `PermissionDenied` hook for auto-mode classifier denials with retry support.
- Added named subagents to @-mention typeahead suggestions.
- Added `MCP_CONNECTION_NONBLOCKING=true` to skip MCP connection wait in `-p` mode.
- Added `/buddy` command.
- Added `/env` support to PowerShell tool commands.
- Added image paste support without trailing space.
- Added `!command` paste support to enter bash mode.
- Added `/powerup` interactive lessons.
- Added `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE`.
- Added `.husky` to protected directories in accept-edits mode.
- Added MCP tool-result persistence override through `_meta["anthropic/maxResultSizeChars"]`, up to 500K.
- Added `disableSkillShellExecution` setting for skills and plugins.
- Added multi-line prompt support in `claude-cli://open?q=` deep links.
- Added plugin `bin/` executable support.
- Added Amazon Bedrock powered by Mantle through `CLAUDE_CODE_USE_MANTLE=1`.
- Added compact Slack `#channel` header for Slack MCP tool calls.
- Added `keep-coding-instructions` frontmatter support for plugin output styles.
- Added `hookSpecificOutput.sessionTitle` support to `UserPromptSubmit` hooks.
- Added focus view toggle with Ctrl+O in `NO_FLICKER` mode.
- Added `refreshInterval` statusline setting.
- Added `● N` running indicator in `/agents`.
- Added Cedar policy syntax highlighting.

### Changed

- Reworked MCP concurrent call timeout handling.
  - Replaced shared SDK timeout with per-call `AbortController` and `Promise.race` isolation.
- Improved MCP server reconnect behavior.
  - `connectToServer` retries transient errors up to 3 times with exponential backoff.
- Changed MCP default OAuth `expires_in` fallback from 1 hour to 24 hours.
- Improved MCP OAuth DCR metadata.
  - Dynamically advertises `client_secret_post` when `--client-secret` is configured.
- Added environment-variable expansion for MCP `headersHelper`.
- Improved OAuth empty-body handling for HTTP 204 responses.
- Fixed plugin MCPB Windows path handling by using platform-native separators.
- Improved npm plugin update detection for specific requested versions.
- Improved plugin hook version locking.
- Improved auth-error routing to `needs-auth`.
- Improved `headersHelper` auth visibility and retry behavior.
- Improved plugin reinstall behavior so the root plugin is always re-cached.
- Improved API error reporting for Anthropic refusal reasons.
- Improved tool-not-available messages.
- Stabilized `tsconfig.json` for stricter type-checking and modern JSX.
- Improved LSP client identification.
- Improved `/resume` filter hint labels and Vim-mode navigation.
- Improved `/agents` with Running/Library tabs.
- Improved `/reload-plugins` to pick up skills without restart.
- Improved accept-edits mode for safe filesystem commands and wrappers.
- Improved PowerShell tool prompts.
- Changed Edit behavior to work on files viewed through Bash commands such as `sed` and `cat`.
- Disabled thinking summaries by default in interactive sessions.
- Changed hook output over 50K characters to be saved to disk instead of injected into context.
- Improved @-mention typeahead ranking.
- Improved Bash tool warnings when formatter or linter commands modify read files.
- Improved performance by reducing redundant JSON serialization and optimizing SSE transport.
- Improved `/resume` all-projects view with parallel loading.
- Changed `--resume` picker to hide sessions created by `claude -p` or SDK invocations.
- Removed DNS cache commands from auto-allow for privacy.
- Improved `/claude-api` skill guidance.
- Improved performance by routing `stripAnsi` through `Bun.stripANSI`.
- Reduced Edit tool output tokens by using shorter `old_string` anchors.
- Changed default effort level from medium to high for most users.
- Improved plugin skill naming for `"skills": ["./"]`.
- Improved `--resume` support for same-repo worktrees.
- Improved auto mode and bypass-permissions mode for sandbox network access.
- Improved macOS sandbox network `allowMachLookup`.
- Improved image handling with consistent compression budgets.
- Improved slash command and @-mention completion for CJK punctuation.
- Improved Bridge sessions with local git info on claude.ai session cards.
- Improved footer layout and transient notifications for low-context warnings.
- Improved markdown blockquote rendering.
- Optimized session transcript size and accuracy.

### Fixed

- Fixed OAuth timeout/cancel unhandled promise rejections.
- Fixed MCP URL wildcard case sensitivity.
- Fixed Bun build failures from optional dependencies by adding external declarations.
- Fixed `MonitorTool` reassignment of a `const`.
- Fixed `MonitorPermissionRequest` import path.
- Changed unhandled rejection behavior to log-only instead of forcing shutdown.
- Fixed TypeScript lint errors in the core query loop and prompt generation.
- Fixed global type declarations for `MACRO` properties.
- Fixed Bash permission bypasses around env vars and redirects.
- Fixed stalled streaming responses timing out.
- Fixed 429 exponential backoff handling.
- Fixed MCP OAuth config override and token refresh issues.
- Fixed terminal character casing and keyboard protocol issues.
- Fixed macOS text replacement and directory permission revocation bugs.
- Fixed crashes, memory leaks, and UI glitches in fullscreen and voice modes.
- Fixed managed-settings and agent-team permission inheritance.
- Fixed false-positive VS Code “requires git-bash” errors on Windows.
- Fixed Edit/Write CRLF doubling on Windows.
- Fixed Markdown line-break stripping.
- Fixed StructuredOutput schema cache failure rates.
- Fixed LSP zombie state after crashes.
- Fixed `/stats` token undercounting by including subagent usage.
- Fixed autocompact thrash loops in extremely long sessions.
- Fixed voice-mode microphone permission on macOS Apple Silicon.
- Fixed Edit/Read allow rules to check resolved symlink targets.
- Fixed WebSocket 101 voice-mode error on Windows.
- Fixed prompt cache misses from tool-schema changes.
- Fixed nested `CLAUDE.md` reinjection.
- Fixed Devanagari and combining-mark truncation.
- Fixed rendering artifacts after layout shifts.
- Fixed infinite loop in rate-limit options dialog.
- Fixed `--resume` prompt-cache misses with deferred tools or MCP servers.
- Fixed Edit/Write failures when format-on-save hooks rewrite files between edits.
- Fixed PreToolUse hooks with code 2 not blocking correctly.
- Fixed auto mode ignoring explicit user boundaries.
- Hardened PowerShell permission checks.
- Fixed transcript chain breaks on `--resume`.
- Fixed `cmd+delete` line deletion behavior.
- Fixed plan mode in remote sessions after container restart.
- Fixed settings schema validation for `permissions.defaultMode: "auto"`.
- Fixed Windows version cleanup protecting active rollback copies.
- Fixed `/feedback` disappearing without explanation.
- Fixed agents appearing stuck after 429 responses with long `Retry-After`.
- Fixed Console login on macOS when keychain is locked.
- Fixed plugin skill hooks in YAML frontmatter.
- Fixed plugin hooks when `CLAUDE_PLUGIN_ROOT` was not set.
- Fixed `${CLAUDE_PLUGIN_ROOT}` resolving to marketplace source instead of cache for local plugins.
- Fixed scrollback diff repetition and blank pages in long sessions.
- Fixed multiline user prompt indentation in transcripts.
- Fixed Shift+Space in search inputs.
- Fixed hyperlinks opening twice in tmux/xterm.js.
- Fixed multiple `NO_FLICKER` crashes, rendering artifacts, memory leaks, scrolling issues, and CJK text garbling.
- Fixed `FORCE_HYPERLINK` being ignored in `settings.json`.
- Fixed terminal cursor tracking in dialogs.
- Fixed Bedrock SigV4 authentication with empty auth env vars.
- Fixed SDK/print mode losing partial responses on interruption.
- Fixed UTF-8 sequence splitting in stream-json I/O.
- Fixed subagents leaking working directory back to the parent session.
- Fixed compaction writing duplicate transcript files on retry.
- Reduced VS Code cold-open subprocess work.
- Fixed VS Code dropdown selection bugs.
- Added VS Code warning banner for `settings.json` parse failures.

### Security

- Hardened Bash tool permission checks.
- Hardened PowerShell permission checks.
- Removed privacy-sensitive DNS cache commands from auto-allow.
- Improved auto-mode boundary enforcement.
- Improved sandbox network handling.
- Improved auth-failure classification for MCP and OAuth paths.

## [2.1.97] - 2026-05-11

### Added

- Baseline public release with major CLI, provider, tool, MCP, plugin, session, and UI functionality.

## [0.0.1] - 2026-05-11

### Added

- Initial release with core terminal AI coding assistant functionality.
