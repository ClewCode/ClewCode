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

Clew Code is a terminal-native AI coding agent that works inside your repository. It inspects code, edits files, runs commands, uses external tools, and coordinates multi-step work through the provider and model you choose.

Bring your own provider: Claude, GPT, Gemini, DeepSeek, local Ollama models, OpenRouter, and many more. Clew Code does not require a hosted coding backend; prompts are sent only to services you explicitly configure, plus any web or MCP service you choose to use.

## Contents

- [Install](#install)
- [Start here](#start-here)
- [Choose a model](#choose-a-model)
- [Features](#features)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Security](#security)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Install

### macOS and Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.ps1 | iex
```

### npm

```bash
npm install -g clew-code
```

The package provides both `clew` and `clewcode` commands.

## Start here

```bash
cd your-project
clew
```

Useful non-interactive forms:

```bash
clew -p "fix the failing tests and explain the root cause"
clew --resume last
clew --model openai/gpt-5.5
```

On first launch, configure at least one provider. Credentials are stored in local Clew configuration and should never be committed to a repository.

Example prompts:

```text
> how does authentication work in this repository?
> refactor UserCard to use the new Avatar component
> run the tests, diagnose failures, and fix them
```

Clew Code inspects relevant files, applies focused changes according to the permission mode, and can verify the result with your project’s own tools.

## Choose a model

Open the model picker:

```text
/model
```

The picker groups models by provider and refreshes live model lists for configured providers when it opens. Providers without usable credentials use the bundled registry as a fallback.

| Action | Result |
|---|---|
| `Enter` | Use the selected model for this session only |
| `d` or `g` | Save the selected provider/model as the default |
| `/model provider/model` | Select a provider-qualified model for this session |
| `/model default` | Clear the current session override |
| `/model list` | List models from the active provider |
| `/model --help` | Show command help |

Session choices do not change the shared default for other sessions. Capability labels may include context size, output limit, tools, vision, reasoning, and free-tier status when the provider exposes that metadata.

## Features

- Multi-provider model selection with live discovery and static fallback
- Streaming REPL with tool use, checkpoints, context compaction, and rewind
- File reading, writing, editing, search, shell execution, Git, browser, LSP, web, and media tools
- Persistent SQLite-backed memory across sessions
- MCP servers, plugins, and reusable `SKILL.md` workflows
- Project-specific rules in `.clew/rules.json`
- Background tasks, cron scheduling, agents, subagents, and teammate swarms
- Cross-repository workspaces with `/workspace link`
- Optional audit logging in SIEM-friendly NDJSON format

Common workflows:

```text
/plan                         Plan a multi-step change
/code-review                  Review the current diff
/research "How does auth work?"  Research code, docs, and web sources
/bg                           Delegate a long-running task
/compact                      Reduce conversation context
/rewind                       Restore a previous checkpoint
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

Frequently used slash commands include `/model`, `/providers`, `/effort`, `/ultracode`, `/memory`, `/rule`, `/task`, `/goal`, `/compact`, `/rewind`, `/workspace`, `/mcp`, `/agent`, `/plan`, `/research`, `/workflow`, `/skills`, `/code-review`, `/bg`, `/daemon`, `/doctor`, `/stats`, `/cost`, `/session`, `/diff`, `/fork`, and `/theme`.

The footer always displays `← N agents`, counting the main conversation as the first agent. Press Left from an empty prompt to move the conversation into a Claude-style background room with Clew's mascot, live Needs input / Working / Completed groups, and a task composer. Live subagents also appear below the main REPL logo while they have activity to report; archived conversations never clutter either view.

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
| `CLEW_DISABLE_TELEMETRY=1` | Disable anonymous usage statistics |

Settings are local. Project rules live at `.clew/rules.json`:

```json
{
  "rules": [
    "Use the project's existing test framework",
    "Prefer named exports over default exports"
  ]
}
```

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
    ├── ProviderManager and provider adapters
    ├── Tools: src/tools/
    └── Services
        ├── MCP, LSP, web, Git, voice, and audit logging
        ├── MemoryDB: src/memory/database.ts
        ├── Reducer-based compaction: src/services/compact/v2/
        ├── Autonomous queue and agent runtime
        └── Session search, checkpoints, and workspace linking
```

Important boundaries:

- `src/main.tsx` and `src/replLauncher.tsx` bootstrap the CLI.
- `src/screens/REPL.tsx` routes input to slash commands or the query engine.
- `src/services/ai/` owns provider registration, model selection, capabilities, and adapters.
- `src/services/compact/v2/` is the primary adaptive compaction planner; legacy summarization remains an internal fallback.
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
bun run dev:channels
bun run build
bun run start
bun test
bun test --bail
bun test path/to/file.test.ts
bun run check:ci
bun x tsc --noEmit
```

Before pushing:

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

The repository has a known TypeScript error baseline. Compare new errors against the existing baseline and inspect touched files separately.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before making changes.

- Report bugs in [GitHub Issues](https://github.com/ClewCode/ClewCode/issues)
- Discuss ideas in [GitHub Discussions](https://github.com/ClewCode/ClewCode/discussions)
- Keep behavior, tests, and `[Unreleased]` in `CHANGELOG.md` synchronized

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).

Release history is tracked in [CHANGELOG.md](CHANGELOG.md).
