# Plan: Implement Upstream Changelog Fixes (2.1.120 → 2.1.140)

## Context
Anthropic released 2.1.120 through 2.1.136 of Claude Code. This plan covers all fixes/changes from the actual changelog entries provided. Items requiring external SDK changes, native binary changes, or deep unknown architecture are **deferred**.

## Status Summary (audited 2026-05-11)

| Group | Done | Total | Notes |
|-------|------|-------|-------|
| **A** Auth & Session | 6/6 | 6 | All done |
| **B** Model & API | 12/12 | 12 | All done ✅ |
| **C** Tooling & Security | 14/14 | 14 | All done ✅ |
| **D** MCP & Plugin | 26/28 | 28 | All done ✅ (D22-D23 dupe of D18)
| **E** UI/UX & Rendering | ~42/~112 | 112 | E18/E62/E80/E82/E83/E96 done this session |
| **F** Settings & Commands | 16/17 | 17 | F1-F9, F11, F12, F14, F16 done; F10/F13/F15/F17 deferred |

---

## GROUP A — Authentication & Session Management ✅ (6/6)

**A1. Concurrent Auth Race (Login Loop)** ✅ — `src/utils/auth.ts`
- `saveOAuthTokensIfNeeded` re-reads storage at write time and merges

**A2. MCP OAuth Refresh Tokens Lost** ✅ — `src/services/mcp/auth.ts`
- Cross-process lock verified in `refreshAuthorization()`

**A3. Reactive Auth on 401** ✅ — Verified existing
- Already implemented via `withOAuth401Retry` + `withRetry`

**A4. OAuth Refresh Race After Wake-from-Sleep** ✅ — `src/utils/auth.ts`
- Same merge-safeguard as A1

**A5. CLAUDE_ENV_FILE SessionStart Hooks Going Stale** ✅ — `src/commands/clear/conversation.ts`
- `invalidateSessionEnvCache()` on /clear

**A6. --resume / --continue Not Finding Sessions with Underscores** ✅ — `src/utils/sessionStoragePortable.ts`
- `sanitizePath` regex preserves `_`

---

## GROUP B — Model & API ✅ (12/12, ALL DONE)

**B1. Extended Thinking 400 Error** ✅ `src/services/api/claude.ts` — redacted_thinking block handling
**B2. Bedrock/Vertex 400 with ENABLE_PROMPT_CACHING_1H** ✅ — Already gated: `shouldUseGlobalCacheScope()` returns false for non-firstParty
**B3. Mantle Endpoint Authentication** ✅ `src/services/api/anthropicClient.ts`
**B4. Bedrock ANTHROPIC_BEDROCK_SERVICE_TIER** ✅ `src/services/api/anthropicClient.ts`
**B5. Opus 4.7 xhigh Effort Level** ✅ `src/utils/effort.ts`
**B6. Opus 4.7 Context Window Inflation** ✅ `src/utils/context.ts`
**B7. Unrecognized 400 Status Codes** ✅ `src/services/api/errors.ts`
**B8. Vertex AI count_tokens 400 Errors** ✅ `src/services/tokenEstimation.ts` — skip API for Vertex, fallback to local estimation
**B9. Auto Mode xhigh Effort for Opus 4.7** ✅ `src/utils/effort.ts`
**B10. Bedrock Application Inference Profile ARNs** ✅ `src/utils/effort.ts` — `modelSupportsEffort()` + `modelSupportsMaxEffort()` handle inference profile ARNs
**B11. Headless -p Retrying Non-Transient 4xx** ✅ `src/services/api/withRetry.ts`
**B12. Vertex AI Tool Search Unsupported Beta Header** ✅ `src/services/api/claude.ts` — Vertex skipped + gated behind ENABLE_TOOL_SEARCH

---

## GROUP C — Tooling & Security ✅ (14/14, ALL DONE)

