# AGENT.md

This file provides guidance to Clew Code when working with code in this repository.

## Build / Test / Lint (use Bun, not npm)

```bash
bun run dev              # Live-reload REPL (with feature flags)
bun run dev:channels     # Dev with development channels loaded
bun run build            # Production build to dist/
bun run start            # Run compiled build from dist/
bun test                 # Full Vitest suite
bun test --bail          # Stop on first failure
bun ci                   # Lockfile integrity check
npx vitest run path/to/file.test.ts   # Single test file
npx vitest run -t "test name"         # Single test by name
bun run check:ci         # Biome lint + format check (no autofix)
bun run lint             # Biome lint + autofix
bun run check            # Biome lint + format + autofix
bun x tsc --noEmit       # TypeScript type-check only
```

**Full pre-push gate:**
```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

Or use `/clew-verify` (static gate + tests + CLI smoke test).

## Code Conventions

- **ESM only** (`"type": "module"`), `NodeNext` module resolution
- `.js` extensions for relative imports: `import { x } from './thing.js'`
- `node:` prefix for built-in modules: `import { readFile } from 'node:fs/promises'`
- **Biome** formatting: 2-space indent, single quotes, 120 columns, LF endings — scope `src/**/*.{ts,tsx,js}`
- Types in `src/types/` or local; prefer interfaces for objects, type aliases for unions
- Edit `src/` only — `dist/` is generated build output
- Export interfaces and factory functions from barrel `index.ts` files

## Stats

- **2,340 TypeScript files** (`.ts`/`.tsx`), **9 standalone `.js` files** (no `.ts` twin — genuine JS source)
- **76 tool directories** under `src/tools/`, **35+ service directories** under `src/services/`
- **~90 slash commands** registered in `src/commands/`

## Architecture Overview

```
src/main.tsx            CLI entrypoint (flag parsing, TTY forcing, Ink REPL boot)
src/replLauncher.tsx    Ink/React 19 REPL bootstrap
src/commands.ts         Slash command registry (merges built-in + skills + plugins + MCP)
src/QueryEngine.ts      Streaming LLM loop (messages, tools, provider routing, streaming)
src/query.ts            Non-streaming query variant
src/tools.ts            Tool registry (getAllBaseTools())
src/Tool.ts             Base class for all tools (extends with standard result shape)
src/Task.ts             Base class for async tasks
src/state/AppState.tsx  Central AppState store (singleton, drives all Ink UI)
```

### Entry Point Flow

`src/main.tsx` does more than parse flags:
1. Forces TTY on stdout/stderr/stdin (workaround for PowerShell)
2. Loads `version.json` into `globalThis.MACRO`
3. Starts MDM raw read and keychain prefetch in parallel with module evaluation
4. Checks feature flags (`bun:bundle` defines): `TRANSCRIPT_CLASSIFIER`, `CHICAGO_MCP`, `VOICE_MODE`, `AWAY_SUMMARY`
5. Routes to: version display, flag parsing, pipe mode, or Ink REPL

### Tools (76)

Each tool is a class in `src/tools/<ToolName>/` extending `Tool` from `src/Tool.ts`. Result shape: `{ ok, summary, data }`. Register in `src/tools.ts::getAllBaseTools()`. Feature-gated tools use lazy `require()` with `bun:bundle` flags. Key categories:

| Category | Tools |
|---|---|
| Core I/O | FileRead, FileWrite, FileEdit, Glob, Grep, Bash, JsonPath |
| Web | WebSearch, WebFetch, BrowserTool |
| Tasks | TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop |
| Peer (15+) | PeerDiscover, PeerSendMessage, PeerBroadcast, PeerSwarm, PeerDashboard, etc. |
| MCP | MCPTool, ListMcpResourcesTool, ReadMcpResourceTool |
| Agents | AgentTool, EnterPlanMode, ExitPlanMode, SkillTool |
| Memory | MemoryFeedbackTool, ProjectRuleTool |
| Media | GenerateImage, GenerateVideo, ReadMediaFile |
| UI | AskUserQuestionTool, NotebookEditTool |
| Other | GoalTool, MonitorTool, LSPTool, ComputerUseTool, BriefTool |

### Commands (~90)

Each command in `src/commands/<name>/` exports `{ name, description, type, handler }`. The `type` field is `'prompt'` (model-invocable, expands to text), `'local'` (produces text output), or `'local-jsx'` (renders Ink UI). Register in `src/commands.ts::COMMANDS()`.

Key commands: `/model`, `/status`, `/doctor`, `/context`, `/compact`, `/goal`, `/mcp`, `/code-review`, `/peer`, `/agent`, `/tasks`, `/memory`, `/plan`, `/workflow`, `/research`, `/rewind`, `/upgrade`, `/theme`, `/skills`, `/rule`, `/voice`, `/ultracode`, `/workspace`

### Screens & UI (`src/screens/`, `src/components/`, `src/ink/`)

| Path | Purpose |
|---|---|
| `src/screens/REPL.tsx` | Main TUI screen (6K+ lines) — routes input, manages panels |
| `src/screens/Doctor.tsx` | Diagnostic/health screen |
| `src/screens/ResumeConversation.tsx` | Session resume dialog |
| `src/components/` | Ink/React 19 components organized by feature |
| `src/ink/` | Custom Ink render helpers (devtools, etc.) |
| `src/hooks/` | React hooks for UI state and tool permissions |
| `src/state/` | AppState singleton store + selectors |

### Provider System (`src/services/ai/`)

- `ProviderManager.ts` — unified LLM interface
- `providers.json` — 29 provider definitions
- `adapter/` — per-provider request/response normalization
- `errorNormalizer.ts` / `usageNormalizer.ts` — cross-provider normalization
- Model switching mid-session via `/model` or `/provider`
- Live model discovery via `ModelDiscoveryService.ts`

### Key Services (`src/services/`)

| Service | Purpose |
|---|---|
| `mcp/` | MCP client with stdio/SSE/DirectConnect/StreamableHTTP transports |
| `autonomous/` | Background agent loop, task queue with leases (max 3), cron, dead-letter retries |
| `longTermMemory/` | Dream (7d) + Distill (30d) memory consolidation |
| `checkpoint/` | Structured 20%/45%/70% progress snapshots, rollback via `/rewind` |
| `plugins/` | Lifecycle hooks (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit) |
| `auditLog/` | SIEM-compatible NDJSON trail with rotation, filtering |
| `sessionSearch/` | FTS5 transcript search |
| `voiceInput/` | Voice transcription pipeline (Whisper) |
| `goal/` | Goal verification via independent LLM call |
| `compact/` | Multi-pass context compaction with automatic memory extraction |
| `contextCollapse/` | Automatic context collapse detection |
| `lsp/` | LSP integration (goToDefinition, findReferences, hover) |
| `search/` | Web search integration |
| `SessionLifecycle/` | Session state management |
| `SessionMemory/` | Session-scoped memory |
| `Supervisor/` | Agent supervisor IPC |
| `teamMemorySync/` | Cross-machine memory sync |
| `settingsSync/` | Settings synchronization |
| `MagicDocs/` | Documentation generation |
| `googleOAuth/`, `oauth/`, `openaiOAuth/` | OAuth flows |
| `analytics/` | Usage analytics |
| `api/` | API service layer |
| `tools/` | Tool service layer |
| `PromptSuggestion/` | Prompt suggestions |
| `tips/` | Tip display service |
| `policyLimits/` | Rate/policy limits |
| `toolUseSummary/` | Tool usage tracking |
| `remoteManagedSettings/` | Remote settings management |
| `autoDream/` | Dream process scheduling and execution |
| `extractMemories/` | Extract structured facts during compaction |
| `AgentSummary/` | Agent result summarization |
| `AgentPRStatus/` | Agent PR status tracking |

### Agent Runtime (`src/agentRuntime/`)

Background agent orchestration and specialized runtimes:
- `orchestrator.ts` — core orchestration loop
- `ultracode.ts` — ultracode reasoning engine
- `ultracodeBootstrap.ts` / `ultracodeBridge.ts` — ultracode integration
- `verifierAgent.ts` — independent verification agent
- `transcriptClassifier.ts` — transcript classification
- `dynamicWorkflowRunner.ts` / `dynamicWorkflowCoordinator.ts` — workflow management
- `agentRegistry.ts` — agent registration
- `reportBuilder.ts` — agent report construction
- `workflowRegistry.ts` — workflow definitions
- `toolGateway.ts` — tool access gateway
- `runStore.ts` — agent run persistence

### Configuration & Hooks

Configured in `.clew/settings.json` (shared) and `.clew/settings.local.json` (private, never commit secrets). Hooks automate behavior on tool events — see `src/hooks/` for hook type definitions and `.clew/settings.json` for configuration keys (`PostToolUse`, `PreToolUse`, etc.).

### Peer / P2P (`src/peer/`)

UDP multicast discovery, HTTP heartbeats, in-process message broker with correlation IDs, swarm execution, memory sync across LAN agents. 15+ AI-callable peer tools plus `/peer` slash commands. Key files: `PeerServer.ts`, `PeerDiscovery.ts`, `PeerStore.ts`.

### Memory (`src/memory/`)

SQLite-backed with importance × recency × confidence budgeting. `/memory` commands for init/scan/search/dashboard. Auto-consolidation via Dream (7d) and Distill (30d). File hierarchy: `.clew/memory/{MEMORY,DECISIONS,TASTE}.md`.

### Plugins (`src/plugins/`)

Plugin loader, registry, marketplace. Lifecycle hooks at PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit. Plugin dirs at `.clew/plugins/`.

### Tasks (`src/tasks/` + `src/autonomous/`)

In-session task management and persistent task queue with lease-based concurrency, cron scheduling, and dead-letter retries. Background agent process in `src/agentRuntime/`.

### Types, Schemas, Constants

| Path | Purpose |
|---|---|
| `src/types/` | Shared TypeScript types (command, message, logs, plugin, etc.) |
| `src/types/command.ts` | Command type definitions (`PromptCommand`, `LocalCommandResult`) |
| `src/schemas/` | Zod validation schemas (for LLM output validation) |
| `src/constants/` | Constants including tool allow/deny lists |

### Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `prebuild-version.mjs` | Auto-generates `src/generated/version.json` before build |
| `postbuild-inject-macro.mjs` | Injects macro values into built output |
| `bun-run.mjs` | Wrapper for running dev/start with correct flags |
| `codegraph.ts` | Generates `.clew/CODEGRAPH.md` structure map |
| `generate-docs.ts` | Documentation generation |
| `preload.ts` | Preload tasks |
| `session.ts` | Session management utility |
| `install.sh` / `install.ps1` | Cross-platform install scripts |

## MCP Configuration

MCP servers defined in `.mcp.json` at project root:

```json
{
  "mcpServers": {
    "codegraph": { "command": "codegraph", "args": ["serve", "--mcp"] },
    "clew-bus": { "type": "http", "url": "http://127.0.0.1:7333/mcp" },
    "clew-peer": { "type": "http", "url": "http://127.0.0.1:7334/mcp" }
  }
}
```

## Execution Layers

- **Agent** — main chat session or custom `.clew/agents/*.md`
- **Subagent** — short-lived child via Agent tool (use for parallel read-only exploration)
- **Teammate / Swarm** — long-lived named workers with mailbox, task coordination, optional tmux/pane
- **LAN Peer** — network of Clew instances on LAN, `/peer` for discovery
- **Process Peer** — local Codex worker via exec/pty (delegate coding work)
- **Background Agent** — agentRuntime task queue with lease-based concurrency (max 3), cron, daemon mode (`/bg`, `/daemon`)

## Profiles

- **Personal profile** (`profile: "personal"` in `.clew/settings.json`) — command-center mode. Plans, splits tasks, delegates to Codex workers via `process_peer`, reviews and summarizes results. Automatically creates skills from repeatable patterns.
- **Daemon mode** — background runtime (`src/services/autonomous/daemonMode.ts`) that checks task queue, runs cron tasks, consolidates memory.

## Feature Flags

Codebase uses `bun:bundle` `--define.*` flags (see `package.json` scripts): `TRANSCRIPT_CLASSIFIER`, `CHICAGO_MCP`, `VOICE_MODE`, `AWAY_SUMMARY`. Additional gating via `process.env` (e.g., `ENABLE_COMPUTER_USE`).

## Gateway Mode

Replaces Anthropic OAuth with `api.clew-code.org`. `isGatewayConfigured()` returns true by default. Key file: `src/utils/gatewayAuth.ts`. Login flow opens browser → local HTTP server → saves token to `~/.clew/gateway.json`. `/login` and `/logout` use gateway by default.

## Project Rules

Define auto-observed behavioral rules via `/rule` or `.clew/rules.json`. Rule files auto-injected into system prompt. Key active rules: Keep docs in sync, use Bun for all dev commands, ESM with NodeNext, Biome formatting, conventional commits, branch naming convention.

## Legacy Subsystems (avoid mixing)

- `src/bridge/` — legacy CCR bridge (claude.ai-specific)
- `src/services/mcp/claudeai.ts` — legacy MCP connectors
- `src/services/oauth/` — legacy OAuth login
- Bridge v2 replacement is in `src/remote/` (provider-agnostic WebSocket server, auth tokens, NAT relay)

## Planning, Checkpoints & Goals

- **Plan mode** (`/plan`) — full-access planning with bypass permissions. Plans persist to `.clew/plans/long-term-plan.md`.
- **Checkpoints** — structured snapshots at 20%/45%/70% progress milestones with `notes.md` scratchpad. `/rewind` restores code or conversation to any prior checkpoint.
- **Goals** (`/goal`) — goal tracking with independent LLM verification against goal text.

## Workspace Linking

`/workspace link <path>` — link projects bidirectionally, persists in `.clew/workspace.json`. Auto-loads linked dirs on return. Subcommands: `link`, `unlink`, `load`, `list`. Source: `src/commands/workspace/`, `src/utils/workspace/`.

## Release

Pushing a `v*` tag triggers GitHub Actions release + npm publish. Before tagging:
1. Update version in `package.json`
2. Update `CHANGELOG.md` under `[Unreleased]`
3. Run full CI gate

Use `/clew-release` for the full release checklist.

## Dashboard Deployment

The web dashboard at `clew-code.org/app/` is served from **`clew-api/dashboard/index.html`** (Cloudflare Pages connected to `ClewCode/clew-api` repo), **not** from `clew-code.org/app/index.html`. Push dashboard changes to `ClewCode/clew-api`.

## Graphify

Code knowledge graph at `graphify-out/` (24K+ nodes, 56K+ edges). Use `graphify query "<question>"` for codebase questions, `graphify path "<A>" "<B>"` for relationships. Run `graphify update .` after modifying code.

## Security Rules

Never commit: provider API keys, npm tokens, OAuth tokens, session cookies, `.env` files, private credentials, billing/subscription data. Prefer `process.env.KEY_NAME` over hardcoded secrets. Use `.clew/settings.local.json` for private settings.
