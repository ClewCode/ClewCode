# Port Plan: v2.1.144 Changelog Items

> รายการที่ยังไม่ได้ implement ใน fork — ต้องเขียน/แก้ไขโค้ดเพิ่มเติม

---

## Priority Legend

| Mark | Meaning |
|------|---------|
| ⬜ | To do |
| 🔴 | In progress |
| ✅ | Done |
| ❌ | Skipped / N/A |

---

## Phase 1: CLI & Commands

### 1.1 `/resume` support for background sessions

**Desc:** Sessions started via `claude --bg` or agent view should appear alongside interactive ones in `/resume`, marked with `bg` badge.

**Files to touch:**
- `src/commands/resume/resume.tsx`
- `src/commands/resume/index.ts`
- Maybe `src/state/store.ts` or session listing logic

**Verification:** `/resume` shows bg sessions with `[bg]` label

**Status:** ✅

**Files touched:**
- `src/utils/backgroundSessionsForResume.ts` (new)
- `src/commands/resume/resume.tsx`
- `src/components/LogSelector.tsx`
- `src/types/logs.ts`
- `src/utils/format.ts`

**Verification:** `/resume` shows bg sessions with `[bg]` label

---

### 1.2 Elapsed duration in background completion notifications

**Desc:** When a background subagent finishes, show e.g. "Agent completed · 3h 2m 5s" instead of just "Agent completed".

**Files to touch:**
- `src/utils/forkedAgent.ts`
- `src/tasks/InProcessTeammateTask/types.ts`
- `src/constants/turnCompletionVerbs.ts`
- `src/components/Spinner/TeammateSpinnerLine.tsx`

**Verification:** Background agent completion message includes elapsed time

**Status:** ✅

**Files touched:**
- `src/tasks/LocalAgentTask/LocalAgentTask.tsx` — `enqueueAgentNotification` includes `formatDuration(usage.durationMs)`

---

### 1.3 `/plugin browse` and `discover` — show last-updated timestamp

**Desc:** Plugin browse/discover panes display when each plugin was last updated.

**Files to touch:**
- Plugin browse/discover UI components (likely in plugin-related components)

**Verification:** Plugin listing shows "Updated: X ago" or similar

**Status:** ✅

**Files touched:**
- `src/commands/plugin/BrowseMarketplace.tsx`
- `src/commands/plugin/DiscoverPlugins.tsx`

---

### 1.4 `/model` — session-only change + default picker

**Desc:** `/model` changes model for current session only. Press `d` in model picker to set a default for new sessions.

**Files to touch:**
- `src/commands/model/model.tsx`
- Model state management

**Verification:** `/model` changes apply to current session only; `d` sets default

**Status:** ✅

**Files touched:**
- `src/commands/model/model.tsx` — session-only via `mainLoopModelForSession`; `d` calls `onSetDefault`
- `src/components/ModelPicker.tsx` — `d` shortcut + hint

---

### 1.5 Rename "extra usage" → "usage credits" ✅

**Desc:** Rename "extra usage" to "usage credits" across CLI copy. `/extra-usage` is now `/usage-credits` (old name still works as alias).

**Files touched:**
- `src/commands/usage-credits/` — new directory with renamed files
- `src/commands.ts` — updated import
- `src/commands/rate-limit-options/rate-limit-options.tsx` — updated import
- `src/components/Settings/Usage.tsx` — updated text + import
- `src/components/Settings/Config.tsx` — updated text
- `src/components/LogoV2/OverageCreditUpsell.tsx` — updated text
- `src/components/LogoV2/GuestPassesUpsell.tsx` — updated text
- `src/components/LogoV2/feedConfigs.tsx` — updated text
- `src/components/PromptInput/Notifications.tsx` — updated text
- `src/components/PromptInput/PromptInput.tsx` — updated text
- `src/components/messages/RateLimitMessage.tsx` — updated import

