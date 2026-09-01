<div align="center">

<img src="https://raw.githubusercontent.com/ClewCode/ClewCode/main/assets/clew-logo-long.png" alt="Clew Code" width="520" />

### *The agent that works where you do.*

<p align="center">
  <a href="https://github.com/ClewCode/ClewCode/stargazers"><img src="https://img.shields.io/github/stars/ClewCode/ClewCode?style=for-the-badge&color=blue" alt="GitHub stars"></a>
  <a href="https://github.com/ClewCode/ClewCode/releases"><img src="https://img.shields.io/github/v/release/ClewCode/ClewCode?style=for-the-badge&color=orange" alt="Release"></a>
  <a href="https://www.npmjs.com/package/clew-code"><img src="https://img.shields.io/npm/v/clew-code?style=for-the-badge&color=red" alt="npm"></a>
  <a href="https://github.com/ClewCode/ClewCode/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <a href="https://clew-code.org">Website</a> · <a href="https://clew-docs.pages.dev">Docs</a> · <a href="https://github.com/ClewCode/ClewCode/wiki">Wiki</a> · <a href="https://github.com/ClewCode/ClewCode">GitHub</a>
</p>

</div>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/ClewCode/ClewCode/main/assets/screenshots/clew-code-repl.png" alt="Clew Code REPL" width="680" />
</p>

---

Clew Code is a terminal-native AI coding agent that works inside your repository. It inspects code, edits files, runs commands, uses external tools, and coordinates multi-step work through **the provider and model you choose**.

**Bring your own provider.** Claude, GPT, Gemini, DeepSeek, Groq, local Ollama models, OpenRouter, and 30+ more — all routed through one interface. Clew Code does not require a hosted coding backend; prompts are sent only to services you explicitly configure, plus any web or MCP service you opt into.

## Contents

