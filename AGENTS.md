# AGENTS.md

This file provides guidance to Clew Code when working with code in this repository.

This is the canonical architecture and day-to-day development guide for this repository.

## Build / Test / Lint (Bun only)

```bash
bun run dev              # Live-reload REPL (prebuild-version + feature flags)
bun run dev:channels     # Dev with development channels (server:clew-orc)
bun run build            # Production build → dist/ (+ postbuild macro injection)
bun run start            # Run via scripts/bun-run.mjs
bun test                 # Full suite
bun test --bail          # Stop on first failure
bun test path/to/file.test.ts         # Single test file
bun test -t "test name"               # Single test by name
bun run check:ci         # Biome CI + circular/type-suppression debt ratchets
bun run lint             # Biome lint --write
bun run format           # Biome format --write
bun run check            # Biome check --write
bun run check:circular   # Runtime import-cycle ratchet (baseline 337)
bun run check:circular:strict # Fail while any runtime cycle remains
bun run check:suppressions    # @ts-expect-error ratchet (baseline 1372)
bun run check:suppressions:strict # Fail while any suppression remains
bun x tsc --noEmit       # Typecheck only (incremental — see below)
bun ci                   # Lockfile integrity
```

**Pre-push gate:**
```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

Prefer `/clew-verify` before push (gate + CLI smoke). Prefer `/clew-release` for version cuts.

### Typechecking

`tsconfig.json` sets `incremental: true`, so `tsc --noEmit` caches type information in
`tsconfig.tsbuildinfo` (gitignored) and reuses it for unchanged files. Measured on this
repo: **~75s cold, ~18s warm**, identical error set either way. The first run after a
`git pull` or a wide refactor pays full price; repeat runs are the fast ones.

**`tsc --noEmit` is currently clean (0 errors).** The remaining type debt is explicit suppression, not compiler errors: `.ts-expect-error-baseline` currently ratchets **1,372** `@ts-expect-error` directives. `check:ci` fails if that number increases; lower the baseline whenever suppressions are removed.

Redirect to a file and grep it rather than re-running `tsc` per file — a naive
per-file loop re-typechecks the whole project each iteration and takes minutes.

`tsgo` (`@typescript/native-preview`, the Go port of the compiler) runs this repo in
~35s but reports a slightly different error set — fine for fast feedback while editing;
**not** a substitute for `tsc` in the gate. Invoke with `bunx` if you want it.

`dev` / `build` always run `prebuild-version` and define:
`CHICAGO_MCP`, `VOICE_MODE`, `AWAY_SUMMARY`, `EXTRACT_MEMORIES`, `AGENT_TRIGGERS` (keep `FEATURES` in `scripts/bun-run.mjs` + `package.json` build in sync).

## Project rules

- Keep docs in sync — `AGENTS.md`, `CHANGELOG.md`, and `README.md` when behavior changes
- Use Bun for all dev commands
- ESM; `node:` for built-ins; `.js` extension on relative imports
- Biome: 2-space, single quotes, 120 columns, LF
- Edit `src/` only — never `dist/`
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- Branches: `type/description` (e.g. `feat/add-feature`)
- Before commit: full gate above
- Update `CHANGELOG.md` under `[Unreleased]` when behavior changes
- Never commit secrets (API keys, `.env`, credentials)
- Add/update tests when behavior changes

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
| `biome.json` | 2-space, single quotes, 120 columns, LF, VCS-aware (uses `.gitignore`), includes `src/**/*.{ts,tsx,js}` |
| `.mcp.json` | MCP server definitions (clew-bus, agora-mcp) |
| `.husky/pre-commit` | Pre-commit hook — shadow pair regression guard (`scripts/check-shadow-pairs.sh src`) |
| `.env` | API keys — never committed (in `.gitignore`) |

## Architecture (big picture)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                ENTRY                                         │
│               main.tsx ──► replLauncher.tsx                                 │
│          (flags, TTY, feature defines → Ink/React 19 bootstrap)             │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────────────────┐
│                            REPL / TUI                                        │
│                      screens/REPL.tsx                                        │
│                (input routing, panels, streaming UI)                        │
│                                    │                                         │
│                      state/AppState.tsx                                      │
│                (central state driving Ink UI)                                │
│  ink/ (components, hooks, events, layout, termio, buddy/)                   │
└──────────┬──────────────────────────────────────────────────────────┬────────┘
           │                                                          │
┌──────────▼──────────────┐          ┌────────────────────────────────▼───────┐
│  SLASH COMMANDS         │          │  QUERY ENGINE                          │
│  commands.ts            │          │                                        │
│  built-in, skills,      │          │  ┌─ QueryEngine.ts (streaming) ────┐   │
│  plugins, MCP, dynamic  │          │  │ tool loop, context compaction,   │   │
│  /delegate, /tools      │          │  │ checkpoints, Max Mode            │   │
│                         │          │  └──────────────────────────────────┘   │
│  plan mode              │          │  ┌─ query.ts (non-streaming) ──────┐   │
│  checkpoints /rewind    │          │  │ one-shot ask, no tool loop,      │   │
│  goal verification      │          │  │ used by subagents & bg tasks     │   │
│                         │          │  └──────────────────────────────────┘   │
└─────────────────────────┘          └──────────────┬──────────────────────────┘
                                                     │
                            ┌────────────────────────▼──────────────────────────┐
                            │  PROVIDER LAYER                                  │
                            │  services/ai/                                    │
                            │  ProviderManager + providers.json (~32 providers)│
                            │  providerRegistry, model selection, /model cmd   │
                            │  adapters & error normalizers per provider       │
                            └────────────────────────┬──────────────────────────┘
                                                     │
         ┌───────────────────────────────────────────┼──────────────────────────────┐
         │                                           │                              │
┌────────▼──────────┐  ┌─────────────────────────────▼────────────┐  ┌──────────────▼───────┐
│  TOOLS            │  │  SERVICES                                │  │  TASKS               │
│  tools.ts         │  │  mcp/ (client: stdio/SSE/HTTP/Direct)   │  │  Task.ts             │
│  presets: default,│  │  autonomous/ (queue, cron, DA, leases)  │  │  tasks/              │
│  core (8 tools),  │  │  python/ (persistent JSON-IPC REPL)     │  │  Dream, InProcess    │
│  python (CodeAct) │  │  compact/v2/ (reducer-based planner)    │  │  Agent (local/rem)   │
│  I/O, web, tasks, │  │  plugins/ (pre/post tool/bash/edit)     │  │  Shell               │
│  MCP, agents      │  │  lsp/ sessionSearch/ voiceInput/        │  │                      │

│  Monitor, LSP,    │  │  auditLog/ checkpoint/ goal/            │  │                      │
│  ComputerUse, etc │  │  coordinator/ migrations/ vim/          │  │                      │
└───────────────────┘  └──────────────────────────────────────────┘  └──────────────────────┘

                    AGENT EXECUTION LAYERS (pick by intent)

  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐
  │  Agent   │  │ Subagent │  │ Teammate │  │ Background│
  │ (main)   │  │ (Explore)│  │ (swarm)  │  │ /daemon   │
  └──────────┘  └──────────┘  └──────────┘  └───────────┘
```