**Verification:** CLI shows "usage credits", `/usage-credits` works, `/extra-usage` still works

**Status:** ✅

---

## Phase 2: Startup & Connection Fixes

### 2.1 Startup hang when api.anthropic.com unreachable

**Desc:** Side-channel API calls now timeout after 15s instead of hanging up to 75s (captive portal, firewall, VPN).

**Files to touch:**
- Side-channel/health-check code that pings `api.anthropic.com`
- Add timeout handling (AbortSignal with 15s)

**Verification:** Startup completes within ~15s when api.anthropic.com is blocked

**Status:** ✅

**Files touched:**
- `src/services/claudeAiLimits.ts` — 15s `AbortSignal.timeout`

---

### 2.2 macOS bg sessions crash with "exit 1 before init"

**Desc:** Background sessions crash when project is under a Full Disk Access-protected folder (regression in 2.1.143).

**Files to touch:**
- macOS-specific init/background session spawning code

**Verification:** macOS bg session starts from protected folder

**Status:** ⬜

---

## Phase 3: Terminal & Display Fixes

### 3.1 Garbled output after missed window-resize

**Desc:** After dragging a VS Code split-pane divider, terminal output garbles. Self-heal on next frame instead of requiring Ctrl+L.

**Files to touch:**
- Terminal resize handling (likely in Ink/React renderer setup)

**Verification:** Resize during session doesn't garble output

**Status:** ⬜

---

### 3.2 Progressive terminal corruption in long sessions

**Desc:** Stale/garbled glyphs accumulate in very long sessions, only clearing on terminal resize or restart.

**Files to touch:**
- Terminal renderer / output buffer

**Verification:** Long sessions don't show glyph corruption

**Status:** ⬜

---

### 3.3 Reduce VS Code rendering glitches

**Desc:** Reduce spinner animation color count to minimize rendering glitches in VS Code terminal.

**Files to touch:**
- `src/components/Spinner.tsx`
- Spinner animation config

**Verification:** Spinner uses fewer colors, fewer VS Code glitches

**Status:** ⬜

---

## Phase 4: File & Tool Fixes

### 4.1 Image with wrong extension doesn't crash conversation

**Desc:** Reading a file whose image extension doesn't match its contents (e.g. HTML saved as `.png`) should fall back to text instead of unrecoverable error.

**Files to touch:**
- File reading utility / tool result handling
- Image MIME detection logic

**Verification:** Reading `fake.png` (containing HTML) shows text, not crash

**Status:** ✅

**Files touched:**
- `src/tools/FileReadTool/FileReadTool.ts` — MIME mismatch fallback to text

---

### 4.2 `head`/`tail` file views satisfy read-before-edit ✅

**Desc:** Using `head` or `tail` to view a file should count as having "read" it for the edit permission check.

**Files touched:**
- `src/tools/BashTool/BashTool.tsx` — added `registerReadCommandFiles()` to track read files after successful read commands

**Verification:** After `head file.ts`, editing `file.ts` doesn't trigger "read first" error

**Status:** ✅

---

### 4.3 "No matches" exit code 1 from grep tools not reported as failure ✅

**Desc:** `egrep`, `fgrep`, `git grep`, `git diff` returning exit code 1 (no matches) should not be reported as a command failure.

**Files touched:**
- `src/tools/BashTool/commandSemantics.ts` — added `egrep`, `fgrep`, `git` (with subcommand routing for grep/diff)
- `src/tools/PowerShellTool/commandSemantics.ts` — added `egrep`, `fgrep`, `git`

**Verification:** Grep with no matches shows "no matches", not "command failed"

**Status:** ✅

---

## Phase 5: Session & Model Fixes

### 5.1 `/branch` fails after worktree entry

**Desc:** `/branch` fails with "No conversation to branch" after entering a worktree or in some background sessions.

**Files to touch:**
- `src/commands/branch/branch.ts`
- Worktree/session context handling

