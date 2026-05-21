<p align="center">
  <img src="assets/ceph-logo-long.png" alt="Ceph Code" width="480" />
</p>

<p align="center">
  <strong>Languages:</strong>
  <a href="README.md"><strong>English</strong></a> ·
  <a href="readme/README.zh.md">中文 (简体)</a> ·
  <a href="readme/README.th.md">ไทย</a>
</p>

# Ceph Code

Ceph Code is an independent, research-oriented **reverse-engineered rebuild** of Anthropic's [Claude Code](https://claude.ai/code) CLI. The goal is a **runnable, buildable, and debuggable** terminal workflow from source—not a black-box binary—while extending the runtime with multi-provider routing, adapters, and engineering tooling.

> **Disclaimer:** This repository is not affiliated with, endorsed by, or sponsored by Anthropic PBC. The upstream Claude Code product is proprietary; this project reconstructs and extends behavior for research and self-hosted use. Review [LICENSE.md](LICENSE.md) before redistributing or deploying.

## Positioning

| Aspect | What Ceph Code provides |
| --- | --- |
| **Source fidelity** | Reconstructed CLI aligned with Claude Code's terminal UX, tools, and extension points |
| **Build & debug** | Bun/TypeScript tree you can `bun run dev`, type-check, test, and patch locally |
| **Enterprise-style surface** | Bridge/remote sessions, MCP, plugins, skills, agents/supervisor, voice, session memory, LSP—without requiring Anthropic's hosted-only gates for every workflow |
| **Our differentiation** | Declarative **multi-provider** routing (`providers.json`, `/model`), provider adapters, and dev utilities (`preload`, `codeindex`, `session`) |

> This is a community rebuild for engineers who need transparency and provider choice—not an official Anthropic distribution.

## Ceph Code vs Claude Code

A factual comparison based on Anthropic's public Claude Code documentation and this repository's source tree. Claude Code is the official supported product. Ceph Code is an independent rebuild/fork for local modification, provider experiments, and source-level debugging.