Flow: **REPL input** → command match or **QueryEngine** → **ProviderManager** → model stream → tool calls → tools/services → UI/state.

Two query paths exist:
- **Streaming** (`src/QueryEngine.ts`): tool-loop, context compaction, checkpoints — the main path for interactive sessions
- **Non-streaming** (`src/query.ts`): one-shot ask (no tool loop) — used by subagents, skills, background tasks

Settings: `.clew/settings.json` (shared) and `.clew/settings.local.json` (local/private).

### Entrypoints (`src/entrypoints/`)

Alternative boot paths alongside the main REPL:

| File | Purpose |
|---|---|
| `cli.tsx` | Standard CLI bootstrap (flag parsing, profile resumption) |
| `init.ts` | First-run initialization flow |
| `mcp.ts` | MCP-server-only mode (headless stdio) |
| `agentSdkTypes.ts` | SDK type contracts, permission modes, message shapes |
| `sdk/` | Agent SDK protocol handlers |

Tools/commands are registered in `src/tools.ts` / `src/commands.ts`; entrypoints import those registrations.

### Registration patterns

- **Tool:** class under `src/tools/<Name>/` extending `Tool`; register in `src/tools.ts` → `getAllBaseTools()`. Feature-gated tools: lazy `require()` + `bun:bundle` defines.
- **Command:** module under `src/commands/`; add to `COMMANDS()` in `src/commands.ts`.
- **Provider:** declarative entry in `src/services/ai/providers.json` + adapter under `src/services/ai/` / `adapter/` as needed; discovery via `providerRegistry.ts` and live model fetching in `providerModels.ts`.

