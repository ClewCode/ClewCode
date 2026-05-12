# Changelog

All notable changes to this project will be documented in this file.

## [2.1.137] - 2026-05-12

### Added

- **Bundled /commit skill**: New skill for Claude in Chrome compatibility with conventional commit messages.
- **Per-model provider tracking**: ModelUsage now records which provider was used for each model. /stats displays the correct provider prefix per model.
- **renderModelName() style parameter**: Supports short mode for model-only display (no provider prefix).

### Fixed

- **E18**: Backspace/Ctrl+Backspace swapped after Ctrl+G - reset Kitty keyboard protocol mode on alt-screen exit.
- **E62**: /resume now always shows the picker dialog, preventing tab-complete from immediately resuming.
- **E80**: Idle sub-agent summaries no longer fire every 30s. After 3 identical summaries, the interval extends to 5 minutes.
- **E82**: claude.ai MCP connectors survive /clear - claudeai-proxy servers skip the needs-auth cache.
- **E96**: Fork transcript no longer creates invalid transcripts with dangling tool_use blocks.
- **/stats**: unknown model name now shows just the provider label instead of Provider: unknown.
- **Status line**: Percentage no longer drops to 0% during streaming. Added max context window display.



## [2.1.136] - 2026-05-12

### Changed

- **MCP Concurrent Call Timeout Disarming**: Replaced shared SDK timeout with per-call `AbortController` + `Promise.race` isolation. Each tool call now has independent timeout tracking — one call's watchdog can no longer overwrite another's.
- **MCP Server Retry on Transient Errors**: `connectToServer` now retries up to 3× with exponential backoff on transient errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, EPIPE, EHOSTUNREACH, ESRCH) before marking a server as failed.
- **MCP default `expires_in` TTL**: Changed from 3600s (1h) to 86400s (24h) to prevent unnecessary re-auth cycles when OAuth servers omit `expires_in`.
- **MCP OAuth client_secret_post**: DCR metadata now dynamically advertises `client_secret_post` when a `--client-secret` is pre-configured, instead of always claiming `none`.
- **MCP headersHelper env var expansion**: Header values containing `${ENV_VAR}` placeholders are now expanded before being sent in requests.
- **MCP OAuth 204 No Content**: `normalizeOAuthErrorBody` now returns early for HTTP 204 responses instead of crashing on empty-body JSON parse.
- **Plugin MCPB Windows path handling**: Changed hardcoded `pathSeparator: '/'` to platform-native `sep`, fixing MCP server spawn on Windows.
- **Plugin npm update detection**: `installFromNpm` now forces npm install when a specific version is requested, instead of reusing a stale global cache.
- **Plugin hooks version locking**: Orphaned plugin versions with active registered hooks are no longer deleted during cache cleanup.
- **Auth error keyword detection (D4)**: Extended 401 detection to include OAuth/token/auth keywords, routing more auth failures to `needs-auth` instead of `failed`.
- **MCP headersHelper auth visibility (D27)**: SSE/HTTP servers with `headersHelper` now route connection failures to `needs-auth` instead of `failed`, so the UI shows Authenticate/Re-authenticate actions.
- **MCP headersHelper stuck-in-auth fix (D28)**: Servers with `headersHelper` skip the 15-min needs-auth cache, allowing instant retry when the helper script produces fresh credentials.
- **Custom headers servers stuck-in-auth fix (D28)**: Same skip for SSE/HTTP servers with `headersHelper`: transient 401s no longer get stuck in `needs-auth` for the full cache TTL.
- **Plugin re-install re-resolves dependencies**: `resolveDependencyClosure` explicitly ensures the root plugin is never skipped in the `alreadyEnabled` check, so re-installing a plugin always re-caches it.

### Added

