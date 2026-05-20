# Ceph Code

Ceph Code is a research-oriented fork of Anthropic's [Claude Code](https://claude.ai/code) CLI. It keeps the terminal-first coding workflow while adding multi-provider model routing, provider adapters, plugin hooks, skills, MCP integrations, and developer tooling for larger AI-assisted engineering sessions.

> This repository is an independent research and development project. It is not affiliated with, endorsed by, or sponsored by Anthropic PBC.

## What It Does

Ceph Code gives you an AI coding assistant that runs in your terminal, can inspect and edit a local codebase, execute tools, switch between model providers, and coordinate longer workflows through commands, agents, plugins, and project skills.

Highlights:

- **Multi-provider AI routing** through Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, and other OpenAI-compatible providers.
- **Runtime model switching** with `/model` and provider configuration.
- **Tool-based coding workflow** for reading, editing, writing, searching, running shell commands, using LSP features, browsing, and working with MCP servers.
- **Plugin hooks** for intercepting prompts, shell commands, tool usage, and file edits.
- **Skill loading** from bundled skills and project-level `.claude/skills/` directories.
- **Agent and supervisor workflows** for delegating research, coding, and coordination tasks.
- **Session and bridge features** for saving context, restoring work, and supporting remote collaboration.

## Quick Start

### Install Globally

```bash
npm install -g cephcode
```

or:

```bash
bun install -g cephcode
```

Run it from any project directory:

```bash
cephcode
```

### Run From Source

```bash
git clone https://github.com/JonusNattapong/ClaudeCode.git
cd claudecode
bun install
bun run build
bun run start
```

## Requirements

- [Bun](https://bun.sh) 1.3 or later for local development.
- At least one provider credential, such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or another supported provider key.
- Windows, macOS, Linux, or WSL2.

## Provider Setup

Set one or more provider keys in your shell or `.env` file:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

Inside Ceph Code, switch models or providers with:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

See [docs/providers.html](docs/providers.html) for the full provider list, model notes, and capability differences.

## Common Commands

```text
/model      Switch model or provider
/status     Show session, provider, and context status
/doctor     Run diagnostics
/context    Inspect context usage
/compact    Compress conversation context
/mcp        Manage MCP servers
/plugin     Manage plugins
/bridge     Configure bridge mode
```

Type `/` inside the CLI to discover available commands.

## Development

```bash
bun run dev              # Start development mode with watch
bun run start            # Run the CLI from source
bun run build            # Build to dist/
bun test                 # Run tests
bun x tsc --noEmit       # Type-check only
bun run lint:check       # Check lint rules
bun run format:check     # Check formatting
bun run check:ci         # Run Biome CI checks
```

Useful project utilities:

```bash
bun run preload <module>     # Preload module context before editing
bun run session <command>    # Save, list, or restore session context
bun run codeindex <command>  # Index and search the codebase
bun run codegraph            # Generate a module dependency graph
bun run ast-grep -- <args>   # Run AST-based search or rewrite
```

## Project Layout

```text
src/
├── main.tsx              CLI bootstrap and main runtime
├── query.ts              Core query processing
├── QueryEngine.ts        Query orchestration
├── commands/             Slash command implementations
├── tools/                Built-in tool implementations
├── services/
│   ├── ai/               Provider manager, adapters, model registry
│   ├── mcp/              MCP client and transport support
│   ├── plugins/          Plugin lifecycle and hooks
│   ├── tools/            Tool execution services
│   ├── lsp/              Language Server Protocol integration
│   ├── Supervisor/       Agent supervision
│   └── SessionMemory/    Persistent session memory
├── skills/               Skill loading and bundled skills
├── cli/                  Ink/React CLI UI
├── components/           Terminal UI components
├── bridge/               Remote collaboration bridge
├── coordinator/          Multi-agent coordination
├── keybindings/          Custom keybinding engine
├── state/                Lightweight reactive stores
└── vim/                  Vim-style editing mode
```

## Architecture

Ceph Code is built around a provider-agnostic tool execution loop:

```text
Terminal UI
  -> Command and keybinding layer
  -> Provider manager and adapters
  -> Query engine and streaming loop
  -> Tool executor
  -> Plugin hooks, MCP, LSP, agents, memory, and bridge services
```

Provider-specific SDKs are wrapped behind adapters so the rest of the runtime can process streaming responses, tool calls, usage metadata, and content blocks through a common interface.

## Documentation

- [Installation](docs/installation.html)
- [Quick Start](docs/quick-start.html)
- [Configuration](docs/configuration.html)
- [AI Providers](docs/providers.html)
- [Models](docs/models.html)
- [Commands](docs/commands.html)
- [Tools](docs/tools.html)
- [Plugins](docs/plugins.html)
- [Skills](docs/skills.html)
- [Architecture](docs/architecture.html)
- [Permission Model](docs/permission-model.html)
- [Bridge Mode](docs/bridge-mode.html)
- [Troubleshooting](docs/troubleshooting.html)

## Debugging

Enable general debug output:

```bash
DEBUG=1 bun run src/main.tsx
```

Enable scoped provider logging:

```bash
DEBUG=provider:anthropic bun run src/main.tsx
```

## Platform Notes

### Windows

If dependencies or native modules get into a bad state:

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Ceph Code includes a bundled Windows `ripgrep` binary at `src/utils/vendor/ripgrep/x64-win32/rg.exe` for file search tools.

### Production Build

The production build externalizes several native and optional modules, including Electron, Chromium BiDi, Anthropic platform SDK variants, AWS SDK packages, Google auth libraries, Sharp, audio capture packages, and React DevTools.

## Contributing

Issues and pull requests are welcome. Before opening a PR, run the relevant checks:

```bash
bun test
bun run lint:check
bun run format:check
bun x tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) for project guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

See [LICENSE.md](LICENSE.md).
