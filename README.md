<p align="center">
  <img src="https://github.com/user-attachments/assets/3447b2ee-d405-4c7f-8510-f881b969bf3d" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>Language:</strong>
  <a href="README.md"><strong>English</strong></a> ·
  <a href="readme/README.zh.md">中文 (简体)</a> ·
  <a href="readme/README.th.md">ไทย</a>
</p>

# Clew 🪽

Clew is an unofficial, research-oriented CLI for AI-assisted software development.

It is a source-built reconstruction and extension project designed for local development, debugging, self-hosted workflows, and provider choice.

This repository is not an official Anthropic product, distribution, partner project, or supported implementation.

> **Disclaimer:** Anthropic, Claude, and Claude Code are trademarks of their respective owners. This project is not affiliated with, endorsed by, sponsored by, or approved by Anthropic PBC. Anthropic's official Claude Code product is proprietary software. Read [LICENSE.md](LICENSE.md) before using, modifying, redistributing, or deploying this repository.

## What This Project Provides

| Area                   | Description                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source-built CLI       | A Bun/TypeScript terminal application that can be built, tested, inspected, and modified locally.                              |
| Multi-provider routing | Support for multiple AI providers through provider adapters and model selection commands.                                      |
| Developer tooling      | Commands for context inspection, code review, simplification, research, plugins, MCP, LSP, sessions, and background workflows. |
| Local extensibility    | Support for plugins, hooks, skills, custom tools, scheduled tasks, and project-level configuration.                            |
| Research use           | A transparent codebase for studying AI coding agent architecture, terminal UX, provider routing, and tool execution.           |

## Features

Clew runs directly in your terminal. It can inspect and edit local codebases, execute shell commands with permissions, switch model providers, and coordinate longer-running agent workflows.

Key features:

* **Multi-provider AI routing** — Supports Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, and OpenAI-compatible endpoints.
* **Runtime model switching** — Switch models or providers during a session using `/model`.
* **Tool-driven workflows** — Read, search, edit, and write files; execute shell commands; query LSPs; run MCP tools; and integrate browser automation.
* **Plugin hooks** — Hook into prompts, shell execution, tool calls, message display, session start, and file editing actions.
* **Dynamic skills** — Load bundled and project-level skills from `.claude/skills/`.
* **Code review tools** — Use `/code-review --fix` to review changed code and apply fixes. Use `/simplify` for cleanup-focused review.
* **Guardian auto-review** — `/guardian` routes permission requests to an LLM reviewer with circuit breaker.
* **PR management** — `/pr create`, `list`, `view`, `review`, `merge`, `status`.
* **Provider-agnostic Remote Control** — `/remote` for WebSocket-based CLI sharing without claude.ai.
* **Model picker** — Choose global or session-only model defaults.
* **Plugin marketplace support** — Includes support for `skipLfs` when downloading plugin sources.
* **Local research workflow** — Use `/research <query>` for local-first web research and scraping workflows where configured.
* **Agents and supervisor** — Manage background agents, multi-step workflows, summaries, task status, approvals, and session state.
* **Background shell commands** — Run long-lived commands with `!bg <command>`.
* **Scheduled tasks** — Create one-shot or recurring tasks through `/task`.
* **Sessions and bridge mode** — Save, resume, and coordinate development sessions.

## Quick Start

### Install Globally

```bash
npm install -g clew-code
```

Or:

```bash
bun install -g clew-code
```

Run the CLI inside a project directory:

```bash
clew
```

> The global launcher requires Bun to be installed on your machine.

### Run From Source

```bash
git clone https://github.com/JonusNattapong/ClewCode.git
cd claudecode

bun install
bun run build
bun run start
```

For development:

```bash
bun run dev
```

## System Requirements

* Bun 1.3 or higher
* Node.js 18 or higher
* Git
* Windows, macOS, Linux, or WSL2
* At least one supported provider API key, unless using a local provider such as Ollama

## Provider Configuration

Set provider keys in your shell or in a local `.env` file.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Switch models or providers inside a session:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Provider documentation:

```text
docs/providers.html
```

## Frequently Used Commands

```text
/model        Switch models or providers
/status       Show provider, session, and context status
/doctor       Run diagnostics
/context      Inspect active context usage
/compact      Compress conversation history
/mcp          Manage Model Context Protocol servers
/code-review  Review changed code for bugs
/simplify     Run cleanup-focused review
/plugin       Manage plugins and hooks
/bridge       Configure bridge mode
/agent        Manage background agent workflows
/daemon       Open autonomous daemon dashboard
/task         Create or manage scheduled tasks
```

Type `/` in the CLI prompt to view available commands.

## Scheduled Tasks

The scheduled task system is available through `/task`.

```text
/task
```

Examples:

```text
/task
Name: Server Check
Schedule: Daily
Time: 20:00
Prompt: Verify the status of local servers
Storage: Durable
```

```text
/task
Name: Commit Reminder
Schedule: In N minutes
Delay: 10
Prompt: Remind me to commit the code
Storage: Session-only
```

Task behavior:

