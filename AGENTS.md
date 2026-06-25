# AGENTS.md

This file provides guidance to **Clew Code** agents when working with code in this repository.

## Build / Test / Lint

Run all commands from the repository root using **Bun**.

```bash
bun run dev              # Bun --watch live reload (with Voice, Transcript, Chicago flags)
bun run dev:channels     # Dev mode with development channels loaded (server:clew-orc)
bun run build            # Production build to dist/ (bundles with --external deps)
bun run start            # Run compiled build from dist/
bun test                 # Full test suite via Vitest
bun test --bail          # Stop on first test failure

npx vitest run path/to/file.test.ts   # Run a single test file
npx vitest run -t "test name"         # Run a single test by name

bun run check:ci         # Biome CI check (lint + format, no autofix)
bun run lint             # Biome lint with auto-fix (--write)
bun run format           # Biome format with auto-fix (--write)
bun run check            # Biome check with auto-fix (lint + format)
bun x tsc --noEmit       # TypeScript type-check only
bun ci                   # Lockfile integrity check
```

The `check:ci` script only runs Biome (`biome ci src/`). For a full pre-commit check that includes tests and typechecking, run all three:

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

The `dev` and `build` scripts auto-run `prebuild-version.mjs` and pass important feature defines:
- `TRANSCRIPT_CLASSIFIER=true`
- `CHICAGO_MCP=true`
- `VOICE_MODE=true`

## Release

Pushing a `v*` tag triggers GitHub Actions release and npm publish.

Before tagging:

1. Update the version in `package.json`.
2. Update `CHANGELOG.md` under `## [Unreleased]`.
3. Run full CI: `bun run check:ci && bun x tsc --noEmit && bun test --bail`

## Architecture

### Entry & Execution

`src/main.tsx` is the single CLI entrypoint.

It:
- Forces TTY behavior.
- Parses CLI flags such as `-p`, `--resume`, `--profile`.
- Boots the Ink/React 19 REPL through `src/replLauncher.tsx`.
- Loads settings from `.clew/settings.json` and `.clew/settings.local.json`.

The REPL mounts UI screens from `src/screens/` and renders components from `src/components/`. Slash command routing is handled by `src/commands.ts`, which merges built-in commands, skills, plugins, and MCP-provided commands via a memoized loader.

### Core Query Loop

`src/QueryEngine.ts` handles:
- Message construction
- Tool loop execution
- Provider routing
- Streaming responses
- Tool call handling

`src/query.ts` is the non-streaming variant. Both use the provider system in `src/services/ai/`.

### Provider System

Provider logic lives in `src/services/ai/`. Key files:

```
src/services/ai/ProviderManager.ts    # Unified LLM call interface
src/services/ai/providers.json        # Declarative provider definitions (29 providers)
src/services/ai/providerRegistry.ts   # Provider discovery and model selection
src/services/ai/adapter/              # Per-provider request/response normalization
src/services/ai/errorNormalizer.ts    # Cross-provider error normalization
src/services/ai/usageNormalizer.ts    # Cross-provider usage normalization
```

Users switch providers mid-session with `/model` or `/provider`. The `supportsModelFetching()` system fetches live model lists from provider APIs.

### Tools

Each tool is a class in its own directory under `src/tools/<ToolName>/`. All tools extend `Tool` from `src/Tool.ts` and return the standard result shape:

```ts
{ ok: boolean; summary: string; data?: unknown; }
```

Tools are registered in `src/tools.ts` via `getAllBaseTools()` which returns a `Tools` array. Some tools are feature-gated (loaded via `require()` with `bun:bundle` feature flags) or env-gated (e.g., ComputerUse is Windows-only, PowerShell is optional).

Key tool directories (70+ total):
- Core I/O: `FileReadTool/`, `FileWriteTool/`, `FileEditTool/`, `GlobTool/`, `GrepTool/`, `BashTool/`, `JsonPathTool/`
- Web: `WebSearchTool/`, `WebFetchTool/`, `BrowserTool/`
- Tasks: `TaskCreateTool/`, `TaskUpdateTool/`, `TaskListTool/`, `TaskGetTool/`, `TaskOutputTool/`, `TaskStopTool/`
- Peer (15+ LAN tools): `peer/` plus `PeerDiscoverTool/`, `PeerSendMessageTool/`, `PeerSpawnTool/`, `PeerBroadcastTool/`, `PeerSwarmTool/`, `PeerDashboardTool/`, etc.
- MCP: `MCPTool/`, `ListMcpResourcesTool/`, `ReadMcpResourceTool/`
- Agents: `AgentTool/`, `EnterPlanModeTool/`, `ExitPlanModeTool/`, `SkillTool/`, `ProcessPeerTool/`
- Memory: `MemoryFeedbackTool/`
- Media: `GenerateImageTool/`, `GenerateVideoTool/`, `ReadMediaFileTool/`
- UI: `AskUserQuestionTool/`, `NotebookEditTool/`