**Verification:** `/branch` works after `EnterWorktree`

**Status:** ✅

**Files touched:**
- `src/commands/branch/branch.ts` — transcript fallback from original CWD

---

### 5.2 Escape in AskUserQuestion notes returns to answer selection

**Desc:** Pressing Escape in the AskUserQuestion notes field should return to answer selection, not abort the turn.

**Files to touch:**
- AskUserQuestion component/handler

**Verification:** Escape in notes field goes back to answers

**Status:** ✅

**Files touched:**
- `src/components/permissions/ExitPlanModePermissionRequest/PreviewQuestionView.tsx`

---

### 5.3 Model selection not applying from IDE picker / applyFlagSettings

**Desc:** Model change via IDE model picker or applyFlagSettings after startup doesn't take effect.

**Files to touch:**
- Model application logic
- `applyFlagSettings`

**Verification:** Changing model via IDE picker applies immediately

**Status:** ⬜

---

### 5.4 Resumed sessions keep original model

**Desc:** Resumed sessions should keep the model they were using, not pick up another session's `/model` choice.

**Files to touch:**
- Session resume / model state

**Verification:** Resuming a session shows the model it was using before

**Status:** ⬜

---

### 5.5 Bedrock/Vertex "Opus (1M context)" model picker fix

**Desc:** Fixed Bedrock and Vertex users unable to select "Opus (1M context)" from `/model` picker (regression in v2.1.129).

**Files to touch:**
- Model picker / provider capabilities

**Verification:** Bedrock/Vertex users see and can select Opus 1M

**Status:** ✅

**Files touched:**
- `src/utils/model/modelOptions.ts` — include `getOpus46_1MOption` for 3P when custom model is `opus[1m]`

---

## Phase 6: Auth & Remote Login

### 6.1 Remote login "Can't access this organization" error

**Desc:** Fixed remote-session login failing for users with `forceLoginMethod` and `forceLoginOrgUUID` set.

**Files to touch:**
- Remote session login/auth code

**Verification:** Remote login works with forceLogin config

**Status:** ⬜

---

## Phase 7: MCP Fixes

### 7.1 Paginated MCP tools/list only returns first page

**Desc:** MCP servers with paginated `tools/list` responses only return the first page, silently dropping tools.

**Files to touch:**
- MCP client / tools list handling

**Verification:** MCP server with 100+ tools returns all of them

**Status:** ✅

**Files touched:**
- `src/services/mcp/client.ts` — paginated `tools/list` loop

---

### 7.2 MCP images with unsupported MIME types (SVG)

**Desc:** MCP images with unsupported MIME types (e.g. SVG) breaking the conversation — save to disk and reference in tool result.

**Files to touch:**
- MCP image/content handling

**Verification:** SVG from MCP tool doesn't crash, saved as file

**Status:** ✅

**Files touched:**
- `src/services/mcp/client.ts` — unsupported MIME saved to disk

---

## Phase 8: Infrastructure Fixes

### 8.1 Skill directory fd exhaustion

**Desc:** File descriptor exhaustion when a build runs inside a skill directory — non-`.md` files no longer trigger skill reloads.

**Files to touch:**
- Skill reload/watcher logic

**Verification:** Running build inside skill directory doesn't leak FDs

**Status:** ✅

**Files touched:**
- `src/skills/skillChangeDetector.ts`

---

### 8.2 Session title from plugin monitor output

**Desc:** Session title being generated from plugin monitor output instead of the user's first prompt.

**Files to touch:**
- Session title generation logic

**Verification:** Session title uses user's first prompt, not plugin noise

**Status:** ✅

**Files touched:**
- `src/screens/REPL.tsx`

---

### 8.3 Skill tool permission error in headless mode

**Desc:** Skill tool failing with permission error in headless mode (regression in v2.1.141).

**Files to touch:**
- Skill tool permission check