* Durable tasks are saved to `.claude/scheduled_tasks.json`.
* Session-only tasks run only during the active session.
* Recurring tasks use standard 5-field cron syntax.
* One-shot tasks are removed after they run.
* Local machine timezone is used for scheduled execution.

## Clew taste-1

Clew taste-1 is a local-first preference-learning runtime. It learns from accept, reject, edit, test, lint, and manual rules. It combines symbolic rules, semantic preference scoring, and contextual bandit optimization to adapt ClewCode to the user's coding taste and working style. It does not fine-tune the base LLM.

```text
/taste1              Show status panel
/taste1 learn <rule> Add a manual rule
/taste1 forget <id>  Remove a rule
/taste1 profile      Show all rules
/taste1 events       Show recent events
/taste1 eval         Run self-evaluation
/taste1 on/off       Enable/disable
```

See [docs/taste1.html](docs/taste1.html) for full documentation.

## Development

```bash
bun run dev              # Start development mode
bun run start            # Run the CLI from source
bun run build            # Build into dist/
bun test                 # Run tests
bun x tsc --noEmit       # Type check
bun run lint:check       # Check Biome lint rules
bun run format:check     # Check Biome formatting
bun run check:ci         # Run Biome CI validation
```

Developer utilities:

```bash
bun run preload <module>     # Preload module context
bun run session <command>    # Save, list, or restore session context
bun run codegraph            # Generate module dependency graphs
bun run ast-grep -- <args>   # Run structural AST search or rewrite
```

## Project Structure

```text
src/
├── main.tsx              # Terminal UI bootstrap and main loop
├── query.ts              # Query processing and system prompt logic
├── QueryEngine.ts        # Query orchestration, caching, deduplication, and rate limits
├── agentRuntime/         # Agent orchestration and persistent run stores
├── commands/             # Slash command implementations
├── tools/                # Built-in developer tools
├── services/
│   ├── ai/               # Provider manager, adapters, normalizers, and providers.json
│   ├── mcp/              # Model Context Protocol clients
│   ├── plugins/          # Plugin lifecycle hooks and interceptors
│   ├── tools/            # Tool execution service
│   ├── lsp/              # Language Server Protocol integration
│   ├── Supervisor/       # Background agent supervisor
│   └── SessionMemory/    # Persistent session memory
├── skills/               # Dynamic skill loader
├── cli/                  # Terminal UI contexts
├── components/           # Terminal UI components
├── bridge/               # WebSocket bridge
├── coordinator/          # Multi-agent coordinator
├── keybindings/          # Keyboard shortcut mappings
├── state/                # Reactive stores
└── vim/                  # Vim-like navigation mode
```

## Architecture

```text
Terminal UI
  -> Command registry and keybindings
  -> Provider manager and AI adapters
  -> Query engine and streaming loops
  -> Tool executor service
  -> Plugins, MCP, LSP, agents, session memory, and bridge
```

## Documentation

* [Installation](docs/installation.html)
* [Quick Start](docs/quick-start.html)
* [Configuration](docs/configuration.html)
* [AI Providers](docs/providers.html)
* [Models](docs/models.html)
* [Commands](docs/commands.html)
* [Tools](docs/tools.html)
* [Plugins](docs/plugins.html)
* [Skills](docs/skills.html)
* [Architecture](docs/architecture.html)
* [Permission Model](docs/permission-model.html)
* [Bridge Mode](docs/features/bridge-mode.html)
* [SearXNG Search](docs/features/searxng-search.html)
* [Troubleshooting](docs/troubleshooting.html)
* [Evals](docs/features/evals.html)
* [Clew taste-1](docs/taste1.html)

## Debugging

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## Platform Notes

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

A precompiled `ripgrep` binary for Windows may be bundled under:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## Contributing

Read these files before contributing:

* [CONTRIBUTING.md](CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
* [SECURITY.md](SECURITY.md)
* [LICENSE.md](LICENSE.md)

Do not submit proprietary code, copied source, leaked material, credentials, private keys, or content you do not have the right to license.

## Security

Do not open public issues for security vulnerabilities.

Use the private reporting process described in [SECURITY.md](SECURITY.md).

## Changelog

### 0.1.2 (2026-06-03)

- Initial Clew public release with `clew` and `clewcode` CLI commands.
- Multi-provider routing, tools, plugins, skills, MCP, LSP, agents, daemon mode, scheduled tasks, bridge, research, and memory systems.
- **Goal command overhaul** — simplified `/goal` parsing with pause state, edit, status, and last-achieved recall.
- **Ultracode** — auto-classifier, dynamic workflow coordinator, and `workflow`/`ultracode` commands.
- **Spinner component** with ignore directory configuration for crawl data.
- **Background Agents** — `!bg` shell tasks, dispatch autocomplete, PR columns, agent logout.
- **HTML docs** redesigned with clean Anthropic-style theme.
- Fixed `/model` and `/providers` picker persistence bug; removed stale `CLAUDE_CODE_TEAM_NAME` references.

See [CHANGELOG.md](CHANGELOG.md) for full history.

## License

See [LICENSE.md](LICENSE.md).

Only contributor-authored modifications and original additions are licensed as described in `LICENSE.md`. This repository does not grant rights to Anthropic proprietary software, services, models, trademarks, or other protected materials.