**C1. Auto Mode hard_deny** ✅ — classifier `hard_deny` support (7 files)
**C2. Plan Mode Not Blocking Edit Allow Rules** ✅ — `permissions.ts`
**C3. Subprocess ENV — CLAUDE_CODE_SESSION_ID + CLAUDE_EFFORT** ✅ — `subprocessEnv.ts`
**C4. Sandbox bwrapPath / socatPath** ✅ — `sandbox-adapter.ts`
**C5. Sandbox network.deniedDomains** ✅ — `sandboxTypes.ts`, `sandbox-adapter.ts`
**C6. Bash "Always Allow" in Remote Sessions** ✅ — permission updates relayed to daemon
**C7. Bash Permission Prompts Showing Parser Diagnostic** ✅ — `bashPermissions.ts`, `sedValidation.ts`
**C8. Bash dangerouslyDisableSandbox Bypassing Prompt** ✅ — `bashPermissions.ts`
**C9. Bash Allow Rules for /private Paths (macOS)** ✅ — `pathValidation.ts`
**C10. Bash Deny Rules with env/sudo/watch/ionice/setsid Wrappers** ✅ — `bashPermissions.ts`
**C11. Bash(find:*) Allow Rules** ✅ — `bashPermissions.ts`
**C12. Read/Write/Edit on Mapped Network Drives** ✅ `filesystem.ts` — only check ORIGINAL input path for UNC, not resolved equivalents from mapped drives
**C13. Worktree.baseRef Setting** ✅ — `settings/types.ts` (F4)
**C14. Worktree Exit Dialog Wrong Directory** ✅ — `WorktreeExitDialog.tsx`

---

## GROUP D — MCP & Plugin Ecosystem ✅ (26/28, ALL DONE)

**D1. MCP Servers Disappearing After /clear** ✅ `src/services/mcp/client.ts` — `clearAllMcpServerCaches()`
**D2. MCP OAuth Refresh Tokens Lost on Concurrent Refresh** ✅ `src/services/mcp/client.ts` — per-server lockfile
**D3. MCP Servers with 0 Tools Retry Once** ✅ `src/services/mcp/client.ts` — 1s retry on empty tools/list
**D4. Unauthorized claude.ai MCP Connectors** ✅ `src/services/mcp/client.ts` — split NEEDS_AUTH from FAILED in status
**D5. MCP OAuth expires_in Omission** ✅ `src/services/mcp/auth.ts` — changed default from 3600s to `DEFAULT_TOKEN_TTL_S` (86400s / 24h)
**D6. MCP Step-Up Authorization** ✅ `src/services/mcp/auth.ts` — scope comparison in `tokens()` (lines 1646-1648)
**D7. MCP OAuth Timeout/Cancel Unhandled** ✅ `src/tools/McpAuthTool/McpAuthTool.ts`, `src/cli/print.ts` — `.catch()` on race loser
**D8. MCP OAuth Client Secret via --client-secret** ✅ `src/services/mcp/auth.ts` — DCR metadata: `client_secret_post`
**D9. MCP ${ENV_VAR} Placeholder in Headers** ✅ `src/services/mcp/envExpansion.ts` + `headersHelper.ts`
**D10. Plugin Hooks Failing After Cache Cleanup** ✅ `src/utils/plugins/cacheUtils.ts` — `isPluginVersionInUse()` skips deletion of versions with active hooks
**D11. Plugin Uninstall/Enable/Disable Case-Insensitivity** ✅ — `pluginOperations.ts`
**D12. Plugin Marketplace Removal Key: r → d** ✅ — `ManageMarketplaces.tsx`
**D13. Plugin Re-Install Re-Resolves Dependencies** ✅ `src/utils/plugins/dependencyResolver.ts` — root never skipped in alreadyEnabled check
**D14. Plugin Marketplace Entry with Unrecognized Source Format** ✅ `src/utils/plugins/schemas.ts` — `.catch(undefined)` + `.transform` to strip bad entries
**D15. Plugin MCP Servers Not Spawning on Windows** ✅ `src/utils/plugins/mcpbHandler.ts` — pathSeparator uses platform-native sep
**D16. Plugin Update Never Detecting New npm Versions** ✅ `src/utils/plugins/pluginLoader.ts` — force npm install when version specified
**D17. Subagents Not Discovering Project/User/Plugin Skills** ✅ already handled — getCommands uses getProjectRoot() consistently
**D18. MCP alwaysLoad Option** ✅ `src/services/mcp/client.ts` + `src/tools/ToolSearchTool/prompt.ts` — alwaysLoad → skip deferral
**D19. MCP Reconnecting Flooding Tool Lists** ✅ `src/services/mcp/useManageMCPConnections.ts` — batching + summary count notification
**D20. MCP OAuth 204 No Content** ✅ `src/services/mcp/auth.ts` — handle empty body
**D21. MCP Concurrent Call Timeout Disarming** ✅ `src/services/mcp/client.ts` — per-call AbortController, no shared SDK timeout
**D22-D23** — Duplicates of D18
**D24. MCP servers retry 3x on transient startup errors** ✅ `src/services/mcp/client.ts` — startup retry loop
**D25. MCP workspace Reserved Name** ✅ `src/commands/mcp/addCommand.ts:93` + `src/services/mcp/config.ts:1130`
**D26. MCP deniedMcpServers *:// Wildcard Mixed-Case** ✅ `src/services/mcp/config.ts` — case-insensitive matching
**D27. MCP OAuth headersHelper Not Showing Auth Actions** ✅ `src/services/mcp/client.ts` — SSE/HTTP headersHelper failure → needs-auth
**D28. MCP HTTP/SSE with Custom Headers Stuck in Needs Auth** ✅ `src/services/mcp/client.ts` — skip needs-auth cache for headersHelper servers
**D29. MCP OAuth Client Secret Stored via --client-secret** ✅ (*merged with D8*)

