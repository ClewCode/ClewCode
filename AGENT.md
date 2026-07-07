# AGENT.md

This file provides guidance to Clew Code when working with code in this repository.

## Critical: `.js` Shadows `.ts` at Runtime

`src/` has ~400 committed `.js` files alongside `.ts`/`.tsx` twins (JS→TS migration residue). **Bun resolves `.js` import specifiers to the `.js` file on disk** — it does NOT prefer `.ts`. Editing only the `.ts` silently does nothing at runtime.

- Before any runtime fix: check for a `.js` sibling with `/js-shadow-sync`. If it exists, edit **both** or the change won't take effect.
- Do not bulk-delete `.js` shadows — pairs have drifted independently; reconcile each by hand.
- To reconcile: compare exported symbols first (mismatch = stub/dropped export — highest priority bug). Ignore `.tsx` and `using`/dispose diffs (transpiler noise). Delete stale `.js` (Bun falls back `.js`→`.ts` when `.js` is gone) or port logic to `.ts`. Verify with `bun run build` (NOT `tsc`, which reports ~260 false "Cannot find module" errors) and gate on `bun test`.

## Build / Test / Lint (use Bun, not npm)

```bash
bun run dev              # Live-reload REPL (with feature flags)
bun run dev:channels     # Dev with development channels loaded
bun run build            # Production build to dist/
bun run start            # Run compiled build from dist/
bun test                 # Full Vitest suite
bun test --bail          # Stop on first failure
npx vitest run path/to/file.test.ts   # Single test file
npx vitest run -t "test name"         # Single test by name
bun run check:ci         # Biome lint + format check (no autofix)
bun x tsc --noEmit       # TypeScript type-check only
bun run lint             # Biome lint + autofix
bun run check            # Biome lint + format + autofix
```

**Full pre-push gate:**
```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

Or use `/clew-verify` (shadow check + static gate + tests + CLI smoke test).

## Code Conventions

- **ESM only** (`"type": "module"`), `NodeNext` module resolution
- `.js` extensions for relative imports: `import { x } from './thing.js'`
- `node:` prefix for built-in modules: `import { readFile } from 'node:fs/promises'`
- **Biome** formatting: 2-space indent, single quotes, 120 columns, LF endings — scope `src/**/*.{ts,tsx,js}`
- Types in `src/types/` or local; prefer interfaces for objects, type aliases for unions
- Edit `src/` only — `dist/` is generated build output
- Export interfaces and factory functions from barrel `index.ts` files

## Architecture Overview

```
src/main.tsx           → CLI entrypoint (flag parsing, Ink REPL boot)
src/replLauncher.tsx    → Ink/React 19 REPL bootstrap
src/screens/REPL.tsx    → Main TUI screen (6K+ lines)
src/commands.ts         → Slash command registry
src/QueryEngine.ts      → Streaming LLM loop (messages, tools, provider routing)
src/query.ts            → Non-streaming query variant
src/tools.ts            → Tool registry (getAllBaseTools())
src/state/AppState.tsx  → Central AppState store (singleton, drives Ink UI)
```

### Tools (70+)

Each tool is a class in `src/tools/<ToolName>/` extending `Tool` from `src/Tool.ts`. Result shape: `{ ok, summary, data }`. Register in `src/tools.ts::getAllBaseTools()`. Feature-gated tools use lazy `require()` with `bun:bundle` flags.

### Commands

Each command in `src/commands/<name>/` exports `{ name, description, type, handler }`. The `type` field is `'prompt'` (model-invocable, expands to text), `'local'` (produces text output), or `'local-jsx'` (renders Ink UI). Register in `src/commands.ts::COMMANDS()`.

### Provider System (`src/services/ai/`)

- `ProviderManager.ts` — unified LLM interface
- `providers.json` — 29 provider definitions
- `adapter/` — per-provider request/response normalization
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

### State & UI

- **State**: `src/state/AppState.tsx` — singleton AppState store drives all Ink component rendering. `src/state/store.ts` for store creation. `src/state/selectors.ts` for derived state.
- **Components**: `src/components/` — Ink/React 19 components organized by feature
- **Screens**: `src/screens/` — top-level TUI screens (REPL, etc.)
- **Hooks**: `src/hooks/` — React hooks for UI state
- **Ink helpers**: `src/ink/` — custom Ink render helpers

### Agent Runtime (`src/agentRuntime/`)

Background agent orchestration, workflow management (`dynamicWorkflowRunner.ts`), ultracode reasoning (`ultracode.ts`), verifier agent (`verifierAgent.ts`), transcript classifier (`transcriptClassifier.ts`).

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

## MCP Configuration

MCP servers defined in `.mcp.json` at project root:
```json
{
  "mcpServers": {
    "codegraph": { "command": "codegraph", "args": ["serve", "--mcp"] }
  }
}
```
Currently configured: `codegraph` (code intelligence graph), `@playwright/mcp` (browser automation for TUI testing), `@modelcontextprotocol/inspector` (MCP debugger).

## Legacy Subsystems (avoid mixing)

- `src/bridge/` — legacy CCR bridge (claude.ai-specific)
- `src/services/mcp/claudeai.ts` — legacy MCP connectors
- `src/services/oauth/` — legacy OAuth login
- Bridge v2 replacement is in `src/remote/` (provider-agnostic WebSocket server, auth tokens, NAT relay)

## Planning & Checkpoints

- **Plan mode** (`/plan`) — full-access planning with bypass permissions. Plans persist to `.clew/plans/long-term-plan.md`.
- **Checkpoints** — structured snapshots at 20%/45%/70% progress milestones with `notes.md` scratchpad. `/rewind` restores code or conversation to any prior checkpoint.

## Project Rules

Define auto-observed behavioral rules via `/rule` or `.clew/rules.json`:
```json
{
  "rules": [
    "Always use the existing test framework for new tests",
    "Prefer named exports over default exports"
  ]
}
```

## Workspace Linking

`/workspace link <path>` — link projects bidirectionally, persists in `.clew/workspace.json`. Auto-loads linked dirs on return. Subcommands: `link`, `unlink`, `load`, `list`. Source: `src/commands/workspace/`, `src/utils/workspace/`.

## Security Rules

Never commit: provider API keys, npm tokens, OAuth tokens, session cookies, `.env` files, private credentials, billing/subscription data. Prefer `process.env.KEY_NAME` over hardcoded secrets.

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
