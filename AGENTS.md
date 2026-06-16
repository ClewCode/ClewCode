# AGENTS.md

This file provides guidance to **Clew Code** agents when working with code in this repository.

## Build / Test / Lint

Run all commands from the repository root using **Bun**.

```bash
bun run dev              # Live reload via tsx, no build required
bun run build            # Production build to dist/
bun run start            # Run compiled build
bun test                 # Full test suite via Vitest
bun test --bail          # Stop on first test failure

npx vitest run path/to/file.test.ts   # Run a single test file
npx vitest run -t "test name"         # Run a single test by name

bun run check:ci         # Full CI: lint:check + test --bail + typecheck + build
bun run lint             # Biome lint with auto-fix
bun run format           # Biome format with auto-fix
bun x tsc --noEmit       # TypeScript type-check only
bun ci                   # Lockfile integrity check
bun run docs:generate    # Auto-generate docs from source
```

## Release

Pushing a `v*` tag triggers GitHub Actions release and npm publish.

Before tagging:

1. Update the version in `package.json`.
2. Update `CHANGELOG.md` under `## [Unreleased]`.
3. Run:

```bash
bun run check:ci
```

Release helper:

```bash
bun run version:patch
```

## Architecture

### Entry & Execution

`src/main.tsx` is the single CLI entrypoint.

It:

* Forces TTY behavior.
* Parses CLI flags such as `-p` and `--resume`.
* Boots the Ink-based REPL through `src/replLauncher.tsx`.

The REPL mounts UI screens from:

```txt
src/screens/
```

Slash command routing is handled by:

```txt
src/commands.ts
```

### Core Query Loop

`src/QueryEngine.ts` handles:

* Message construction
* Tool loop execution
* Provider routing
* Streaming responses
* Tool call handling

`src/query.ts` is the non-streaming variant.

### Provider System

Provider logic lives in:

```txt
src/services/ai/
```

Important files:

```txt
src/services/ai/ProviderManager.ts
src/services/ai/providers.json
src/services/ai/providerRegistry.ts
src/services/ai/adapter/
src/services/ai/errorNormalizer.ts
src/services/ai/usageNormalizer.ts
```

Responsibilities:

* Unified interface for LLM calls
* Declarative provider definitions
* Provider discovery and model selection
* Per-provider request/response normalization
* Cross-provider error and usage normalization

Users can switch providers mid-session with:

```txt
/model
```

### Tools

Built-in tools live in:

```txt
src/tools/
```

Examples include:

* Read
* Write
* Edit
* Bash
* Glob
* Grep
* WebSearch
* WebFetch
* Browser
* PR tools
* Peer tools
* MCP tools

Each tool should return the standard result shape:

```ts
{
  ok: boolean;
  summary: string;
  data?: unknown;
}
```

Register new tools in:

```txt
src/tools/Tool.ts
```

### Slash Commands

Slash commands live in:

```txt
src/commands/
```

Each command should export:

```ts
{
  command: string;
  description: string;
  handler: Function;
}
```

Register commands in:

```txt
src/commands.ts
```

Important commands include:

```txt
/model
/peer
/mcp
/plugin
/memory
/daemon
/loop
/remote
/pr
/code-review
```

### MCP Integration

MCP services live in:

```txt
src/services/mcp/
```

Supported transports:

* stdio for local subprocesses
* SSE for remote servers and OAuth flows
* DirectConnect for in-process integrations

Server configuration:

```txt
.mcp.json
```

### Peer / P2P

Peer coordination lives in:

```txt
src/peer/
```

Core components:

```txt
src/peer/PeerServer
src/peer/PeerDiscovery
```

The peer system supports LAN coordination through:

* UDP multicast
* File-based peer registry
* Peer discovery
* Worker spawning
* Remote task execution
* Broadcast messaging
* Direct peer messaging

### Autonomous Loop

Autonomous task execution lives in:

```txt
src/services/autonomous/
```

Features:

* Persistent task queue
* Lease-based concurrency
* Maximum 3 workers
* Cron scheduling
* Exponential backoff retry
* Dead-letter management

### Plugins & Skills

Plugins live in:

```txt
src/plugins/
```

Supported lifecycle hooks include:

* `PreToolUse`
* `PostToolUse`
* `PreBash`
* `PostPrompt`
* `PreAcceptEdit`

Skills live in:

```txt
src/skills/
```

Skills are Claude Code-compatible and are defined through `SKILL.md` files.

### UI Layer

The terminal UI uses Ink with React 19.

Important directories:

```txt
src/components/   # Ink UI components
src/screens/      # Main screens
src/state/        # App state management
src/hooks/        # React hooks for UI state
```