| Area | Claude Code (Anthropic) | Ceph Code |
| --- | --- | --- |
| **Status** | Official Anthropic CLI product with official docs, releases, GitHub Action, SDK, and enterprise deployment paths. | Community-maintained rebuild/fork. Behavior can diverge from upstream and should be validated before production use. |
| **Install/runtime requirements** | Official docs list Node.js 18+, supported OSes, internet access for auth/AI processing, and `npm install -g @anthropic-ai/claude-code`. | This repo uses Bun/TypeScript for local development. Install the `cephcode` package, then run the `ceph` CLI command. |
| **Model/provider scope** | Built for Claude. Official deployment paths include Anthropic API plus enterprise hosting through AWS Bedrock or Google Vertex AI. | Provider registry currently includes 27 provider IDs in `src/services/ai/providers.json`, including Anthropic, OpenAI, Google, OpenRouter, Ollama, Groq, xAI, Mistral, Copilot, and others. Compatibility varies by provider. |
| **Terminal workflow** | Official agentic coding tool that can edit files, run commands, answer codebase questions, use web/MCP context, and act as a Unix-style CLI utility. | Reconstructed terminal workflow with local patches, provider adapters, extra commands, and experimental runtime changes. |
| **Permissions** | Official IAM docs list `default`, `acceptEdits`, `plan`, and `bypassPermissions`, plus allow/ask/deny permission rules in settings. | Source-defined runtime modes are `default`, `ask`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`; `auto` is included only when the transcript-classifier build gate is enabled. |
| **Subagents / agents** | Official custom subagents have separate context windows, configurable prompts, and tool access; Claude Code SDK supports building custom agents. | Includes local agent tooling, background/supervisor sessions, team/worker code paths, and an experimental durable `agentRuntime/`. |
| **MCP** | Official docs describe MCP servers for custom tools/capabilities in Claude Code and the SDK. | MCP support exists, with additional plugin-sourced MCP server loading and local integration code. |
| **Hooks** | Official hooks include `PreToolUse`, `PostToolUse`, `Notification`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, and `SessionEnd`. | Hook system exists and is modified in this fork; behavior may differ from upstream and should be tested against this repo. |
| **IDE integration** | Official docs list VS Code-family and JetBrains-family integrations, including diff viewing, selection context, file references, and diagnostics sharing. | Contains IDE/LSP-related code and plugin LSP support, but it is not the official Anthropic IDE integration. |
| **GitHub / CI automation** | Official Claude Code GitHub Actions supports `@claude` workflows and custom automation through the Claude Code SDK. | Repo has GitHub/PR-related commands and automation experiments, but not the official Anthropic GitHub Action product. |
| **Search / browser / computer use** | Official feature set is whatever Anthropic ships and documents for Claude Code. | Adds optional local/self-hosted pieces such as SearXNG integration and browser/computer-use adapter code. |
| **Source and support** | Official implementation and support are controlled by Anthropic. | Source is available in this repository for inspection and modification; support is community/project-maintainer based. |
| **Best fit** | Teams/users who want the official supported Claude Code experience and Anthropic's documented behavior. | Engineers who want to inspect internals, modify behavior, test providers, or run research/self-hosted workflows. |

Sources used for the Claude Code column: [overview](https://docs.anthropic.com/en/docs/claude-code/overview), [getting started](https://docs.anthropic.com/en/docs/claude-code/getting-started), [IAM and permission modes](https://docs.anthropic.com/en/docs/claude-code/iam), [settings](https://docs.anthropic.com/en/docs/claude-code/settings), [subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents), [SDK](https://docs.anthropic.com/en/docs/claude-code/sdk), [MCP in SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-mcp), [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks), [IDE integrations](https://docs.anthropic.com/en/docs/claude-code/ide-integrations), and [GitHub Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions). Ceph Code facts are based on this repository's source, especially `src/services/ai/providers.json`, `src/types/permissions.ts`, `src/services/ai/providerRegistry.ts`, `src/agentRuntime/`, `src/services/mcp/`, and `src/utils/plugins/`.

**Bottom line:** use Claude Code when you need the official supported product. Use Ceph Code when you specifically want a hackable research fork and are comfortable validating behavior yourself.

## What It Does

Ceph Code gives you an AI coding assistant that runs in your terminal, can inspect and edit a local codebase, execute tools, switch between model providers, and coordinate longer workflows through commands, agents, plugins, and project skills.

Highlights:

- **Multi-provider AI routing** through Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot, and other OpenAI-compatible providers.
- **Runtime model switching** with `/model` and provider configuration.
- **Tool-based coding workflow** for reading, editing, writing, searching, running shell commands, using LSP features, browsing, and working with MCP servers.
- **Plugin hooks** for intercepting prompts, shell commands, tool usage, and file edits.
- **Skill loading** from bundled skills and project-level `.claude/skills/` directories.
- **Agent and supervisor workflows** for delegating research, coding, and coordination tasks.
- **Durable Agent Runtime & Orchestrator** with offline-first execution, checkpoints, and interactive approvals.
- **24/7 Autonomous Mode** with persistent task queue, daemon process, health checks, auto-retry, dead-letter handling, and lease-based concurrency control.
- **Session and bridge features** for saving context, restoring work, and supporting remote collaboration.

### Compatibility Namespace

Ceph Code's command is `ceph`, but parts of the runtime intentionally still read Claude-compatible project and user paths such as `.claude/settings.json`, `.claude/skills/`, and selected `CLAUDE_CODE_*` environment variables. This keeps existing Claude Code-style projects, plugins, skills, hooks, and settings reusable while the public CLI and docs use the Ceph Code name.

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
ceph
```

### Run From Source

```bash
git clone https://github.com/CephCore/cephcode.git
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

See [docs/providers.html](docs/providers.html) for the provider overview.

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
/agent      Manage local agent workflows (run, status, trace, approvals, report)
/daemon     Manage 24/7 autonomous agent daemon (start/stop/status)
/task       Manage autonomous task queue (add/list/done/retry)
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
├── agentRuntime/         Agent orchestration, run store, and tool gateway
├── commands/             Slash command implementations
├── tools/                Built-in tool implementations
├── services/
│   ├── ai/               Provider manager, adapters, model registry
│   ├── autonomous/       24/7 autonomous agent daemon & task queue
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
- [Bridge Mode](docs/features/bridge-mode.html)
- [SearXNG Search](docs/features/searxng-search.html)
- [Troubleshooting](docs/troubleshooting.html)
- [Evals](docs/features/evals.html)

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