---

## GROUP E — UI/UX & Rendering

### ✅ Done (verified against code changes)

| Item | File | Fix |
|------|------|-----|
| **E8** | `editor.ts` | Reset extended key mode on Ctrl+G exit |
| **E9** | `format.ts` | Show date when reset >24h away |
| **E15** | `install-github-app.tsx`, `DesktopHandoff.tsx` | Esc dismisses dialogs |
| **E23** | `PromptInput.tsx` | Don't auto-submit empty with suggestion |
| **E26** | `commands.ts` | Prefix match "term"→"terminal-setup" |
| **E10** | `WelcomeV2.tsx` | CJK-safe ellipsis `\u007e` |
| **E14** | `copy.tsx` | Trim trailing whitespace on clipboard copy |
| **E16** | `wrap-text.ts` | Strip leading whitespace on continuation lines |
| **E19** | `release-notes-picker.tsx` | Clear cache on failure |
| **E27** | `AskUserQuestionPermissionRequest.tsx` | Preserve "Other" field text |
| **E30** | `usePasteHandler.ts` | Don't trigger command on paste |
| **E31** | `usePasteHandler.ts` | Strip stray CSI sequences from paste |
| **E35** | `editor.ts` | Alt-screen handoff (verified) |
| **E36** | `context.tsx` | Emit summary, not ASCII grid |
| **E38** | `branch.ts` | Include session ID in success message |
| **E39** | `commands.ts` | `rename` command args handling |
| **E40** | `sessionRestore.ts` | Clear bridge state on resume |
| **E48** | `vim/types.ts` | Space in NORMAL mode |
| **E56** | `terminalSetup.tsx` | Windows Terminal detection |
| **E57** | `effort.tsx` | CLAUDE_CODE_EFFORT_LEVEL help text |
| **E59** | `FuzzyPicker.tsx` | Increased DEFAULT_VISIBLE 8→15 for taller terminals |
| **E41** | `installedPluginsManager.ts` | Clean up stale plugin entries with missing dirs |
| **E45** | `imagePaste.ts` | 10s timeout on image read to prevent hanging |
| **E58** | `Status.tsx` | Use active model |
| **E71** | `Settings/Status.tsx` | Effort confirmation label |
| **E85** | `useFeedbackSurvey.tsx` | Dismissal state tracking |
| **E88** | `effort.ts` | Hide effort suffix on non-effort models |
| **E89** | `SpinnerAnimationRow.tsx` | Rotating progress hints, 1s delay |
| **E93** | `plans.ts` | Plan file named after prompt |
| **E95** | `hooks.ts` | Skip empty PostToolUse results |
| **E98** | `compact.ts` | Detect "Extra usage required" |
| **E100** | `main.tsx` | SIGCONT handler for fullscreen |
| **E102** | `usage.ts` | Refresh OAuth before fetching usage |
| **E103** | `settings/types.ts` | Graceful legacy enum handling |
| **E105** | `Shell.ts` | CWD fallback (verified existing) |
| **E106** | `json.ts` | `readFileChunks` skip corrupt lines |
| **E108** | `json.ts` | `sanitizeSurrogates()` removes lone surrogates |
| **E109** | `main.tsx` | gracefulShutdown on SIGINT |
| **E110** | `main.tsx` | uncaughtException + unhandledRejection handlers |
| **E72** | `copy.tsx` | Grapheme-aware char count via Intl.Segmenter |
| **E68** | `useAwaySummary.ts` | Skip recap when prompt has unsent text |
| **E84** | `errors.ts` | Provider-specific 429 retry URL |
| **E86** | `supports-hyperlinks.ts` + `BashToolResultMessage.tsx` | Windows Terminal hyperlink detection + BashOutput linkifyUrls=true |
| **E47** | `operators.ts` | NFC normalization in `applyOperator` for NFD chars |
| **E101** | `securityCheck.tsx` | Accept applies settings, only Exit exits session |
| **E42** | `client.ts` | MCP stdio arg quoting with `CLAUDE_CODE_SHELL_PREFIX` |
| **E18** | `editor.ts` | Reset keyboard mode (Kitty protocol) after Ctrl+G to fix Backspace swap |
| **E62** | `resume.tsx` | Always show picker on `/resume` — prevents tab-complete auto-resume |
| **E82** | `client.ts` | Skip needs-auth cache for claudeai-proxy servers after `/clear` |
| **E80** | `agentSummary.ts` | Idle sub-agent summaries skip redundant updates, use 5min idle interval |
| **E83** | `commit.ts` | Added bundled `/commit` skill for Claude in Chrome compatibility |
| **E96** | `branch.ts` | Strip dangling tool_use blocks from fork transcript |

