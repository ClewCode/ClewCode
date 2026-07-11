# AGENT.md

This file provides guidance to Clew Code when working with code in this repository.

For a longer architecture deep-dive see `AGENTS.md`. Prefer this file for day-to-day agent operation; keep both in sync when architecture or workflow changes.

## Build / Test / Lint (Bun only)

```bash
bun run dev              # Live-reload REPL (prebuild-version + feature flags)
bun run dev:channels     # Dev with development channels (server:clew-orc)
bun run build            # Production build → dist/ (+ postbuild macro injection)
bun run start            # Run via scripts/bun-run.mjs
bun test                 # Full suite
bun test --bail          # Stop on first failure
npx vitest run path/to/file.test.ts   # Single test file
npx vitest run -t "test name"         # Single test by name
bun run check:ci         # Biome CI (lint + format, no autofix)
bun run lint             # Biome lint --write
bun run format           # Biome format --write
bun run check            # Biome check --write
bun x tsc --noEmit       # Typecheck only
bun ci                   # Lockfile integrity
bun run codegraph        # Write structure map to .clew/CODEGRAPH.md
```

**Pre-push gate:**
```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

Prefer `/clew-verify` before push (gate + CLI smoke). Prefer `/clew-release` for version cuts.

`dev` / `build` always run `prebuild-version` and define:
`TRANSCRIPT_CLASSIFIER`, `CHICAGO_MCP`, `VOICE_MODE` (build also sets `AWAY_SUMMARY`).

## Project rules (from `.clew/rules.json`)

- Keep docs in sync — `AGENTS.md`, `CHANGELOG.md`, `README.md` (and this file) when behavior changes
- Use Bun for all dev commands
- ESM; `node:` for built-ins; `.js` extension on relative imports
- Biome: 2-space, single quotes, 120 columns, LF, scope `src/**/*.{ts,tsx,js}`
- Edit `src/` only — never `dist/`
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- Branches: `type/description` (e.g. `feat/add-feature`)
- Before commit: full gate above
- Update `CHANGELOG.md` under `[Unreleased]` when behavior changes
- Add/update tests when behavior changes
- `/graphify` → load the graphify skill first

## Code conventions

- `"type": "module"`; tsconfig is `module: ESNext`, `moduleResolution: bundler`, `strict: true`
- Path alias: `src/*` → `src/*`
- Export interfaces/factories from barrels where the area already uses them
- Tool result contract: `{ ok: boolean; summary: string; data?: unknown }`
- Commands export `{ name, description, type, handler, ... }` (`type`: `prompt` | `local` | `local-jsx`)

## Config files (source of truth for tooling)

| File | Role |
|---|---|
| `tsconfig.json` | `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `jsx: react-jsx`, path alias `src/*` |
| `biome.json` | 2-space, single quotes, 120 columns, LF, VCS-`git`-aware (uses `.gitignore`), includes `src/**/*.{ts,tsx,js}` |
| `.mcp.json` | MCP server definitions (codegraph, clew-bus, clew-peer, agora-mcp) |
| `.husky/pre-commit` | Pre-commit hook for shadow pair guard (`scripts/check-shadow-pairs.sh src`) |
| `.env` | API keys — never committed (in `.gitignore`) |

## Architecture (big picture)

```
src/main.tsx                CLI entry (flags, TTY force, version MACRO, feature defines)
src/replLauncher.tsx        Ink/React 19 REPL bootstrap
src/screens/REPL.tsx        Main TUI — input routing, panels, streaming UI
src/commands.ts             Slash registry: built-in + skills + plugins + MCP + dynamic
src/QueryEngine.ts          Streaming LLM loop: messages, tools, provider routing
src/query.ts                Non-streaming query path
src/tools.ts                getAllBaseTools() registry
src/Tool.ts                 Tool base class
src/tools/                  76 tool packages (one dir each)
src/Task.ts                 Async task base
src/tasks/                  Task definitions (Dream, InProcess, Local/Remote Agent, Shell)
src/state/AppState.tsx      Central AppState (drives Ink UI)
src/state/                  State management (slices for UI, session, peers, etc.)
src/services/ai/            ProviderManager + providers.json + adapters + normalizers
src/ink/                    Custom Ink/React 19 infrastructure (components, hooks, events, layout, termio)
src/memdir/                 SQLite-vec semantic memory index (O(log N) vector search)
src/query/                  Query path utilities and helpers
src/coordinator/            Cross-component orchestration
src/migrations/             Database migrations
src/vim/                    Vim mode implementation
src/voice/                  Voice input transcription and management
src/buddy/                  Companion sprite UI and prompts
```

Flow: **REPL input** → command match or **QueryEngine** → **ProviderManager** → model stream → tool calls → tools/services → UI/state.

Two query paths exist:
- **Streaming** (`src/QueryEngine.ts`): tool-loop, context compaction, checkpoints — the main path for interactive sessions
- **Non-streaming** (`src/query.ts`): one-shot ask (no tool loop) — used by subagents, skills, background tasks

Settings: `.clew/settings.json` (shared) and `.clew/settings.local.json` (local/private).

### Registration patterns

- **Tool:** class under `src/tools/<Name>/` extending `Tool`; register in `src/tools.ts` → `getAllBaseTools()`. Feature-gated tools: lazy `require()` + `bun:bundle` defines.
- **Command:** module under `src/commands/`; add to `COMMANDS()` in `src/commands.ts`.
- **Provider:** declarative entry in `src/services/ai/providers.json` + adapter under `src/services/ai/` / `adapter/` as needed; discovery via `providerRegistry.ts` / `ModelDiscoveryService.ts`.

### Providers (`src/services/ai/`)

- `ProviderManager.ts` — unified call interface
- `providers.json` — ~29 provider definitions
- `providerRegistry.ts` / `providerSelection.ts` — discovery & selection
- `adapter/`, error/usage normalizers — cross-provider shape
- Mid-session switch: `/model`, `/provider`

### Tools / commands / services

Tools live one directory per tool under `src/tools/` (I/O, web, tasks, 15+ peer tools, MCP, agents, memory, media, UI, Goal, Monitor, LSP, ComputerUse, etc.).

Commands: ~90–100 under `src/commands/` (not every file is a top-level slash command; `commands.ts` is source of truth).

Services that matter most for product behavior:

| Area | Role |
|---|---|
| `ai/` | Multi-provider LLM |
| `mcp/` | MCP client (stdio/SSE/HTTP/DirectConnect) |
| `autonomous/` | Task queue, leases (max 3), cron, dead-letter, daemon |
| `compact/`, `contextCollapse/` | Context compression / collapse |
| `longTermMemory/`, `autoDream/`, `extractMemories/` | Dream/Distill & extraction |
| `checkpoint/`, `goal/` | Progress snapshots & goal verification |
| `plugins/` | Pre/Post tool/bash/prompt/edit hooks |
| `sessionSearch/`, `SessionLifecycle/`, `SessionMemory/` | Session life & FTS5 search |
| `voiceInput/` | Voice transcription |
| `auditLog/` | Opt-in SIEM NDJSON audit trail |
| `lsp/` | Language server integration |

Other large surface areas: `src/agentRuntime/` (background orchestration, ultracode, workflows), `src/peer/` (LAN P2P), `src/memory/` (SQLite memory store), `src/remote/` (Bridge v2), `src/bridge/` (legacy CCR — claude.ai-specific; do not mix with `remote/`), `src/plugins/`, `src/skills/`, `src/coordinator/`, `src/tasks/`, `src/vim/`, `src/voice/`, `src/buddy/`.

### Execution layers (pick by intent)

| Layer | Use when |
|---|---|
| Agent | Main session or `.clew/agents/*.md` |
| Subagent (`Agent` tool / Explore) | Short independent work; Explore is read-only |
| Teammate / swarm | Multi-turn named workers with mailbox/tasks |
| LAN peer (`/peer`) | Other Clew instances on machine/LAN |
| Process peer | Local external CLI worker (e.g. Codex via `process_peer`) |
| Background / daemon | Queue + cron via autonomous + agentRuntime (`/bg`, `/daemon`) |

Also: **plan mode** (`.clew/plans/`), **checkpoints** (20%/45%/70% + `/rewind`), **goal verification**, **Max Mode** (parallel candidates + judge).

### Profiles

**Personal profile** — command-center: plan, split work, delegate coding to process peers, review results. Cross-session memory, skill creation from repeated workflows, cron/loop, daemon queue. Profile + last permission mode persist.

## Gateway mode

Default auth path is `api.clew-code.org` (not Anthropic OAuth), unless `CLEW_DISABLE_GATEWAY` is set.

- Impl: `src/utils/gatewayAuth.ts` (`login`, `loginViaBrowser`, token IO, `isGatewayConfigured`)
- Token: `~/.clew/gateway.json`
- `/login` / `/logout` are gateway-oriented by default (`gwlogin` / `gwlogout` modules)

## TinyFish (default web toolkit)

Prefer TinyFish MCP for web work over built-in WebSearch / WebFetch / BrowserTool when available:

| TinyFish | Instead of |
|---|---|
| `search` | WebSearch |
| `fetch_content` | WebFetch |
| `run_web_automation` | BrowserTool |

## Semantic memory index (`src/memdir/`)

- **SQLite-vec** vector index for O(log N) semantic memory search — `vectors.db` with vec0 virtual table
- `semanticIndex.ts`: change detection via mtime vs `indexed_at`; `content_hash` skips re-embedding
- `semanticSearch.ts`: `syncIndex()` runs before every query (concurrent with embedding) — self-healing
- Falls back to JS brute-force cosine if native sqlite-vec extension fails to load
- Commands: `/memory-search`, `/index-admin stats|prune|clear`

## Graphify & codegraph

- Knowledge graph: `graphify-out/` — for codebase questions: `graphify query "..."`, relationships: `graphify path "A" "B"`, concepts: `graphify explain "..."`. After structural edits: `graphify update .`
- Fallback map: `bun run codegraph` → `.clew/CODEGRAPH.md`
- Project also configures codegraph MCP in `.mcp.json`

## Workspace linking

`/workspace link|unlink|load|list` — bidirectional project links in `.clew/workspace.json`. Source: `src/commands/workspace/`, `src/utils/workspace/`.

## Pre-commit hooks (`.husky/`)

| Hook | Action |
|---|---|
| `pre-commit` | Runs `bash scripts/check-shadow-pairs.sh src` — blocks commits that create `.ts`/`.js` shadow pairs |
| Additional | Configured via `.husky/` — check current file for the full list |

## GitHub Actions (`.github/workflows/`)

CI runs typecheck, lint, build, and tests. Pushing a `v*` tag triggers the release workflow (GitHub Release + npm publish).

## Tests (59 test files)

Located across `src/` (co-located `.test.ts`) and `tests/` (integration). Run with Bun's native test runner (`bun test`). Key patterns:
- **Unit tests**: co-located with source (e.g. `src/tools/GoalTool.test.ts`)
- **Integration tests**: in `tests/` directory for multi-component scenarios

## Scripts

| Script | Role |
|---|---|
| `scripts/prebuild-version.mjs` | Writes generated version info |
| `scripts/postbuild-inject-macro.mjs` | Post-build macro injection |
| `scripts/bun-run.mjs` | Dev/start runner with defines |
| `scripts/codegraph.ts` | Structure map generator |
| `scripts/agent-room.ts` | Agent room helper |
| `src/remote/relay-server.ts` | Relay (`bun run relay`) |

## Release

`v*` tag → GitHub Actions release + npm publish. Before tag: bump `package.json`, update `CHANGELOG.md` `[Unreleased]`, run full gate. Use `/clew-release`.

## Dashboard (cross-repo)

`clew-code.org/app/` is served from **`clew-api/dashboard/index.html`** (Cloudflare Pages on `ClewCode/clew-api`), not from the website repo’s `app/index.html`. Dashboard UI changes go to `clew-api`.

## Legacy surfaces to avoid mixing

- `src/bridge/` — legacy CCR
- `src/services/mcp/claudeai.ts`, `src/services/oauth/`, `src/services/claudeAiLimits.ts` — claude.ai-era paths
- Prefer provider-agnostic `src/remote/` for new bridge work

`/ant` removed; `/datadog` disabled (`isEnabled: () => false`).