- [Install](#install)
- [Start here](#start-here)
- [Choose a provider & model](#choose-a-provider--model)
- [Features](#features)
- [Common workflows](#common-workflows)
- [Automatic compaction](#automatic-compaction)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Security](#security)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Install

### npm

```bash
npm install -g clew-code
```

The package provides both `clew` and `clewcode` commands.

### macOS and Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.ps1 | iex
```

### From source (Bun)

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run build
```

## Start here

```bash
cd your-project
clew
```

Non-interactive forms:

```bash
clew -p "fix the failing tests and explain the root cause"
clew --resume last
clew --model openai/gpt-5.5
```

On first launch, configure at least one provider. Run `/login` to authenticate through the default Clew gateway (`api.clew-code.org`), or paste a provider API key directly. Credentials live in local Clew configuration and should never be committed.

Example prompts:

```text
> how does authentication work in this repository?
> refactor UserCard to use the new Avatar component
> run the tests, diagnose failures, and fix them
```

Clew Code inspects relevant files, applies focused changes according to the active permission mode, and verifies results with your project's own tools.

## Choose a provider & model

Open the model picker:

```text
/model
```

The picker groups models by provider and refreshes live model lists for configured providers when it opens. Its compact model console shows each model's context window, Vision/Tools/Reasoning support, default effort, current-session marker, and estimated input/cache/output price while you browse. Missing capability fields fall back from the bundled registry to OpenRouter's cached model catalog; truly unknown fields remain `?`. Providers without usable credentials fall back to the bundled static registry. Select a provider-qualified model directly with:

```text
/model provider/model
```

Manage provider connections and credentials:

```text
/providers
```

| Action | Result |
|---|---|
| `Enter` | Use the selected model for this session only |
| `d` or `g` | Save the selected provider/model as the default |
| `/model provider/model` | Select a provider-qualified model for this session |
| `/model default` | Clear the current session override |
| `/model list` | List models from the active provider |
| `/model --help` | Show command help |

Session choices do not change the shared default for other sessions. Capability labels may include context size, output limit, tools, vision, reasoning, and free-tier status when the provider exposes that metadata.

**Gateway mode.** By default Clew authenticates through `api.clew-code.org` (unless `CLEW_DISABLE_GATEWAY` is set). The gateway brokers provider keys so you can switch models without re-entering credentials; `/login` and `/logout` manage your gateway session.

## Features

- **Multi-provider model selection** — 30+ providers with live discovery and a static fallback registry. Model-id matching is separator-bound (`gpt-4` no longer matches `gpt-4o`) so `ctx%`, `max_tokens`, and `reasoning` capabilities resolve to the exact model.
- **Streaming REPL** — tool use, checkpoints, context compaction, and `/rewind`.
- **Full tool belt** — file read/write/edit, search, shell, Git, browser, LSP, web, and media tools.
- **Task-aware planning** — the system prompt enforces `ALWAYS TaskCreate/TodoWrite BEFORE 2+ steps, ONE in_progress` (threshold `3→2`, reminders every 3/5 turns) so multi-step work is always tracked and resumable.
- **Durable agent session tree** — every agent (main, subagents, teammates, background daemons) is tracked in a persistent, file-backed tree that survives TUI close/restart. Attach and inspect running agents with `/agents` or the background room (press `←` from an empty prompt).
- **Rooted token ledger** — every API response is attributed to `(rootSessionId, agentId, parentAgentId)` and written to a JSONL ledger, giving a per-agent cost breakdown even across recursive subagent trees.
- **Durable message queue & retained artifacts** — messages sent while the TUI is closed are queued and drained on reattach; large outputs can be parked outside the context window and recalled by handle.
- **Self-refinement** — proposals with diff/provenance/verifier/rollback are staged under `.clew/refinements/` for explicit, reversible promotion.
- **Context intelligence** — Aider-style Repo Map for token-budgeted code snapshots, and hybrid semantic + keyword code search (`/code-search`) over FTS5 and sqlite-vec.
- **Adaptive auto-compact** — reducer-based planner reclaims context with the least-damaging combination of transforms.
- **Memory & taste** — persistent SQLite memory with semantic search, plus a Taste Learning system that adapts to your coding conventions.
- **Plugins, skills & MCP** — extend the agent with hooks, reusable `SKILL.md` workflows, and Model Context Protocol servers.
- **Autonomous & parallel execution** — background tasks, cron scheduling, subagents, teammate swarms, and `/daemon`. Shell tasks show live progress in the footer (`⠋ shell: cmd · elapsed`) and a detail dialog with tail/auto-follow/OSC52 copy.
- **Workspaces & audit logging** — cross-repository linking (`/workspace`) and optional SIEM-friendly NDJSON audit trails.

## Common workflows

```text
/plan                         Plan a multi-step change
/code-review                  Review the current diff
/research "How does auth work?"  Research code, docs, and web sources
/bg                           Delegate a long-running task
/compact                      Reduce conversation context
/rewind                       Restore a previous checkpoint
/providers                    Configure or switch providers
/agents                       Inspect the running agent tree
/mcp                          Configure MCP servers
```

Run `/help` for the complete command list. Skills and plugins can add commands without changing the core CLI.

## Automatic compaction

Auto-Compact keeps long sessions inside the selected model's usable context window. Each turn measures context pressure and the reducer-based planner in `src/services/compact/v2/` selects the least-damaging combination needed to reclaim tokens.

Reducers can deduplicate content, compress state, remove stale or low-value tool results, create AST skeletons for large code, snip long messages, evict restorable content, summarize at a safe conversation boundary, and drop content only as a last resort. Cheap reducers may run while a tool chain is active; LLM summarization waits for a natural boundary unless the context reaches the force threshold.

Control it with:

- `autoCompactEnabled` — persistent setting, enabled by default
- `DISABLE_AUTO_COMPACT=1` — disable automatic compaction while keeping manual `/compact` available
- `DISABLE_COMPACT=1` — disable both automatic and manual compaction
- `/compact [instructions]` — force a manual compaction; optional instructions apply to the summarization reducer
- `/context` — inspect the current context budget and compaction state

Compaction health and shortfalls are tracked per agent. Evicted content is stored for recovery through the ContextRestore tool when a restore handle is available.

## CLI reference

```text
-p, --prompt <text>       Run one prompt and exit
-c, --continue            Continue the last conversation
-r, --resume [id]         Resume a session; open a picker when omitted
--model <model>           Override the model for this process
--effort <level>          Reasoning effort: low, medium, high, or max
--agent <agent>           Use a custom agent profile
--permission-mode <mode>  default, ask, plan, or auto
--computer                Enable OS-level computer use on Windows
--debug                   Enable developer debug output
```

Frequently used slash commands include `/model`, `/providers`, `/effort`, `/ultracode`, `/memory`, `/rule`, `/task`, `/goal`, `/compact`, `/rewind`, `/workspace`, `/mcp`, `/agent`, `/agents`, `/plan`, `/research`, `/workflow`, `/skills`, `/code-review`, `/bg`, `/daemon`, `/doctor`, `/stats`, `/cost`, `/session`, `/diff`, `/fork`, and `/theme`.

`/cost` includes provider-wide prompt-cache observability for each model. It distinguishes reported hits and misses from unsupported or unreported cache telemetry, and shows token hit rate, reporting coverage, and estimated savings when pricing is known. `/usage` shows the same session cache status alongside the separate share of input tokens caused by large cache misses.

The footer always displays `← N agents`, counting the main conversation as the first agent. Press `←` from an empty prompt to move the conversation into a background room with live **Needs input / Working / Completed** groups and a task composer. Live subagents appear below the main REPL logo while they have activity to report; archived conversations never clutter either view.

## Configuration

Provider credentials can be entered through the setup flow or supplied as environment variables. See the [provider documentation](https://clew-docs.pages.dev/providers) for the current catalog.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude models |
| `OPENAI_API_KEY` | OpenAI models |
| `DEEPSEEK_API_KEY` | DeepSeek models |
| `GOOGLE_API_KEY` | Google Gemini models |
| `GROQ_API_KEY` | Groq-hosted models |
| `TAVILY_API_KEY` | Tavily web search |
| `BRAVE_API_KEY` | Brave web search fallback |
| `SERPER_API_KEY` | Serper web search fallback |
| `JINA_API_KEY` | Jina search/fetch services |
| `CLEW_DISABLE_GATEWAY=1` | Skip the Clew gateway and use provider keys directly |
| `CLEW_DISABLE_TELEMETRY=1` | Disable anonymous usage statistics |

Settings are local.

### Audit logging

```bash
CLEW_AUDIT_LOG=1 CLEW_AUDIT_LOG_PATH=.clew/audit bun run dev
```

Additional controls include `CLEW_AUDIT_LOG_MAX_BYTES`, `CLEW_AUDIT_LOG_MAX_FILES`, `CLEW_AUDIT_LOG_INCLUDE`, `CLEW_AUDIT_LOG_EXCLUDE`, `CLEW_AUDIT_LOG_MIN_LEVEL`, `CLEW_AUDIT_LOG_CONSOLE`, and `CLEW_AUDIT_USER`.

## Security

Clew Code executes locally, but configured model providers receive the prompts and context required for a request. Review provider policies and never place secrets in prompts or tracked files.

- Permission modes: `default`, `ask`, `plan`, and `auto`
- File writes and shell commands can require confirmation
- Workspace-scoped auto-approve rules are supported
- Guardian can review selected automatic actions with a secondary model
- Audit logging can record tool calls, file access, and command execution

## Architecture

```text
REPL / Ink + React
├── Slash commands, skills, plugins, and input routing
├── AppState and terminal UI
└── Query engine
    ├── Streaming tool loop: src/QueryEngine.ts
    ├── One-shot/background path: src/query.ts
    ├── ProviderManager and provider adapters (src/services/ai/)
    ├── Tools: src/tools/
    └── Services
        ├── MCP, LSP, web, Git, voice, and audit logging
        ├── MemoryDB: src/memory/database.ts
        ├── Reducer-based compaction: src/services/compact/v2/
        ├── Agent runtime: src/services/agentTree/ (durable session tree + token ledger)
        ├── Autonomous queue, cron, and daemons
        └── Session search, checkpoints, and workspace linking
```

Agent execution layers (pick by intent):

| Layer | Use when |
|---|---|
| Agent | Main session or a custom `.clew/agents/*.md` profile |
| Subagent (`Agent` tool / Explore) | Short independent work; Explore is read-only |
| Teammate / swarm | Multi-turn named workers with a mailbox |
| Background / daemon | Queue + cron via `/bg`, `/daemon` |

Key boundaries:

- `src/main.tsx` and `src/replLauncher.tsx` bootstrap the CLI.
- `src/screens/REPL.tsx` routes input to slash commands or the query engine.
- `src/services/ai/` owns provider registration, model selection, capabilities, and adapters (declared in `providers.json`, ~32 providers).
- `src/services/compact/v2/` is the primary adaptive compaction planner; legacy summarization is an internal fallback.
- `src/services/agentTree/` is the durable session tree + rooted token ledger backing `/agents` and cost attribution.
- `src/memory/database.ts` is the canonical durable memory store.

See [AGENTS.md](AGENTS.md) for the complete architecture and development conventions.

## Development

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
bun run dev
```

Useful commands:

```bash
bun run dev:channels     # Dev with development provider channels
bun run build            # Production build → dist/
bun run start            # Run the built CLI
bun test                 # Full suite
bun test --bail          # Stop on first failure
bun test path/to/file.test.ts
bun run check:ci         # Biome CI (lint + format, no autofix)
bun x tsc --noEmit       # Typecheck (incremental)
```

Before pushing:

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

The repository maintains a TypeScript error baseline (`.ts-error-baseline`, currently `0`). CI fails only on regression — compare `bun x tsc --noEmit | grep -c 'error TS'` against the baseline and inspect touched files separately.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before making changes.

- Report bugs in [GitHub Issues](https://github.com/ClewCode/ClewCode/issues)
- Discuss ideas in [GitHub Discussions](https://github.com/ClewCode/ClewCode/discussions)
- Keep behavior, tests, and `[Unreleased]` in `CHANGELOG.md` synchronized

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).

Release history is tracked in [CHANGELOG.md](CHANGELOG.md).