- **`clearAllMcpServerCaches()`**: New export that disposes all cached MCP connections and clears tool/resource/command caches. Called automatically on `/clear` to prevent stale connections from reappearing.
- **MCP 0-tools retry**: When `tools/list` returns empty despite the server advertising tool support, the client retries once after 1s.
- **MCP `alwaysLoad` support**: Tools with `_meta['anthropic/alwaysLoad']` now skip tool-search deferral and are always loaded.
- **MCP reconnect summary notification**: Reconnect events show a count summary ("N tools") instead of re-announcing the full tool list.
- **Plugin orphan version in-use detection**: `isPluginVersionInUse()` checks registered hooks before deleting orphaned plugin versions.
- **`DEFAULT_TOKEN_TTL_S` constant**: Centralized default TTL for OAuth token expiry when servers omit `expires_in`.

### Fixed

- **Unhandled promise rejection on OAuth timeout/cancel**: Added `.catch(() => null)` to `Promise.race` branches that race OAuth promises, preventing orphan rejections when the other branch wins first.
- **MCP URL wildcard case-sensitivity**: `urlPatternToRegex` now uses the `i` flag so `*://MyServer.COM/*` matches lowercase URLs.
- **Bun build: added --external for missing optional deps**: Added `--external` flags for `@anthropic-ai/*`, `@aws-sdk/*`, `sharp`, and other optional packages that fail `bun build`.
- **MonitorTool `const` reassignment**: Fixed `Cannot assign to "task" because it is a constant` in `MonitorTool.tsx`.
- **MonitorPermissionRequest import path**: Corrected `../../ink.js` → `../../../ink.js` for the nested directory depth.
- **Unhandled rejection causing process exit**: Changed `unhandledRejection` handler to log-only (no `gracefulShutdownSync(1)`) since many pre-existing unhandled rejections (e.g. git API changes, optional backend timeouts) were previously silent.

### Added

- Implemented Brief mode retry logic to automatically recover from plain-text model responses.
- Added Focus Mode system prompt for non-interactive sessions to ensure comprehensive final summaries.
- Created `/team-onboarding` command for streamlining teammate ramp-up.
- Implemented auto-creation of default cloud environments in `teleportToRemote`.
- Added interactive Google Vertex AI setup wizard accessible from the login screen.
- Added `CLAUDE_CODE_PERFORCE_MODE` env var for read-only file handling in Perforce environments.
- Added `Monitor` tool for streaming events from background scripts.
- Added subprocess sandboxing with PID namespace isolation on Linux.
- Added `--exclude-dynamic-system-prompt-sections` flag to print mode.
- Added `workspace.git_worktree` to the status line JSON input.
- Added W3C `TRACEPARENT` env var to Bash tool subprocesses for OTEL tracing.
- Added "defer" permission decision to PreToolUse hooks for headless session pausing.
- Added `CLAUDE_CODE_NO_FLICKER=1` for flicker-free alt-screen rendering.
- Added `PermissionDenied` hook for auto mode classifier denials with retry support.
- Added named subagents to @-mention typeahead suggestions.
- Added `MCP_CONNECTION_NONBLOCKING=true` to skip MCP connection wait in -p mode.
- Added April Fool's `/buddy` command — hatch a small creature that watches you code.
- Added `/env` support to PowerShell tool commands.
- Added image paste support (no trailing space).
- Added `!command` paste to enter bash mode.
- Added `/powerup` — interactive lessons teaching Claude Code features with animated demos.
- Added `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE` env var for offline marketplace cache handling.
- Added `.husky` to protected directories in `acceptEdits` mode.
- Added MCP tool result persistence override via `_meta["anthropic/maxResultSizeChars"]` annotation (up to 500K).
- Added `disableSkillShellExecution` setting to disable inline shell execution in skills and plugins.
- Added support for multi-line prompts in `claude-cli://open?q=` deep links.
- Plugins can now ship executables under `bin/` and invoke them as bare commands from the Bash tool.
- Added support for Amazon Bedrock powered by Mantle via `CLAUDE_CODE_USE_MANTLE=1`.
- Added compact Slacked `#channel` header for Slack MCP tool calls.
- Added `keep-coding-instructions` frontmatter field support for plugin output styles.
- Added `hookSpecificOutput.sessionTitle` support to `UserPromptSubmit` hooks.
- Added focus view toggle (Ctrl+O) in `NO_FLICKER` mode.
- Added `refreshInterval` status line setting for periodic command execution.
- Added `● N` running indicator in `/agents` for live subagent instances.
- Added syntax highlighting for Cedar policy files (.cedar, .cedarpolicy).

