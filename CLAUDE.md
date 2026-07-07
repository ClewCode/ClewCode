# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**For full architectural details, see [AGENTS.md](AGENTS.md).**

## 📝 Keep Docs in Sync (always)

**Whenever you fix, add, remove, or change anything, update the relevant docs in the SAME change** — do not defer it. This includes:
- `CLAUDE.md` / `AGENTS.md` — architecture, commands, patterns, conventions
- `PLAN.md` — progress/status of ongoing work (e.g. shadow reconciliation counts)
- `CHANGELOG.md`, `README.md`, and any skill `SKILL.md` affected

If a code change makes a doc statement stale (a count, a file path, a command, a rule), fix the doc too. Treat "code changed but docs didn't" as an incomplete task.

## ✅ `.js` Shadow Reconciliation Complete

**All 401 `.js` shadow files have been removed.** The JS→TS migration is now complete — there are zero `.ts`/`.js` shadow pairs in `src/`. The `/js-shadow-sync` skill has been removed.

- PR #60 reconciled the first wave; the remaining 401 were reconciled in 4 commits (2026-07-08).
- Bun's `.js`→`.ts` fallback resolved cleanly — all pairs were verified: exported symbols matched (no runtime bugs hidden), and the `.ts` was canonical in every case.
- If you see a `.js` file in `src/`, it is **not** a shadow — it's a genuine JS source module (no `.ts` twin exists).

## Commands

