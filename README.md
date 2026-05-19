# Ceph Code

A research-oriented fork of Anthropic's [Claude Code](https://claude.ai/code) CLI, featuring **unified multi-provider routing**, **provider-specific adapters**, and an **extensible plugin architecture**.

> This repository is an independent research and development project. It is not affiliated with, endorsed by, or sponsored by Anthropic PBC.

## Introduction

Ceph Code extends the original Claude Code terminal interface into a comprehensive multi-provider AI development platform. It maintains full compatibility with the original tool execution model while introducing support for 15 AI providers, 57+ built-in tools, 100+ slash commands, MCP/LSP integrations, a supervisor agent system, and a modular plugin/skill ecosystem.

The platform is built on [Bun](https://bun.sh) 1.3+ and supports Windows, macOS, and Linux (including WSL2) environments.

## Core Features

### Multi-Provider Support

A unified interface for seamless switching between AI providers at runtime via the `/model` command. Supported providers include:

| Provider          | Environment Variable            |
| ----------------- | ------------------------------- |
| Anthropic Claude  | `ANTHROPIC_API_KEY`             |
| OpenAI GPT        | `OPENAI_API_KEY`                |
| Google Gemini     | `GOOGLE_API_KEY`                |
| OpenRouter        | `OPENROUTER_API_KEY`            |
| DeepSeek          | `DEEPSEEK_API_KEY`              |
| Ollama (Local)    | `OLLAMA_API_KEY`, `OLLAMA_HOST` |
| xAI (Grok)        | `XAI_API_KEY`                   |
| Mistral           | `MISTRAL_API_KEY`               |
| Groq              | `GROQ_API_KEY`                  |
| GitHub Copilot    | `COPILOT_GITHUB_TOKEN`          |
| KiloCode          | `KILOCODE_API_KEY`              |
| OpenCode          | `OPENCODE_API_KEY`              |
| OpenCode Go       | `OPENCODE_GO_API_KEY`           |
| Cline             | `CLINE_API_KEY`                 |
| ChatGPT Plus      | `CHATGPT_SUBSCRIPTION_KEY`      |

### Adapter Architecture

Non-Anthropic SDK clients are transparently wrapped into a unified streaming interface through dedicated adapters (`AnthropicAdapter`, `GoogleAdapter`). This design allows the core streaming loop to remain provider-agnostic while supporting heterogeneous AI backends.

### Built-in Tools (55+)

| Category              | Tools                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| File Operations       | Read, Edit, Write, Glob, Grep, FileEdit, FileRead, FileWrite, NotebookEdit                            |
| Shell Execution       | Bash, PowerShell, Sleep                                                                               |
| Web & Browser         | WebFetch, WebSearch, Browser, WebBrowser                                                              |
| Code Intelligence     | CodeIndex (fuzzy search), LSP, JsonPath                                                               |
| AI & Task Management  | Agent, Research, Supervisor, Task (Create/Get/List/Update/Output/Stop)                                |
| Planning              | EnterPlanMode, ExitPlanMode, VerifyPlanExecution, Workflow                                            |
| Meta & Configuration  | Skill, ToolSearch, Config, TodoWrite, Monitor, RemoteTrigger                                          |
| Code Analysis         | CodeGraph (dependency map), ast-grep (AST search/replace)                                             |
| Cross-Session         | Session Bridge (save/restore context), Preloader (module context)                                     |
| Communication         | SendMessage, AskUserQuestion                                                                          |
| MCP Integration       | MCP, McpAuth, ListMcpResource, ReadMcpResource                                                        |
| Utilities             | REPL, ScheduleCron, SyntheticOutput, ComputerUse, Brief, MultiSearch, Worktree                        |

### Slash Commands (100+)

Comprehensive command system for provider selection, session management, diagnostics, utilities, and integrations. Key commands include:

- `/model` — Switch AI provider or model at runtime
- `/status` — Display internal state, context usage, and provider information
- `/doctor` — Run diagnostics and automatic remediation
- `/context` — View context window utilization
- `/compact` — Compress conversation context
- `/mcp` — Manage Model Context Protocol servers
- `/plugin` — Manage plugin lifecycle
- `/bridge` — Configure remote collaboration mode

### Plugin System

Extensible plugin architecture with lifecycle hooks:

- `PreToolUse` / `PostToolUse` — Intercept tool execution
- `PreBash` / `PostBash` — Intercept shell commands
- `PostPrompt` — Intercept prompt submissions
- `PreAcceptEdit` — Intercept file edits

Plugins are loaded from `~/.claude/plugins/` and bundled plugins reside in `src/plugins/bundled/`.

### Skill System

Modular capability packages with progressive disclosure. Bundled skills include browser automation, commit workflows, debugging, code simplification, remote agent scheduling, and more. Project-level skills are loaded from `.claude/skills/` at startup.

### Additional Capabilities

- **MCP Integration** — Model Context Protocol with OAuth, SSE, stdio, and Auth0 transports
- **Supervisor System** — Hierarchical agent coordination, subagent management, and workflow orchestration
- **Code Intelligence** — CodeIndex (fuzzy code search), CodeGraph (dependency visualization), LSP integration
- **Session Bridge** — Cross-session context save/restore for long-running development workflows
- **Bridge Mode** — WebSocket-based remote collaboration and session sharing
- **Vim Mode** — Modal editing with motions, operators, and text objects
- **Custom Keybindings** — Configurable chord-based keybinding engine
- **Session Memory** — Persistent session lifecycle and memory management
- **Settings Sync** — Cross-device configuration synchronization

## Technology Stack

| Layer          | Technology                                                                |
| -------------- | ------------------------------------------------------------------------- |
| Runtime        | Bun 1.3+                                                                  |
| Language       | TypeScript 5.x ESM (`NodeNext` module resolution)                         |
| UI Framework   | React 19 + Ink 6                                                          |
| AI SDK         | Vercel AI SDK (`@ai-sdk/*`) + `@anthropic-ai/sdk`                         |
| Validation     | Zod 3 + Valibot 0.42                                                      |
| CLI Framework  | Commander.js 13                                                           |
| Search         | fuse.js + fzf                                                             |
| Diff           | diff                                                                      |
| Markdown       | marked + highlight.js + turndown                                          |
| Terminal       | chalk + ora + ink-spinner + ink-text-input                                |

#### 🌌 Multi-Provider AI Support
Ceph Code now supports 30+ AI providers including Anthropic, OpenAI, Gemini, Together, NVIDIA, and more. 
Check out our [**AI Providers Guide (PROVIDERS.md)**](./PROVIDERS.md) for full setup instructions and supported models.

## Installation

#### Option 1: Global Installation (Recommended)

Install Ceph Code globally via npm or bun:

```bash
# Via npm
npm install -g cephcode

# Via bun
bun install -g cephcode
```

Once installed, you can start Ceph Code by running:

```bash
cephcode
```

#### Option 2: Local Development Setup (Manual)

1. **Clone the repository**

   ```bash
   git clone https://github.com/JonusNattapong/ClaudeCode.git
   cd claudecode
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Build and Run**

   ```bash
   bun run build
   bun run start
   ```

### Prerequisites

- [Bun](https://bun.sh) 1.3 or later (for manual setup)
- At least one AI provider API key

### Development Commands

```bash
bun run dev            # Start development mode with hot reload
bun run start          # Run in production mode
bun run build          # Build production bundle to dist/
bun test               # Execute all tests
bun test <path>        # Run specific test file or directory
bun x tsc --noEmit     # TypeScript type checking only
bun run preload <mod>  # Preload module context before editing (e.g. `bridge`, `query`)
bun run session <cmd>  # Session Bridge: save/list/restore cross-session context
bun run codeindex <cmd># CodeIndex: index and fuzzy-search the codebase
bun run codegraph      # Generate module dependency graph
bun run ast-grep -- <args>  # AST-based code search and rewrite
```

### Debug Logging

```bash
DEBUG=1 bun run src/main.tsx              # Enable full debug logging
DEBUG=provider:anthropic bun run src/main.tsx  # Per-provider debug logging
```

## Architecture

### High-Level Overview

```text
+-------------------------------------------+
|       Terminal UI (Ink 6 + React 19)      |
|  App.tsx, Screens, Components, Buddy      |
+-------------------------------------------+
|         Command Handler Layer             |
|  100+ Commands, Keybindings, Vim Mode     |
+-------------------------------------------+
|      AI Provider & Adapter Layer          |
|  ProviderManager, ProviderRegistry        |
|  AnthropicAdapter, GoogleAdapter          |
+-------------------------------------------+
|      Core Query & Streaming Engine        |
|  main.tsx, QueryEngine, query.ts, query/  |
|  ToolExecution, Orchestration, Hooks      |
+-------------------------------------------+
|      Services & Infrastructure            |
|  MCP, Plugins, LSP, Bridge, Config        |
|  Coordinator, Supervisor, SettingsSync    |
+-------------------------------------------+
```

### Key Components

| Component | Description |
|-----------|-------------|
| `src/main.tsx` | Main entry point, CLI bootstrap, streaming loop (~4900 lines) |
| `src/query.ts` | Core AI query processing (~1770 lines) |
| `src/QueryEngine.ts` | Query execution orchestration (~1280 lines) |
| `src/services/ai/` | Provider management, adapters, registry |
| `src/commands/` | Slash command implementations |
| `src/tools/` | Built-in tool implementations |
| `src/services/tools/` | Tool execution and orchestration |
| `src/plugins/` | Plugin lifecycle management |
| `src/services/mcp/` | MCP client and connection management |
| `src/services/Supervisor/` | Agent supervision and coordination |
| `src/services/SessionLifecycle/` | Session lifecycle management |
| `src/services/SessionMemory/` | Session memory management |
| `src/coordinator/` | Multi-agent coordination |
| `src/bridge/` | WebSocket remote collaboration |
| `src/state/` | Lightweight reactive store |

### Multi-Provider Request Flow

1. User selects provider via `/model` command or configuration file (`~/.claude/provider.json`)
2. `ProviderManager` resolves the selected provider and retrieves API credentials
3. `providerRegistry` looks up provider capabilities and model metadata
4. For non-Anthropic providers, the adapter layer wraps the SDK client into a compatible interface
5. `contentBlockUtils` normalizes content blocks between provider formats
6. The main streaming loop processes responses through a uniform pipeline

### Tool Execution Flow

1. AI model returns `tool_use` content blocks
2. `toolCallParser` normalizes tool calls across provider formats
3. `StreamingToolExecutor` executes the requested tool
4. `toolHooks` apply pre/post execution hooks from active plugins
5. Results are returned as `tool_result` blocks for the next AI turn

## Project Structure

```text
src/
├── main.tsx                 Main entry point and streaming loop
├── query.ts                 Core AI query processing
├── QueryEngine.ts           Query execution orchestration
├── commands.ts              Command registry
├── tools.ts                 Tool registry
├── commands/                100+ slash command implementations
├── tools/                   57+ built-in tool implementations
├── services/
│   ├── ai/                  ProviderManager, adapters, providers, registry
│   ├── mcp/                 MCP client and connection management
│   ├── plugins/             Plugin lifecycle management
│   ├── tools/               Tool execution and orchestration
│   ├── lsp/                 Language Server Protocol integration
│   ├── Supervisor/          Agent supervision and coordination
│   ├── SessionLifecycle/    Session lifecycle management
│   ├── SessionMemory/       Session memory management
│   ├── settingsSync/        Cross-device settings synchronization
│   ├── analytics/           Usage analytics and telemetry
│   └── codeIndex/           CodeIndex search and indexing
├── skills/                  Skill loading and bundled skills
├── cli/                     App.tsx (root component), transports, handlers
├── components/              React/Ink UI components
├── context/                 Overlays, modals, notifications
├── hooks/                   80+ React hooks
├── keybindings/             Custom keybinding engine
├── state/                   Reactive store (createStore<T>)
├── bridge/                  WebSocket remote collaboration
├── vim/                     Vim modal editing
├── buddy/                   Companion ("Duck") sprite
├── coordinator/             Multi-agent coordination
├── types/                   Type definitions, permissions, messages
├── entrypoints/             Alternative entry points (CLI, init, MCP)
└── native-ts/               TypeScript ports of native modules
```

## Documentation

Full documentation is available at [docs/index.html](docs/index.html):

- [Installation Guide](docs/installation.html)
- [Quick Start](docs/quick-start.html)
- [Configuration](docs/configuration.html)
- [AI Providers](docs/providers.html)
- [Commands Reference](docs/commands.html)
- [Tools Reference](docs/tools.html)
- [Plugin Development](docs/plugins.html)
- [Architecture Overview](docs/architecture.html)
- [Permission Model](docs/permission-model.html)
- [Bridge Mode](docs/bridge-mode.html)

## Platform Notes

### Windows

Tested with Bun on Windows. For module resolution issues:

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

### Build Notes

The production build externalizes several native and node modules: `electron`, `chromium-bidi`, `@ant/claude-for-chrome-mcp`, Anthropic SDKs (`bedrock`, `vertex`, `foundry`, `mcpb`), `@aws-sdk/*`, `google-auth-library`, `sharp`, `asciichart`, `audio-capture-napi`, `modifiers-napi`, `react-devtools-core`.

### Ripgrep Dependency

`src/utils/vendor/ripgrep/x64-win32/rg.exe` is bundled for Windows. The `Glob` and `Grep` tools require this binary.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete version history.

## License

See [LICENSE.md](LICENSE.md) for licensing terms.