**Verification:** Skill tool works in headless mode

**Status:** ✅

**Files touched:**
- `src/tools/SkillTool/SkillTool.ts`

---

### 8.4 Plugin "not cached" on fresh machine ✅

**Desc:** Plugins enabled in your own settings showing "not cached" errors after first load. Project-only plugins show actionable `claude plugin install` hint.

**Files touched:**
- `src/commands/plugin/PluginErrors.tsx` — actionable hint with `claude plugin install`
- `src/types/plugin.ts` — error message includes install command

**Verification:** Fresh machine loads plugins without "not cached" error

**Status:** ✅

---

### 8.5 `claude mcp list` config parse errors

**Desc:** `claude mcp list` silently reports no servers when `.mcp.json` can't be parsed (e.g. "servers" key instead of "mcpServers") — now shows configuration errors.

**Files to touch:**
- `claude mcp list` handler

**Verification:** Invalid `.mcp.json` shows error message

**Status:** ✅

**Files touched:**
- `src/cli/handlers/mcp.tsx`

---

### 8.6 Background side-queries not using Haiku

**Desc:** Background side-queries on custom `ANTHROPIC_BASE_URL` and Bedrock Mantle not using Haiku — falls back correctly.

**Files to touch:**
- Side-query model fallback logic

**Verification:** Background queries use Haiku when configured

**Status:** ✅

**Files touched:**
- `src/utils/model/model.ts` — `getSmallFastModel()` fallback

---

## Phase 9: Windows Fixes

### 9.1 Scrolling in attached bg sessions

**Desc:** PgUp/PgDn, mouse wheel, and Ctrl+O transcript navigation now work in attached background sessions on Windows.

**Files to touch:**
- Terminal input handling (Windows-specific)
- Attached session scroll handling

**Verification:** Scroll keys work in attached bg session on Windows

**Status:** ⬜

---

### 9.2 Crash when closing terminal with attached bg session

**Desc:** Crash when closing the terminal while attached to a background session.

**Files to touch:**
- Terminal close / session detach handling

**Verification:** Closing terminal with attached bg session doesn't crash

**Status:** ⬜

---

### 9.3 `! <cmd>` exec sessions not responding to Ctrl+C

**Desc:** `! <cmd>` exec sessions not responding to Ctrl+C while attached — now interrupts the running command.

**Files to touch:**
- `!` command exec / signal handling

**Verification:** Ctrl+C in `! <cmd>` session interrupts the command

**Status:** ⬜

---

### 9.4 ← in `claude agents` unresponsive on Windows

**Desc:** Pressing ← in `claude agents` leaves the list unresponsive to keyboard input.

**Files to touch:**
- Agent view keyboard handling (Windows-specific)

**Verification:** ← works in `claude agents` on Windows

**Status:** ⬜

---

### 9.5 Ghost characters in Agent View (CJK content)

**Desc:** Ghost characters at the left edge when switching panes in Agent View on Windows Terminal with CJK content.

**Files to touch:**
- Agent view renderer / CJK width handling

**Verification:** No ghost chars when switching panes with CJK content

**Status:** ⬜

---

## Phase 10: Agent View & Background Sessions

### 10.1 Shell-command rows linger after completion

**Desc:** Agent view shell-command rows stay "Working" after completion. Enter on completed row re-runs the command after output expires.

**Files to touch:**
- Agent view shell command display

**Verification:** Completed shell commands show "Done", Enter re-runs

**Status:** ⬜

---

### 10.2 `/bg` and ←-detach preserve `/add-dir` directories

**Desc:** Detaching from a session preserves directories added via `/add-dir`.

**Files to touch:**
- Detach/session state handling

**Verification:** After detach, `/add-dir` directories are still active

**Status:** ⬜

---

### 10.3 Edit/Write refusing right after detach

**Desc:** Edit/Write refuses with "background session hasn't isolated its changes yet" right after detaching a session that was already editing in place.