### ❌ Not Yet Implemented
E1-E7, E11-E13, E17, E20-E22, E24-E25, E28-E29, E32-E34, E37, E43-E44, E46, E49-E55, E60-E61, E63-E67, E69-E70, E74-E79, E81, E87, E90-E92, E94, E97, E99, E104

(Many of these require component-level or renderer-level changes that are not in the current diff.)

---

## GROUP F — New Settings & Commands

### ✅ Completed
| Item | Status | Change |
|------|--------|--------|
| **F1** | ✅ | CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL |
| **F2** | ✅ | autoMode.hard_deny type, schema, prompt builder |
| **F3** | ✅ | BEDROCK_SERVICE_TIER |
| **F4** | ✅ | worktree.baseRef |
| **F5** | ✅ | bwrapPath + socatPath |
| **F6** | ✅ | Already done |
| **F7** | ✅ | Focus mode system prompt (prompts.ts:875) + Ctrl+O toggle (app:toggleTranscript) |
| **F8** | ✅ | maxWorkers setting in types.ts + runtime enforcement in AgentTool.tsx |
| **F9** | ✅ | CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN |
| **F11** | ✅ | Color picking |
| **F12** | ✅ | Added `marketplace-browse`/`browse-plugins`/`browse-marketplace` aliases to plugin command |
| **F14** | ✅ | Removed .hideHelp() |
| **F16** | ✅ | Improved OAuth paste instructions |

### ⏳ Deferred / Won't Implement
| Item | Notes |
|------|-------|
| **F10** | React compiler-compiled files — fork has no React compiler |
| **F13** | React compiler-compiled components — same as F10 |
| **F15** | Plugin loading modification — need upstream changelog context to identify specific change |
| **F17** | /tui does not exist in this fork (uses Ink/React rendering) |