### Session & Memory

Session logs live in:

```txt
src/session/
```

`SessionLogger` writes JSON logs to:

```txt
.session/<id>.json
```

Long-term memory lives in:

```txt
src/memory/
```

Memory features:

* SQLite storage
* Topic indexing
* Weekly consolidation
* Monthly consolidation

Research dossier features live in:

```txt
src/research/
```

### Remote Control

Remote control lives in:

```txt
src/remote/
```

The v2 bridge provides:

* WebSocket server
* One-time auth tokens
* Optional NAT-traversal relay
* Provider-agnostic remote control

## Key Conventions

### Runtime & Module Style

This repository is ESM-only.

```json
{
  "type": "module"
}
```

Rules:

* Use `node:` prefixes for Node built-ins.
* Use `.js` extensions for relative imports.
* Use Bun for local development commands.
* Prefer TypeScript source changes in `src/`.

Correct:

```ts
import { readFile } from 'node:fs/promises';
import { thing } from './thing.js';
```

Incorrect:

```ts
import { readFile } from 'fs/promises';
import { thing } from './thing';
```

### Source vs Build Output

Source code lives in:

```txt
src/
```

Do not edit:

```txt
dist/
```

`dist/` is generated build output.

### Formatting

This repository uses Biome.

Scope:

```txt
src/**/*.ts
src/**/*.tsx
src/**/*.js
```

Style:

* 2-space indent
* Single quotes
* 120 columns
* LF endings

Use:

```bash
bun run lint
bun run format
```

### Documentation

Docs live in:

```txt
docs/
```

Docs are static HTML and are tracked in git.

You may either:

* Edit HTML files directly.
* Run:

```bash
bun run docs:generate
```

Shared docs shell logic lives in:

```txt
docs/js/main.js
```

It injects:

* Header
* Sidebar
* Footer

### Settings

Shared project settings:

```txt
.clew/settings.json
```

Private local settings:

```txt
.clew/settings.local.json
```

Never commit private secrets, API keys, npm tokens, or credentials.

Use environment variables instead.

## Git Workflow

### Branch Naming

Use:

```txt
type/description
```

Examples:

```bash
git checkout -b feat/add-provider-router
git checkout -b fix/browser-tool-timeout
git checkout -b docs/update-agent-guide
```

### Commit Style

Use conventional commits:

```txt
feat: add new feature
fix: resolve bug
chore: update tooling or dependencies
refactor: restructure without behavior change
docs: documentation only
test: add or update tests
```

Examples:

```bash
git commit -m "feat: add provider usage normalizer"
git commit -m "fix: prevent browser tool crash on invalid selector"
git commit -m "docs: update AGENTS guide"
```

### Before Commit

Always run:

```bash
bun run check:ci
```

Also update:

```txt
CHANGELOG.md
```

Add changes at the top under:

```txt
## [Unreleased]
```

## Important Notes

### Reverse-Engineered Architecture

Clew Code is a reverse-engineered reimplementation inspired by Anthropic's Claude Code.

Some legacy subsystems may still depend on claude.ai-specific behavior, including:

```txt
src/bridge/
src/services/mcp/claudeai.ts
src/services/oauth/
src/services/claudeAiLimits.ts
```

Examples of legacy claude.ai-related features:

* Legacy CCR bridge
* MCP claude.ai connectors
* OAuth login
* Subscription and billing UI
* Claude-in-Chrome extension

The provider-agnostic replacement is Bridge v2 in:

```txt
src/remote/
```

When modifying these areas, avoid mixing provider-agnostic code with legacy claude.ai-specific logic.

### process_peer Tool

The `process_peer` tool runs Codex in exec/pty mode for external process-backed AI workers.

Use it carefully for:

* Process-backed AI worker tasks
* External command execution
* Mesh-controlled automation

Do not use it for simple local logic that can be handled directly inside the current process.

## Security Rules

Never commit:

* Provider API keys
* npm tokens
* OAuth tokens
* Session cookies
* `.env` files
* Private credentials
* Local user secrets
* Billing or subscription data

Prefer:

```txt
process.env.KEY_NAME
```

over hardcoded secrets.

## Agent Checklist

Before making code changes:

1. Read the relevant files first.
2. Understand the existing pattern.
3. Modify source files in `src/`, not `dist/`.
4. Keep imports ESM-compatible.
5. Add or update tests when behavior changes.
6. Update docs when public behavior changes.
7. Update `CHANGELOG.md` under `## [Unreleased]`.
8. Run:

```bash
bun run check:ci
```

9. Use a conventional commit message.