### Changed

- Improved API error reporting to surface detailed Anthropic refusal reasons.
- Enhanced tool-not-available error messages to clarify context-specific restrictions.
- Stabilized `tsconfig.json` to support rigorous type-checking and modern JSX.
- LSP: Claude Code now identifies itself to language servers via `clientInfo`.
- Improved `/resume` filter hint labels and navigation in Vim mode.
- Improved `/agents` with a tabbed layout (Running/Library).
- Improved `/reload-plugins` to pick up skills without restart.
- Improved Accept Edits mode to auto-approve safe filesystem commands and safe wrappers (LANG=C, timeout, etc.).
- Improved PowerShell tool prompt with version-appropriate syntax guidance.
- Changed Edit to work on files viewed via Bash (e.g. sed/cat) without separate Read call.
- Changed thinking summaries to no longer be generated by default in interactive sessions.
- Changed hook output over 50K characters to be saved to disk instead of injected into context.
- Improved @-mention typeahead to rank source files above MCP resources.
- Improved Bash tool to warn when a formatter/linter command modifies read files.
- Improved performance by eliminating redundant JSON.stringify calls and optimizing SSE transport.
- Improved `/resume` all-projects view to load project sessions in parallel.
- Changed `--resume` picker to no longer show sessions created by `claude -p` or SDK invocations.
- Removed `Get-DnsClientCache` and `ipconfig /displaydns` from auto-allow for privacy.
- Improved `/claude-api` skill guidance for agent design patterns and Managed Agents.
- Improved performance by routing `stripAnsi` through `Bun.stripANSI`.
- Edit tool now uses shorter `old_string` anchors to reduce output tokens.
- Changed default effort level from medium to high for most users (API-key, Bedrock/Vertex/Foundry, Team, and Enterprise).
- Plugin skills declared via `"skills": ["./"]` now use frontmatter names for stable invocation names.
- Improved `--resume` to resume sessions from other worktrees of the same repo directly.
- Improved auto mode and bypass-permissions mode to auto-approve sandbox network access.
- Improved sandbox: `sandbox.network.allowMachLookup` now takes effect on macOS.
- Improved image handling with consistent compression budgets.
- Improved slash command and @-mention completion for CJK punctuation.
- Improved Bridge sessions to show local git info on the claude.ai session card.
- Improved footer layout and transient notifications for context-low warnings.
- Improved markdown blockquotes with continuous left bars.
- Optimized session transcript size and accuracy.

### Fixed