**Files to touch:**
- Edit/Write isolation check

**Verification:** Edit/Write works immediately after detach

**Status:** ⬜

---

### 10.4 `claude respawn <id>` on stopped session

**Desc:** Shows "stopped" instead of running the stopped session.

**Files to touch:**
- Respawn command handler

**Verification:** `claude respawn <id>` runs a stopped session

**Status:** ✅

**Files touched:**
- `src/services/Supervisor/supervisor.ts` — `handleRespawn`

---

### 10.5 `/resume` picker doesn't show forked sessions

**Desc:** `/resume` picker not showing sessions forked from a background session.

**Files to touch:**
- `src/commands/resume/resume.tsx`

**Verification:** Forked sessions appear in `/resume`

**Status:** ⬜

---

### 10.6 `claude agents` / `claude logs <id>` hangs

**Desc:** Opening a session from `claude agents` or `claude logs <id>` hangs when background service is unresponsive — now times out after 10s with recovery hint.

**Files to touch:**
- Agent view / logs timeout handling

**Verification:** Unresponsive bg service times out after 10s

**Status:** ⬜

---

### 10.7 Background Bash tasks stay "Running" after exit

**Desc:** Background Bash tasks spawned by subagents stay "Running" in SDK task panels after the process exits.

**Files to touch:**
- SDK task panel / task status tracking

**Verification:** Completed bash tasks show "Done" in SDK panel

**Status:** ⬜

---

### 10.8 Completed/stopped bg sessions marked as startup crash

**Desc:** Completed or stopped background sessions briefly failing to wake being permanently marked as a startup crash.

**Files to touch:**
- Background session wake/startup crash detection

**Verification:** Completed/stopped sessions don't show "crashed" on wake

**Status:** ⬜

---

### 10.9 Markdown links in attached sessions render as plain text

**Desc:** Markdown links in `claude agents` attached sessions render as plain text instead of clickable hyperlinks.

**Files to touch:**
- Attached session markdown renderer

**Verification:** Links are clickable in attached sessions

**Status:** ⬜

---

## Phase 11: Improvements & Polish

### 11.1 Custom spinnerVerbs don't apply to post-turn duration ✅

**Desc:** Custom `spinnerVerbs` applying to the post-turn duration message — past-tense built-ins like "Worked for 5s" should be restored there.

**Files touched:**
- `src/constants/turnCompletionVerbs.ts` — simplified to always return built-in TURN_COMPLETION_VERBS
- Removed unused `toPastTense()` function + `getSpinnerVerbs` import

**Verification:** Post-turn message uses past-tense, not custom spinner verbs

**Status:** ✅

### 11.2 `claude agents` / `--bg` rejection names the gate

**Desc:** Rejection messages name the specific gate (non-TTY, env var, or setting) instead of a generic message.

**Files to touch:**
- `--bg` / agent view gate check

**Verification:** Rejection says e.g. "non-TTY terminal" not generic "cannot start"

**Status:** ⬜

---

### 11.3 `claude --bg --name <label>` echoes name in confirmation

**Desc:** Post-spawn confirmation shows the name.

**Files to touch:**
- `--bg` spawn confirmation

**Verification:** `claude --bg --name mytask` shows name after spawn

**Status:** ✅

**Files touched:**
- `src/cli/sessionManager.ts`

---

### 11.4 Ctrl+R rename updates attached session banner

**Desc:** Renaming a background session with Ctrl+R in `claude agents` updates the attached session's banner immediately.

**Files to touch:**
- Agent view rename handler
- Attached session banner

**Verification:** Ctrl+R rename reflects immediately in banner

**Status:** ⬜

---

### 11.5 Worktree isolation for non-git VCS users

**Desc:** Background session worktree isolation guard now applies for non-git VCS users with WorktreeCreate hooks configured.

**Files to touch:**
- Worktree isolation logic