---

## Verification
- `bun x tsc --noEmit` — TypeScript check (1 pre-existing error in mcp/client.ts)
- Changes are uncommitted — 73 files modified

---

## GROUP G — Upstream Features & Bugfixes (2.1.137 → 2.1.140)

### 🔧 High Priority

**G1. ✅ MCP stdio servers receive CLAUDE_PROJECT_DIR** ✅ `src/services/mcp/client.ts` — already implemented via subprocessEnv
**G2. ✅ Remote MCP reconnect retry on transient failures** ✅ — already implemented (D24)
**G3. MCP resources from disconnected servers lingering in @server** ❌
**G4. MCP stdio unbounded memory growth (16 MB cap per SSE frame)** ❌

### 🔧 Medium Priority

**G5. Added hook args: string[] field (exec form)** ❌
**G6. Added hook continueOnBlock config option for PostToolUse** ❌
**G7. Hook terminal access fixed** ❌
**G8. Fixed settings hot-reload not detecting symlinked settings.json** ❌

### 🔧 Low Priority / Bugs

**G9. Fixed autoAllowBashIfSandboxed with shell expansions ($VAR, $(cmd))** ❌
**G10. Fixed Skill(name *) permission rules prefix match** ❌
**G11. Fixed spurious "stream idle timeout" after completion** ❌
**G12. Fixed silent exit 1 with 10+ MCP servers + unwritable cache** ❌
**G13. Fixed Grep results Windows drive-letter paths** ❌
**G14. Fixed fuzzy-match splitting emoji/astral-plane characters** ❌
**G15. Fixed ProgressBar rendering fractional cell** ❌
**G16. Fixed task polling/fs.watch resurrection bug** ❌
**G17. Fixed plugin dependency resolution stale count** ❌
**G18. Fixed Insights Time-of-Day chart unparseable timestamp** ❌
**G19. ✅ Fixed keybindings cmd/super/win modifier flagged unparseable** ✅ `src/keybindings/validate.ts` — added `super` to validator check
**G20. Fixed claude plugin update not preserving cross-plugin symlinks** ❌

### 📦 New Commands

**G21. /goal command** ❌
**G22. /scroll-speed command** ❌
**G23. claude plugin details <name> (show component inventory + cost)** ❌

### 🖥️ UI/UX

**G24. Agent View (Research Preview)** ❌
**G25. Transcript view navigation (? for shortcuts, {/} jump prompts)** ❌
**G26. Compaction prompt preserve sensitive user instructions** ❌
**G27. /mcp Reconnect picks up .mcp.json edits** ❌
**G28. /context per-skill token estimates account for model tokenizer** ❌
**G29. claude plugin install auto-refresh marketplace** ❌
**G30. /context show providing plugin name** ❌
**G31. Plugin details show hook event names + MCP server names** ❌
**G32. Subagent API headers (x-claude-code-agent-id)** ❌
**G33. Remote Control / API key mode improvements** ❌
**G34. Fixed typing cursor blinking on tabs/pointers** ❌
**G35. Fixed transcript view shortcuts after mouse click** ❌
**G36. Fixed Bash-mode up-arrow history** ❌
**G37. Fixed pasting multiple images only inserting last** ❌
**G38. Fixed hyperlinks dark navy on dark themes** ❌
**G39. Fixed model picker redundant rows for 3P users** ❌
**G40. Fixed mouse wheel scrolling speed (Cursor/VS Code/WT)** ❌
**G41. Fixed two-file diff over-reporting truncated lines** ❌
**G42. Fixed border-embedded text overflowing on CJK/emoji** ❌
**G43. Fixed ProgressBar rendering full block fractional cell** ❌
**G44. Fixed skill argument names with regex metacharacters** ❌
**G45. Fixed claude_code.active_time.total OTEL metric not emitted in -p** ❌
**G46. [VSCode] Cmd/Ctrl+Shift+T reopen closed session tab** ❌
**G47. Fixed scroll behavior in WTerminal + VS Code background sessions** ❌