- Resolved numerous TypeScript lint errors in core query loop and prompt generation logic.
- Fixed global type declarations for `MACRO` properties.
- Fixed several Bash tool permission bypasses and hardened security around env-vars and redirects.
- Fixed stalled streaming responses timing out.
- Fixed exponential backoff for 429 retries, applying it even when `Retry-After` is small.
- Fixed MCP OAuth config override and token refresh issues, including IdP-specific metadata URLs.
- Fixed character casing and keyboard protocol issues on various terminals.
- Fixed macOS text replacement and directory permission revocation bugs.
- Fixed crashes, memory leaks, and UI glitches in fullscreen and voice modes.
- Fixed managed-settings and agent team permission inheritance.
- [VSCode] Fixed false-positive "requires git-bash" error on Windows.
- Fixed Edit/Write tools doubling CRLF on Windows and stripping Markdown line breaks.
- Fixed StructuredOutput schema cache bug causing high failure rates.
- Fixed LSP server zombie state after crashes.
- Fixed `/stats` undercounting tokens by excluding subagent usage.
- Fixed autocompact thrash loops in extremely long sessions.
- Fixed voice mode failing to request microphone permission on macOS Apple Silicon.
- Fixed Edit/Read allow rules to check resolved symlink targets.
- Fixed WebSocket 101 error in voice mode on Windows.
- Fixed prompt cache misses caused by tool schema changes.
- Fixed nested `CLAUDE.md` re-injection bug.
- Fixed Devanagari and other combining-mark text truncation.
- Fixed rendering artifacts after layout shifts.
- Fixed an infinite loop where the rate-limit options dialog would repeatedly auto-open.
- Fixed `--resume` prompt-cache misses for users with deferred tools or MCP servers.
- Fixed Edit/Write failing when format-on-save hooks rewrite files between edits.
- Fixed PreToolUse hooks with code 2 not correctly blocking tool calls.
- Fixed auto mode not respecting explicit user boundaries.
- Hardened PowerShell tool permission checks against bypasses and debugger hangs.
- Fixed transcript chain breaks on `--resume` that could lose conversation history.
- Fixed `cmd+delete` not deleting to start of line on modern terminals.
- Fixed plan mode in remote sessions losing track of the plan file after container restart.
- Fixed JSON schema validation for `permissions.defaultMode: "auto"` in `settings.json`.
- Fixed Windows version cleanup not protecting the active version's rollback copy.
- `/feedback` now explains why it's unavailable instead of disappearing.
- Fixed agents appearing stuck after a 429 rate-limit response with long `Retry-After`.
- Fixed Console login on macOS silently failing when keychain is locked.
- Fixed plugin skill hooks in YAML frontmatter being ignored.
- Fixed plugin hooks failing when `CLAUDE_PLUGIN_ROOT` was not set.
- Fixed `${CLAUDE_PLUGIN_ROOT}` resolving to marketplace source instead of cache for local plugins.
- Fixed scrollback diff repetition and blank pages in long sessions.
- Fixed multiline user prompts indentation in the transcript.
- Fixed Shift+Space inserting "space" in search inputs.
- Fixed hyperlinks opening double tabs in tmux/xterm.js.
*   **Fixed extensive NO_FLICKER mode issues:** resolved crashes (mouse hover, API retries), rendering artifacts (zellij), memory leaks, scrolling speed (Windows Terminal), and CJK text garbling.
- Fixed `FORCE_HYPERLINK` being ignored when set in `settings.json`.
- Fixed terminal cursor tracking in dialogs for accessibility.
- Fixed Bedrock SigV4 authentication when auth env-vars are empty.
- Fixed SDK/print mode losing partial responses on interruption.
- Fixed UTF-8 sequence splitting in stream-json I/O.
- Fixed subagents leaking working directory back to parent session.
- Fixed compaction writing duplicate transcript files on retry.
- [VSCode] Reduced cold-open subprocess work.
- [VSCode] Fixed dropdown menu selection bugs.
- [VSCode] Added warning banner for `settings.json` parse failures.

## [2.1.97] - 2026-05-11

### Added

- Baseline release with significant stability and feature updates.

## [0.0.1] - 2026-05-11

### Added

- Initial release with core functionality.

[2.1.136]: https://github.com/JonusNattapong/ClaudeCode/compare/v2.1.129...v2.1.136
[2.1.129]: https://github.com/JonusNattapong/ClaudeCode/compare/v2.1.97...v2.1.129
[2.1.97]: https://github.com/JonusNattapong/ClaudeCode/compare/v0.0.1...v2.1.97
[0.0.1]: https://github.com/JonusNattapong/ClaudeCode/releases/tag/v0.0.1