### Services (36+ subdirectories)

`src/services/` contains the business logic layer. Key services:

| Service | Purpose |
|---|---|
| `ai/` | Provider manager + 29 adapters |
| `mcp/` | MCP client, auth, stdio/SSE/DirectConnect transports |
| `autonomous/` | Persistent task queue, lease-based concurrency (max 3), cron, backoff retry, dead-letter |
| `goal/` | Goal evaluation, heuristic pre-checks, goal verification |
| `checkpoint/` | Structured checkpoints at 20%/45%/70% milestones with notes scratchpad |
| `maxMode/` | Parallel candidate generation (3 per turn), LLM judge with heuristic fallback |
| `compact/` | Context compaction with in-compact memory extraction |
| `longTermMemory/` | Dream (7-day) and Distill (30-day) memory consolidation |
| `autoDream/` | Dream process scheduling and execution |
| `extractMemories/` | Extract structured facts during compaction |
| `lsp/` | LSP integration |
| `plugins/` | Plugin lifecycle hooks (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit) |
| `search/` | Web search integration |
| `sessionSearch/` | FTS5 session transcript search |
| `SessionLifecycle/` | Session state management |
| `SessionMemory/` | Session-scoped memory |
| `Supervisor/` | Agent supervisor IPC |
| `AgentSummary/` | Agent result summarization |
| `AgentPRStatus/` | Agent PR status tracking |
| `teamMemorySync/` | Cross-machine memory sync |
| `voiceInput/` | Voice transcription pipeline |
| `remoteManagedSettings/` | Remote settings management |
| `settingsSync/` | Settings synchronization |
| `contextCollapse/` | Context collapse detection |
| `googleOAuth/`, `oauth/`, `openaiOAuth/` | OAuth flows |

### Slash Commands

Commands live in `src/commands/`. Each command exports `{ name, description, type, handler }` conforming to the `Command` type from `src/types/command.ts`. Commands can be type `'prompt'` (model-invocable, expands to text), `'local'` (produces text output), or `'local-jsx'` (renders Ink UI).

Registration is handled by `src/commands.ts` which merges:
1. Built-in commands (the `COMMANDS()` memoized list)
2. Skills from `.clew/skills/` directories
3. Plugin commands
4. MCP-provided skill commands
5. Dynamic skills discovered at runtime

Key slash commands:
`/login`, `/logout`, `/model`, `/status`, `/doctor`, `/profile`, `/context`, `/compact`, `/goal`, `/maxmode`, `/mcp`, `/code-review`, `/simplify`, `/plugin`, `/bridge`, `/agent`, `/agents`, `/peer`, `/remote`, `/daemon`, `/task`, `/memory`, `/tasks`, `/effort`, `/stats`, `/guardian`, `/approve`, `/pr`, `/voice`, `/buddy`, `/team`, `/bg`, `/plan`, `/vim`, `/research`, `/workflow`, `/rewind`, `/upgrade`, `/session`, `/theme`, `/skills`, `/ultracode`

### Peer / P2P

Peer coordination lives in `src/peer/`. Core components: `PeerServer.ts`, `PeerDiscovery.ts`.

Supports:
- UDP multicast discovery across LAN
- File-based peer registry (same-machine)
- HTTP heartbeat (60s liveness checks)
- In-process message broker with correlation IDs
- 15+ AI-callable peer tools plus `/peer` slash commands
- Swarm execution (broadcast shell commands to all peers)
- Memory sync across peers

### Memory System (MiMo-inspired)

Lives in `src/memory/`. SQLite-backed store with:
- `memories` table with importance, confidence, access_count, type ranking
- `memory_timeline` table for event lifecycle tracking
- Budgeted injection into system prompt (importance × recency × confidence)
- File hierarchy: `MEMORY.md`, `DECISIONS.md`, `TASTE.md` under `.clew/memory/`
- Auto-init + legacy migration + scan on first use
- `/memory` commands: init, scan, rebuild, recall, feedback, search, dashboard

### Other Key Directories