### Providers (`src/services/ai/`)

- `ProviderManager.ts` — unified call interface
- `providers.json` — ~32 provider definitions (flagged via `capabilities` object; live `models[]` array per provider). Per-model `maxContext` is the static fallback for the ctx% / auto-compact limit.
- `providerRegistry.ts` / `providerSelection.ts` — discovery & selection
- Context-window resolution: for non-Anthropic providers, live `/models` value (cached by `fetchProviderModels`, read via `getCachedModelLimits`) is preferred over the static `maxContext`. Anthropic first-party uses its own capability cache.
- Prompt cache: `promptCaching: explicit` (Anthropic) + `automatic` (26 providers — OpenAI/OpenRouter/DeepSeek/etc.) → `cache_control` 4 breakpoints (`system+tools+user+assistant`), deterministic tool sort, `CLEW_CACHE_RETENTION=long` defaults to 1h (alias `PI_CACHE_RETENTION`)
- Mid-session switch: `/model`, `/providers`
- **Model scope:** `/model` is session-scoped by default (AppState's `mainLoopModelForSession` → `setMainLoopModelOverride()`). Only the picker's `d` writes to `userSettings`. Do NOT call `ProviderManager.setSessionModel`/`setSessionProvider` (process-global singletons — leak into agents and bg tasks) from model paths.

### Tools / commands / services

Tools live one directory per tool under `src/tools/<Name>/`, registered in `src/tools.ts`.

Commands: ~105 under `src/commands/`; `src/commands.ts` is source of truth.

| Service area | Role |
|---|---|
| `ai/` | Multi-provider LLM |
| `mcp/` | MCP client (stdio/SSE/HTTP/DirectConnect) |
| `autonomous/` | Task queue, leases, cron, dead-letter, daemon |
| `compact/v2/` | **Reducer-based compaction** — triggers at **80%** of usable window (`limit*0.8`, like manual `/compact` at 80% ctx), single planner replaces the legacy reduction stack (active: `dedupe -> stale-tool -> summarize -> drop`), per-agent health |
| `longTermMemory/` (with `extract.ts` + `dream/` + `timeline`/`distill`/`graph`) | Unified long-term memory — `extractMemories` + `autoDream` consolidated here (0.9.3); old paths re-export then removed |
| `memory/` (filesystem) | SoT: `.clew/memory/store/*.md` + `timeline.jsonl` + derived `index.json` cache — `frontmatter.ts` + `indexCache.ts` (mtime+size) |
| `taste/` (filesystem) | SoT: `.clew/taste/rules|evidence|conflicts/*.md` — auto-learning `Signal→Evidence→Learner→Rule` (`candidate→weak→active→conflicted`), `/taste why` |
| `shining/` (filesystem) | Anticipatory layer: `observer → predictor → scorer (Taste prior) → premonition-store (.clew/shining/premonitions/*.md)` + `policy` + `prefetch` → `ToolSearch`/`Memory`/`Todo` |
| `checkpoint/`, `goal/` | Progress snapshots & goal verification |
| `plugins/` | Pre/Post tool/bash/edit hooks |
| `sessionSearch/`, `SessionLifecycle/`, `SessionMemory/` | Session life & FTS5 search |
| `voiceInput/` | Voice transcription |
| `auditLog/` | Opt-in SIEM NDJSON audit trail |
| `lsp/` | Language server integration |

Other large surface areas: `src/agentRuntime/` (background orchestration, ultracode, workflows), `src/memory/` (filesystem-backed memory SoT), `src/remote/` (remote-session transport/history; Bridge v2 `/remote` was removed), `src/plugins/`, `src/skills/`, `src/coordinator/`, `src/tasks/`, `src/vim/`, `src/buddy/`, `src/cli/` (arg parsing), `src/assistant/` (Kairos), `src/upstreamproxy/`, `src/native-ts/`, `src/moreright/`.

## System prompt flow

The interactive session's system prompt is built in two layers:

1. **Selection** — `buildEffectiveSystemPrompt()` (`src/utils/systemPrompt.ts`) decides *which* prompt to use, by priority: `overrideSystemPrompt` (e.g. loop mode, replaces everything) → coordinator mode (`CLEW_CODE_COORDINATOR_MODE`) → agent (`mainThreadAgentDefinition`, from `--agent` / `.clew/agents/*.md`) → custom (`--system-prompt`) → default. `appendSystemPrompt` is appended last. In proactive/KAIROS mode an agent prompt is *appended* to the default instead of replacing it. This function does NOT assemble sections — it only picks a root prompt.
2. **Assembly** — `getSystemPrompt()` (`src/constants/prompts.ts`) composes the default root, in this order: static sections (`getSimpleIntroSection`, `getSimpleSystemSection`, `getSimpleDoingTasksSection`, `getActionsSection`, `getUsingYourToolsSection`, `getSimpleToneAndStyleSection`, `getOutputEfficiencySection`), then `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`, then the dynamic sections above. Static blocks are inlined; dynamic blocks are registry-managed via `systemPromptSection(name, compute, deps)` from `src/constants/systemPromptSections.ts`.

Dynamic section registry (each can be `null`/feature-gated; resolved by `resolveSystemPromptSections`):

| Section | Notes |
|---|---|
| `session_guidance` | From enabled tools + skill tool commands |
| `memory`, `taste`, `shining`, `budgeted_memory` | Auto-memory / taste / **shining premonitions+prefetch** / budgeted memory |
| `session_goal` | Active goal |
| `env_info_simple` | Model/environment info; `deps: [model]` so it recomputes on `/model` switch |
| `language`, `output_style` | Locale + output style config |
| `mcp_instructions` | **Uncached** (`DANGEROUS_uncachedSystemPromptSection`) — MCP servers connect between turns |
| `scratchpad`, `frc`, `summarize_tool_results` | Goals/housekeeping sections |
| `focus_mode` | Non-interactive sessions only |
| `brief` | KAIROS feature only |

Cache: sections memoized per `deps` tuple in `src/bootstrap/state.ts`, cleared on `/clear` and `/compact`. A section whose content depends on mutable session state (the active model above all) must declare it in `deps` or it stays stale after a mid-session `/model` switch.

Side prompts outside the system prompt: `CODING_SYSTEM_PROMPT` (`src/constants/codingSystemPrompt.ts`, used by QueryEngine as the profile prompt), `getGoalPrompt()`, `loadMemoryPrompt()`, `getMcpInstructions()` (only when MCP-instructions-delta is off). Subagent/bg-task branches call `buildEffectiveSystemPrompt` separately (`src/tools/AgentTool/AgentTool.tsx`, `src/commands/bg/bg.ts`, `src/commands/compact/compact.ts`, `src/screens/REPL.tsx`).

### Execution layers (pick by intent)

| Layer | Use when |
|---|---|
| Agent | Main session or `.clew/agents/*.md` |
| Subagent (`Agent` tool / Explore) | Short independent work; Explore is read-only |
| Teammate / swarm | Multi-turn named workers with mailbox |
| Background / daemon | Queue + cron via `autonomous` + `agentRuntime` (`/bg`, `/daemon`) |

Also: **plan mode** (`.clew/plans/`), **checkpoints** (20%/45%/70% + `/rewind`), **goal verification**, **Max Mode** (parallel candidates + judge).

## Gateway mode

Default auth path is `api.clew-code.org` (not Anthropic OAuth), unless `CLEW_DISABLE_GATEWAY` is set. Impl: `src/utils/gatewayAuth.ts`; token: `~/.clew/gateway.json`; `/login`/`/logout` default to gateway (`gwlogin`/`gwlogout`).

## TinyFish (default web toolkit)

Prefer TinyFish MCP for web work over built-in WebSearch/WebFetch/BrowserTool when available:

| TinyFish | Instead of |
|---|---|
| `search` | WebSearch |
| `fetch_content` | WebFetch |
| `run_web_automation` | BrowserTool |

## Memory & Shining (filesystem SoT)

- **Memory:** `.clew/memory/store/*.md` (frontmatter `id/key/type/importance/confidence`) + `timeline.jsonl` + derived `index.json` (mtime+size, `indexCache.ts`), `database.ts` is now filesystem. Cleanup: `bun run cleanup:memory-db` removes legacy `memory.db/chunks.db/taste.db`.
- **Shining:** `.clew/shining/premonitions/*.md` (10 min TTL), `observer → predictor (heuristic + Taste prior) → scorer → premonition-store → policy (ignore/prefetch/suggest/prepare) → prefetch → <shining_premonitions>+<shining_prefetch>` injected via `systemPromptSection('shining')`; premonitions boost `ToolSearch` (don't defer predicted tools) and `budgetedInject` (+0.15) and surface `→ Suggested Todo`.

## Semantic memory index (`src/memdir/`)

- SQLite-vec vector index for O(log N) semantic memory search (`vectors.db`, vec0 virtual table)
- `semanticIndex.ts`: mtime vs `indexed_at` change detection; `content_hash` skips re-embedding
- `semanticSearch.ts`: `syncIndex()` self-heals before every query
- Falls back to JS brute-force cosine if native sqlite-vec fails to load
- Commands: `/memory-search`, `/index-admin stats|prune|clear`

## Workspace linking

`/workspace link|unlink|load|list` — projects in `.clew/workspace.json`. Source: `src/commands/workspace/`, `src/utils/workspace/`.

## Pre-commit hooks (`.husky/`)

| Hook | Action |
|---|---|
| `pre-commit` | Runs `bash scripts/check-shadow-pairs.sh src` — blocks reintroduced `.ts`/`.js` shadow pairs |

## RTK (Rust Token Killer) — opt-in

RTK is **not bundled**. If you want output compression, install it yourself (`cargo install rtk`) and re-enable the wrap in `src/utils/Shell.ts` (set `rtkAvailable` back to `whichSync('rtk') !== null`). Default: disabled — no external shell interceptors.

## GitHub Actions (`.github/workflows/`)

CI runs typecheck, lint, build, tests. Pushing a `v*` tag triggers the release workflow (GitHub Release + npm publish).

TypeScript error budget stored in `.ts-error-baseline` (current: **0** — was 1867, fixed 0.9.2 → 0.9.3 via Transport interface + DCE suppressions). CI fails only on regression (count > baseline), not existing debt. Update it when you fix errors.

## Tests

Co-located `.test.ts`/`.test.tsx` with sources (under `src/` and `tests/`), run with Bun test runner. Unit tests co-located; integration tests in `tests/`.

## Scripts

| Script | Role |
|---|---|
| `scripts/prebuild-version.mjs` | Writes generated version info |
| `scripts/check-circular-deps.mjs` | Runtime import-cycle report + baseline/strict enforcement |
| `scripts/check-type-suppressions.mjs` | `@ts-expect-error` baseline/strict enforcement |
| `scripts/postbuild-inject-macro.mjs` | Post-build macro injection |
| `scripts/bun-run.mjs` | Dev/start runner with defines |
| `src/components/CustomSelect/select.tsx` | `BaseOption.preview` + `p` toggle — side (≥100 cols) or bottom preview, live on focus |
| `src/components/ModelPicker.tsx` | `/model` preview per model via `<Markdown>` example |
| `src/bootstrap/tty.ts` | TTY side-effect extracted from `main.tsx` (0.9.3, 6246→6206) |
| `src/utils/messagesConstants.ts` | `INTERRUPT`/`SYNTHETIC` constants extracted from `messages.ts` (0.9.3, 5160→5111) |

## Release

`v*` tag → GitHub Actions release + npm-only publish. The workflow authenticates with the repository `NPM_TOKEN` secret. Before tag: run `bun run version:patch|minor|major`, update `CHANGELOG.md` `[Unreleased]`, run full gate. Use `/clew-release`.

## Dashboard (cross-repo)

`clew-code.org/app/` is served from `clew-api/dashboard/index.html` (Cloudflare Pages on `ClewCode/clew-api`), not the website repo. Dashboard UI changes go to `clew-api`.

## Legacy surfaces to avoid mixing

- `src/bridge/` — legacy CCR
- `src/services/mcp/claudeai.ts`, `src/services/oauth/`, `src/services/claudeAiLimits.ts` — claude.ai-era paths
- Bridge v2 `/remote` is removed. For remote execution use the supported CCR/teleport path and existing remote-session transport; do not reintroduce the deleted relay/token-store stack without a new design review.