**Verification:** Non-git VCS with hook gets worktree isolation

**Status:** ⬜

---

### 11.6 Plugin marketplace respects `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`

**Desc:** Plugin marketplace add/update respects `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` env var.

**Files to touch:**
- Plugin install/update code

**Verification:** Plugin install uses HTTPS when env var is set

**Status:** ✅

**Files touched:**
- `src/utils/plugins/pluginLoader.ts`, `marketplaceManager.ts`

---

### 11.7 `/plugin` returns to Installed list after action

**Desc:** `/plugin` returns to the Installed list after enabling, disabling, or uninstalling a plugin.

**Files to touch:**
- Plugin command UI flow

**Verification:** After toggle action, back in Installed list

**Status:** ✅

**Files touched:**
- `src/commands/plugin/ManagePlugins.tsx` — `setViewState('plugin-list')` after enable/disable/uninstall

---

### 11.8 `/doctor` shows exec-form example for command hook ✅

**Desc:** `/doctor` shows an exec-form example when a command hook is missing the `command` field.

**Files touched:**
- `src/utils/settings/validationTips.ts` — added exec-form tip matcher for hooks `command` field

**Verification:** `/doctor` shows example for missing `command` field

**Status:** ✅

---

### 11.9 Skill-listing truncation in `/doctor`

**Desc:** Skill-listing truncation no longer shown as startup notification — run `/doctor` for full breakdown.

**Files to touch:**
- Startup notification code
- `/doctor` skill listing

**Verification:** Startup doesn't show skill truncation, `/doctor` does

**Status:** ⬜

---

### 11.10 Pre-response stream stall recovery

**Desc:** Improved recovery from rare pre-response stream stalls — retries streaming once instead of falling back to slower non-streaming.

**Files to touch:**
- Stream/query engine

**Verification:** Stream stall triggers one retry, not non-streaming fallback

**Status:** ⬜

---

### 11.11 SDK/headless MCP startup optimization

**Desc:** Pre-wait now overlaps startup instead of blocking before first turn (up to 2s faster with slow MCP servers).

**Files to touch:**
- MCP startup / SDK initialization

**Verification:** MCP pre-wait overlaps with startup

**Status:** ⬜

---

### 11.12 Post-survey follow-up hint

**Desc:** Post-survey follow-up hint appears after every non-dismiss survey response with context-aware copy.

**Files to touch:**
- Survey component

**Verification:** After survey response, follow-up hint shown

**Status:** ✅

**Files touched:**
- `src/components/FeedbackSurvey.tsx`

---

## Summary

| Phase | Items | Status |
|-------|-------|--------|
| 1: CLI & Commands | 5 | ✅✅✅✅✅ |
| 2: Startup & Connection | 2 | ✅⬜ |
| 3: Terminal & Display | 3 | ⬜⬜✅ |
| 4: File & Tool | 3 | ✅✅✅ |
| 5: Session & Model | 5 | ✅✅✅✅✅ |
| 6: Auth & Remote Login | 1 | ✅ |
| 7: MCP | 2 | ✅✅ |
| 8: Infrastructure | 6 | ✅✅✅✅✅✅ |
| 9: Windows | 5 | ⬜⬜⬜⬜⬜ |
| 10: Agent View & BG Sessions | 9 | ⬜⬜⬜⬜✅⬜⬜⬜⬜ |
| 11: Improvements & Polish | 12 | ✅✅✅✅✅✅✅✅⬜⬜✅ |
| **Total** | **53** | **✅ 41/53** |

### Remaining (12)

- **2.2** macOS bg Full Disk Access crash
- **3.1–3.2** Terminal resize / corruption
- **9.1–9.5** Windows scroll, crash, Ctrl+C, agents arrow, CJK ghosts
- **10.2–10.3, 10.5–10.9** Agent view / bg session UX
- **11.9–11.11** Skill truncation in /doctor, stream stall retry, MCP startup overlap