| Directory | Purpose |
|---|---|
| `src/agentRuntime/` | Background agent orchestration |
| `src/coordinator/` | Coordinator mode agent dispatch |
| `src/vim/` | Vim mode keybindings |
| `src/voice/` | Voice input via Whisper |
| `src/buddy/` | Companion system (duck) |
| `src/tasks/` | Task management |
| `src/bridge/` | Legacy CCR bridge (claude.ai-specific) |
| `src/remote/` | Bridge v2: provider-agnostic WebSocket server, auth tokens, NAT relay |
| `src/plugins/` | Plugin loader, registry, marketplace |
| `src/skills/` | Skill loader (Claude Code-compatible SKILL.md) |
| `src/research/` | Research dossier management |
| `src/generated/` | Auto-generated files (version.ts) |
| `src/server/` | HTTP server components |
| `src/state/` | AppState management |
| `src/hooks/` | React hooks for UI state |
| `src/schemas/` | Zod validation schemas |
| `src/types/` | Shared TypeScript types |
| `src/constants/` | Constants and tool allow/deny lists |
| `src/utils/` | General utilities |
| `src/migrations/` | Schema and data migrations |
| `src/ink/` | Ink terminal rendering helpers |

## Key Conventions

### Runtime & Style

- **ESM only** (`"type": "module"` in package.json), `NodeNext` module resolution
- Use `node:` prefixes for Node built-ins: `import { readFile } from 'node:fs/promises'`
- Use `.js` extensions for relative imports: `import { thing } from './thing.js'`
- Bun for all dev commands; TypeScript with strict mode

### Formatting (Biome)

Scope: `src/**/*.{ts,tsx,js}`. Style: 2-space indent, single quotes, 120 columns, LF endings.

```bash
bun run lint      # Lint with auto-fix
bun run format    # Format with auto-fix
```

### Source vs Build

Edit `src/` only. `dist/` is generated build output. The build uses `bun build` (not tsc) and externally marks many optional deps (electron, playwright, sharp, etc.) to keep the bundle lean.

### Settings

Shared: `.clew/settings.json`. Private/local: `.clew/settings.local.json`. Never commit secrets, API keys, tokens, or credentials. Use environment variables.

## Git Workflow

### Branch Naming

Use `type/description`: `feat/add-feature`, `fix/resolve-bug`, `docs/update-guide`.

### Commit Style

Use conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.

### Before Commit

1. Run: `bun run check:ci && bun x tsc --noEmit && bun test --bail`
2. Read relevant files first, understand existing patterns
3. Modify source files in `src/`, not `dist/`
4. Keep imports ESM-compatible
5. Add or update tests when behavior changes
6. Update `CHANGELOG.md` under `## [Unreleased]`
7. Use a conventional commit message

## Important Notes

### Reverse-Engineered Architecture

Clew Code is a reverse-engineered reimplementation inspired by Anthropic's Claude Code. Some legacy subsystems may still reference claude.ai-specific behavior:

```
src/bridge/                      # Legacy CCR bridge
src/services/mcp/claudeai.ts     # MCP claude.ai connectors
src/services/oauth/              # OAuth login
src/services/claudeAiLimits.ts   # Subscription/billing
```

The provider-agnostic replacement is Bridge v2 in `src/remote/`. When modifying these areas, avoid mixing provider-agnostic code with legacy claude.ai-specific logic.

### Feature Flags

The codebase uses `bun:bundle` feature flags extensively. Check `package.json` scripts for active `--define.*` flags. Additional features are gated via `process.env` checks (e.g., `ENABLE_COMPUTER_USE`, `USER_TYPE === 'ant'`).

### Gateway Mode

This project has a **Gateway Mode** that replaces Anthropic OAuth with `api.clew-code.org`:

- **Key file**: `src/utils/gatewayAuth.ts` — `login()`, `signup()`, `saveGatewayToken()`, `importToken()`, `loginViaBrowser()`, `readGatewayToken()`, `isGatewayConfigured()`
- **`isGatewayConfigured()`** returns `true` by default (unless `CLEW_DISABLE_GATEWAY` is set). This controls whether `/login` and `/logout` use gateway or Anthropic auth.
- **`loginViaBrowser()`** starts a local HTTP server, opens browser with a login form, catches the token callback, and saves to `~/.clew/gateway.json`.
- **`clew auth login`** now uses browser login by default, with terminal fallback.
- **Gateway token** stored at `~/.clew/gateway.json` — read by `ClewGatewayProvider`.

### Modified/Removed Commands

- **`/ant`** — Removed entirely (Anthropic internal beta features, not needed).
- **`/datadog`** — Disabled with `isEnabled: () => false` (Anthropic telemetry, not needed).
- **`/login`** — Now uses gateway mode by default. Type `'local'` when gateway is configured, `'local-jsx'` otherwise. Loads `gwlogin.ts` module.
- **`/logout`** — Now uses gateway mode by default. Loads `gwlogout.ts` module.