```bash
# Development
bun run dev              # Live reload REPL (with feature flags)
bun run dev:channels    # Dev with development channels (server:clew-orc)

# Build & verification
bun run build           # Production build to dist/
bun run start           # Run compiled build from dist/
bun run check:ci        # Biome lint + format check (no autofix)
bun run lint            # Biome lint with autofix
bun run check           # Lint + format with autofix

# Tests (via Vitest)
bun test                # Full suite
bun test --bail         # Stop on first failure
npx vitest run path/to/file.test.ts    # Single file
npx vitest run -t "test name"          # By name

# Full pre-push gate (do before git push)
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

See [AGENTS.md § Build / Test / Lint](AGENTS.md#build--test--lint) for details and feature flags.

## Architecture Overview

### Entry & REPL

- **`src/main.tsx`** — Single CLI entrypoint. Parses flags, boots Ink/React 19 REPL via `src/replLauncher.tsx`, loads settings.
- **`src/screens/REPL.tsx`** — Main TUI screen (6K+ lines). Routes user input → commands + messages → QueryEngine.
- **`src/commands.ts`** — Merges built-in slash commands, skills, plugins, MCP-provided commands.

### Query Loop & Providers

- **`src/QueryEngine.ts`** — Streaming LLM loop: message construction, tool loop, provider routing, response streaming.
- **`src/services/ai/`** — Provider system (29 providers: Claude, OpenAI, Gemini, etc.). Cross-provider adapters for request/response/error/usage normalization. Users switch mid-session with `/model` or `/provider`.

### Tools (70+)

- **Organization**: `src/tools/<ToolName>/`. All extend `Tool` from `src/Tool.ts`.
- **Key categories**: File I/O (Read/Edit/Glob/Grep), Bash, Web (Search/Fetch/Browser), Tasks, Peer (LAN agents), MCP, Agents, Memory, Media, UI.
- **Registration**: `src/tools.ts::getAllBaseTools()`. Some are feature-gated (bun:bundle) or env-gated.

See [AGENTS.md § Tools](AGENTS.md#tools) for full inventory.

### Services (36+)

- **`ai/`** — Provider manager + adapters
- **`mcp/`** — MCP client + transports
- **`autonomous/`** — Task queue, lease-based concurrency, cron, backoff
- **`goal/`, `checkpoint/`** — Goal tracking + 20%/45%/70% checkpoints
- **`longTermMemory/`** — 7-day Dream + 30-day Distill consolidation
- **`plugins/`** — Lifecycle hooks (PreToolUse, PreBash, PreAcceptEdit, etc.)
- **`sessionSearch/`** — FTS5 transcript search
- **`SessionLifecycle/`** — Session state management

See [AGENTS.md § Services](AGENTS.md#services-36-subdirectories) for full list and details.

## Recent Additions (2026-01-07)

### New Skill: Workspace Linking
- **`/workspace link <path>`** — Link projects together (bidirectional). Writes to `.clew/workspace.json`. Auto-loads linked dirs on return; one-time confirmation dialog per project.
- **Subcommands**: `link`, `unlink`, `load`, `list`
- **Files**: `src/utils/workspace/`, `src/commands/workspace/`
- **See**: [WorkspaceLinkDialog.tsx](src/components/WorkspaceLinkDialog.tsx), [workspace.ts](src/utils/workspace/workspace.ts)

### New Skills (in `.claude/skills/`)
1. **`/js-shadow-sync`** — Detect `.js` shadows that have drifted from `.ts` twins (~400 pairs). Modes: diff (staged changes), single-file, --all (audit).
2. **`/clew-verify`** — End-to-end smoke test before push: shadow check + static gate + unit tests + real CLI test.
3. **`/clew-release`** — Release checklist (version → CHANGELOG → CI gate → tag) per AGENTS.md.

### MCPs Added (`.mcp.json`)
1. **`@playwright/mcp`** — Browser automation for verifying Ink TUI + REPL flows (unit tests can't see rendered state).
2. **`@modelcontextprotocol/inspector`** — Official MCP debugger for when MCP integration breaks.

Keep: **`codegraph`** (code intelligence graph).

## Key Patterns

### Editing for Runtime Behavior
1. Run `/js-shadow-sync` on your file — if a `.js` shadow exists, **edit both twins**.
2. If only the `.ts` changes, Bun loads the stale `.js` and your fix never runs.

### Before Pushing
- Run `/clew-verify` (includes shadow check, static gate, smoke test).
- Or manually: `bun run check:ci && bun x tsc --noEmit && bun test --bail`
- Do NOT assume green tests = working feature (Ink TUI state not visible to tests).

### Cross-Repo Collaboration
- Use `/workspace link` to pair projects. Links are bidirectional and auto-load on return to either repo.
- Linked dirs show in `/permissions` with a `🔗 linked` badge.

## TinyFish (Default Web Toolkit)

**TinyFish is the default web toolkit for this project** — use it for ALL web-related tasks instead of built-in WebSearch/WebFetch/BrowserTool.

| TinyFish Tool | Replaces | When to use |
|---|---|---|
| `search` | WebSearch | Any web search, docs lookup, current info, news |
| `fetch_content` | WebFetch | Reading page content, docs, articles, pricing — up to 10 URLs in parallel |
| `run_web_automation` | BrowserTool | Interactive website tasks — clicking, forms, login, scraping |
| `batch_create` | — | Same workflow across 2+ URLs in parallel |
| `create_browser_session` | — | Direct Playwright/Puppeteer CDP browser session |

**Rules:**
- For search queries → always use `mcp__tinyfish__search` first
- For reading URLs → always use `mcp__tinyfish__fetch_content`  
- For browser automation (click, fill forms, login) → always use `mcp__tinyfish__run_web_automation`
- Do NOT use `WebSearch`, `WebFetch`, or `BrowserTool` unless TinyFish is unavailable

## Performance Notes

- **Model switching**: `/model <name>` mid-session. Provider system normalizes errors/usage across 29 providers.
- **Memory**: Persistent (Dream/Distill), session-scoped, auto-compaction with memory extraction.
- **Context collapse**: Automatic detection via `src/services/contextCollapse/`.

## See Also

- **Full architecture**: [AGENTS.md](AGENTS.md)
- **Release**: [AGENTS.md § Release](AGENTS.md#release)
- **Tools inventory**: [AGENTS.md § Tools](AGENTS.md#tools)