### Dashboard Deployment

The **web dashboard** (`clew-code.org/app/`) is deployed from **`clew-api/dashboard/index.html`** via Cloudflare Pages (connected to `ClewCode/clew-api` repo). 

**IMPORTANT**: Do NOT edit `clew-code.org/app/index.html` for dashboard changes — it is the WRONG file. The actual dashboard served at `clew-code.org/app/` comes from `clew-api/dashboard/index.html`. The `clew-code.org` repo's `app/` directory is served only when Cloudflare Pages builds it, and the actual dashboard source is from the `clew-api` repo.

Deploy dashboard changes by pushing to `ClewCode/clew-api` (committing `dashboard/index.html` and running `npx wrangler deploy` for the worker, or pushing to GitHub to trigger Cloudflare Pages).

The `process_peer` tool runs Codex in exec/pty mode for external process-backed AI workers. Use for process-backed AI worker tasks, external command execution, or peer-controlled automation. Don't use it for simple local logic.

### Tool Registration Pattern

Each tool is a class extending `Tool`. Add the import and instantiation to `src/tools.ts` > `getAllBaseTools()`. Feature-gated tools use lazy `require()` with `bun:bundle` feature checks.

### Command Registration Pattern

Each command in `src/commands/` exports `{ name, description, type, handler, ... }`. Add it to the `COMMANDS()` memoized function in `src/commands.ts`. Commands are merged with skills, plugins, MCP skills, and dynamic skills at load time.

## Execution Concepts

Clew Code has several execution layers that do different jobs:

- **Agent** — An AI worker with a prompt, model, tools, and permissions. The main chat session is an agent. Custom agents live in `.clew/agents/*.md`.
- **Subagent** — A short-lived child agent launched by another agent through the `Agent` tool. Use for independent work such as codebase exploration, test triage, or review. The built-in `Explore` agent is read-only and suited for parallel "go inspect this area" tasks.
- **Teammate / Swarm** — A longer-lived agent team member with an identity, mailbox, task coordination, and optional pane/tmux or in-process execution. Use when agents need to keep working together across multiple turns.
- **LAN Peer** — A network of Clew instances on the same machine or LAN. `/peer` discovers peers, sends messages, assigns tasks, and runs commands on other Clew nodes.
- **Process Peer** — A local process-backed worker layer. Delegates a prompt to an external CLI/provider (e.g. Codex) using `exec` or `pty`, then returns stdout, stderr, exit code, timeout state, and progress.

Use the layers by intent:
- Need a quick independent read-only investigation? Use an `Explore` subagent.
- Need long-running coordination between named workers? Use teammates/swarm.
- Need another Clew instance on the LAN? Use `/peer`.
- Need Clew to run a local external worker? Use Process Peer.

Other runtime concepts:
- **Plan mode** — Full-access planning mode with bypass permissions. Plan files persist to `.clew/plans/long-term-plan.md`.
- **Multi-pass compaction** — Automatic chunk-based context compression with recursive re-compaction.
- **Goal verification** — Independent LLM call reviews completion against goal text and reports specific gaps.
- **Max Mode** — Generates N parallel candidate responses per turn via forked agents, selects best via LLM judge.
- **Checkpoints** — Structured snapshots at 20%/45%/70% progress milestones with a `notes.md` scratchpad.

## Profiles

Clew Code has a **personal profile** (`/profile personal`) — command-center mode. It plans, splits tasks, and delegates code work to Codex workers via `process_peer`, then reviews and summarizes results.

In personal profile, you are not a code editor by default — the `delegate` skill spawns a Codex worker with a structured task prompt and reports what was done, what passed/failed, and what's blocked. Additional capabilities:

- **Cross-session memory** — reads stored memories on session start, writes preferences, corrections, and patterns back.
- **Skill creation** — automatically creates reusable `SKILL.md` files in `.clew/skills/` when it spots a repeatable multi-step pattern.
- **Scheduling** — uses `/cron` for recurring tasks and `/loop` for repeated polling.
- **Daemon mode** — when running in the background, checks the task queue, runs cron tasks on schedule, and consolidates memory automatically.
- **Parallel delegation** — breaks complex workflows into independent sub-tasks and runs them concurrently via sub-agents or peers.

Profile and last-used permission mode are saved between sessions.

## Security Rules

Never commit: provider API keys, npm tokens, OAuth tokens, session cookies, `.env` files, private credentials, local user secrets, billing/subscription data. Prefer `process.env.KEY_NAME` over hardcoded secrets.
