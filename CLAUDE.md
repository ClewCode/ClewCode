# CLAUDE.md — Project Guide for AI Assistants

> This document provides comprehensive context for AI coding assistants working on the Claude Code By Dek1MillionToken project.

## Project Overview

**Claude Code By Dek1MillionToken** is a terminal-based AI coding assistant with multi-provider support. It is a fork/extension of Anthropic's Claude Code CLI, adding unified provider routing, provider-specific adapters, and an extensible plugin architecture.

- **Repository**: `https://github.com/JonusNattapong/ClaudeCode.git`
- **Author**: Dek1milliontoken
- **License**: Proprietary — See `LICENSE.md`
- **Current Version**: `2.1.120`
- **Runtime**: Bun 1.0+ (recommended) or Node.js 18+
- **Language**: TypeScript 5.x (strict mode off, `module: ESNext`, `target: ES2022`)
- **UI Framework**: React 19 + Ink 6 (React for CLIs)
- **Build**: `bun build src/main.tsx --outdir ./dist --target bun`

## Quick Start

```bash
bun install          # Install dependencies
bun run build        # Production build → dist/
bun run dev          # Dev mode with file watching
bun run src/main.tsx session   # Run CLI directly
bun test             # Run tests
bun x tsc --noEmit   # Type check
```

## Project Structure

```
ClaudeCode/
├── src/
│   ├── main.tsx                  # Entry point (809KB — monolithic, handles CLI args, bootstrap, REPL)
│   ├── cli/                      # CLI-specific code (App.tsx, print, structuredIO, exit, handlers, transports)
│   ├── commands/                 # Slash commands (~100+ commands)
│   │   ├── model/                # /model — Switch AI model
│   │   ├── provider-select/      # /provider — Manage AI provider & model
│   │   ├── buddy/                # /buddy — AI companion config
│   │   ├── bridge/               # /bridge — Remote collaboration (BRIDGE_MODE=1)
│   │   ├── voice/                # /voice — Voice dictation (VOICE_MODE=1)
│   │   ├── ultraplan.tsx         # /ultraplan — Deep planning (ULTRAPLAN=1)
│   │   ├── config/               # /config — Settings editor
│   │   ├── cost/                 # /cost — Token usage & cost
│   │   ├── context/              # /context — Context window usage
│   │   ├── commit.ts             # /commit — Git commit wizard
│   │   ├── mcp/                  # /mcp — MCP server management
│   │   ├── plugin/               # /plugin — Plugin marketplace
│   │   ├── skills/               # /skills — Skill management
│   │   ├── doctor/               # /doctor — Diagnostics
│   │   ├── status/               # /status — System status
│   │   └── ...                   # 80+ more commands
│   ├── services/
│   │   ├── ai/                   # AI provider system (core of multi-provider support)
│   │   │   ├── providers/        # Provider implementations
│   │   │   │   ├── ProviderInterface.ts    # Base interface & ProviderId type
│   │   │   │   ├── AnthropicProvider.ts    # Anthropic/Claude
│   │   │   │   ├── OpenAIProvider.ts       # OpenAI GPT
│   │   │   │   ├── GoogleProvider.ts       # Google Gemini
│   │   │   │   ├── OpenAICompatibleProvider.ts  # Base for OpenAI-compatible
│   │   │   │   ├── OllamaProvider.ts       # Ollama local models
│   │   │   │   └── OpenRouterProvider.ts   # OpenRouter gateway
│   │   │   ├── providerRegistry.ts         # Provider registry singleton (PROVIDER_REGISTRY)
│   │   │   ├── ProviderManager.ts          # Provider orchestration & API key mgmt
│   │   │   ├── providerModels.ts           # Model discovery with 5-min cache
│   │   │   ├── providerMetadata.ts         # Provider metadata constants
│   │   │   ├── errorNormalizer.ts          # Normalize provider-specific errors
│   │   │   ├── usageNormalizer.ts          # Normalize token usage across providers
│   │   │   └── toolCallParser.ts           # Parse tool calls from non-native providers
│   │   ├── api/                  # API client layer (Anthropic SDK, Bedrock, Vertex, Azure)
│   │   ├── compact/              # Context compaction service
│   │   ├── mcp/                  # MCP (Model Context Protocol) integration
│   │   ├── oauth/                # OAuth 2.1 flows
│   │   ├── plugins/              # Plugin lifecycle management
│   │   ├── lsp/                  # Language Server Protocol integration
│   │   ├── voice.ts              # Voice capture & STT
│   │   └── ...                   # Analytics, settings sync, rate limiting, etc.
│   ├── tools/                    # 40+ built-in AI tools
│   │   ├── FileReadTool/         # Read file contents
│   │   ├── FileEditTool/         # Edit files with precise replacements
│   │   ├── FileWriteTool/        # Write/create files
│   │   ├── BashTool/             # Bash command execution (sandboxed)
│   │   ├── PowerShellTool/       # PowerShell command execution
│   │   ├── GlobTool/             # File globbing
│   │   ├── GrepTool/             # File content search
│   │   ├── WebFetchTool/         # Fetch web pages
│   │   ├── WebSearchTool/        # Web search
│   │   ├── AgentTool/            # Spawn sub-agents
│   │   ├── MCPTool/              # MCP server tool calls
│   │   ├── TaskCreateTool/       # Task management
│   │   ├── TodoWriteTool/        # Todo list management
│   │   ├── LSPTool/              # LSP diagnostics
│   │   └── ...                   # 30+ more tools
│   ├── bridge/                   # Bridge mode (remote collaboration, 31 files)
│   ├── buddy/                    # AI companion system (6 files)
│   ├── components/               # React/Ink UI components (390 items)
│   ├── hooks/                    # React hooks & lifecycle hooks (104 items)
│   ├── ink/                      # Ink rendering utilities (98 items)
│   ├── utils/                    # Utility functions (569 items)
│   ├── plugins/                  # Plugin system internals
│   ├── skills/                   # Skill definitions (23 items)
│   ├── context/                  # Context window management
│   ├── keybindings/              # Keybinding system
│   ├── vim/                      # Vim mode implementation
│   ├── voice/                    # Voice input module
│   └── types/                    # TypeScript type definitions
├── plugins/                      # Built-in plugins
│   ├── agent-sdk-dev/            # Agent SDK development
│   ├── claude-opus-4-5-migration/ # Migration plugin
│   ├── code-review/              # Code review commands
│   └── commit-commands/          # Commit workflow commands
├── docs/                         # Project documentation
│   ├── ARCHITECTURE.md           # System architecture
│   ├── DEVELOPMENT.md            # Development guide
│   ├── COMMANDS.md               # Command reference
│   ├── CONFIGURATION.md          # Configuration reference
│   └── API.md                    # API reference
├── examples/                     # Usage examples (settings, MDM)
├── scripts/                      # Build & utility scripts
├── .claude-plugin/               # Plugin marketplace metadata
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript config
├── bun.lock                      # Bun lockfile
├── CHANGELOG.md                  # Version history
├── CLAUDE.md                     # This file
└── README.md                     # User-facing docs
```

## Architecture

### High-Level Layers

```
┌─────────────────────────────────────────────────┐
│                  Terminal UI                      │
│              (Ink / React 19 / TUI)               │
├─────────────────────────────────────────────────┤
│              Command Handler Layer                 │
│  /model  /provider  /buddy  /mcp  /config  ...   │
├─────────────────────────────────────────────────┤
│              AI Provider Layer                     │
│  Anthropic | OpenAI | Google | OpenRouter | Ollama│
├─────────────────────────────────────────────────┤
│              Core Services                        │
│  ProviderRegistry | SessionManager | Permissions  │
│  PluginManager | MCPManager | CostTracker         │
├─────────────────────────────────────────────────┤
│              Data & Storage                       │
│  ~/.claude/ | Sessions | Settings | Cache (5min)  │
└─────────────────────────────────────────────────┘
```

### Data Flow: User Prompt → Response

1. User types prompt → Input capture (keyboard handling)
2. Message added to conversation
3. Context window check (auto-compact if near limit)
4. Permission checks (PreToolUse hooks, sandbox evaluation)
5. Build API request (tools, system prompt, context)
6. Stream response via SSE transport
7. Render UI incrementally
8. Extract tool calls → Permission prompts (if needed) → Execute tools
9. Tool results added to context → Continue streaming (back to step 5)
10. Response complete → Post-processing (hooks, transcript save, telemetry)

### Tool Execution Flow

1. Model calls tool → ToolUse message added
2. PreToolUse hook (if registered)
3. Permission check (sandbox, rule evaluation)
4. Prompt user (if required by permission mode)
5. Execute tool implementation
6. PostToolUse hook (if registered)
7. ToolResult message added → Continue conversation

## Multi-Provider System

This is the core differentiator of this fork. The provider system lives in `src/services/ai/`.

### Provider Interface

All providers implement `ProviderInterface` (`src/services/ai/providers/ProviderInterface.ts`):

```typescript
export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'gemini'
  | 'openrouter' | 'opencode' | 'cline' | 'groq'
  | 'xai' | 'mistral' | 'kilocode' | 'ollama'

export interface ProviderInterface {
  readonly providerId: ProviderId
  readonly label: string
  getProviderId(): ProviderId
  getProviderLabel(): string
  getProviderApiKeyEnvVar(): string
  createClient(options: ProviderInitOptions): Promise<ProviderClient>
}
```

### Provider Registry

`src/services/ai/providerRegistry.ts` exports `PROVIDER_REGISTRY` — a singleton mapping of all provider IDs to their registry entries. Each entry contains:

- `providerId`, `label`, `envKey` (API key env var name)
- `defaultBaseUrl`, `modelsUrl` (for model discovery)
- `defaultModel`, `capabilities` (tool calling, streaming, vision, etc.)
- `models[]` — Array of `ProviderModelInfo` with per-model capabilities
- `provider` — The `ProviderInterface` instance

### Provider Hierarchy

| Provider | Adapter | Tool Calling | Streaming | API Key Env |
|----------|---------|-------------|-----------|-------------|
| Anthropic | `@ai-sdk/anthropic` | Native | Full | `ANTHROPIC_API_KEY` |
| OpenAI | `@ai-sdk/openai` | Native | Full | `OPENAI_API_KEY` |
| Google | `@ai-sdk/google` | Native | Full | `GOOGLE_API_KEY` |
| OpenRouter | `@openrouter/ai-sdk-provider` | Native | Full | `OPENROUTER_API_KEY` |
| KiloCode | `ai-sdk-provider-opencode-sdk` | Native | Full | `KILOCODE_API_KEY` |
| Ollama | Custom HTTP | JSON-text | Partial | None (local) |
| Groq | OpenAI-compatible | Native | Full | `GROQ_API_KEY` |
| xAI | OpenAI-compatible | Native | Full | `XAI_API_KEY` |
| Mistral | OpenAI-compatible | Native | Full | `MISTRAL_API_KEY` |

### Key Normalizers

Providers return data in different formats. Three normalizers unify them:

- **`errorNormalizer.ts`** — Maps provider-specific error codes to unified error types
- **`usageNormalizer.ts`** — Normalizes token usage (input/output/cache) across providers
- **`toolCallParser.ts`** — Parses tool calls from providers that use JSON-text instead of native function calling

### Model Discovery

`providerModels.ts` fetches available models from provider APIs with a 5-minute TTL cache. Falls back to the hardcoded model list in `PROVIDER_REGISTRY` if the API is unreachable.

## Commands System

Commands are modular slash commands in `src/commands/`. Each command directory typically contains:

- `index.ts` — Command handler (interactive mode)
- `*noninteractive.ts` — Non-interactive mode handler (for `--print` mode)
- `*ui.tsx` — UI components (optional)

Commands register via `registerCommand()` from `src/commands.ts`.

### Feature-Gated Commands

Some commands require environment variables to enable:

| Flag | Commands | Description |
|------|----------|-------------|
| `KAIROS=1` | `/assistant`, `/brief` | AI assistant features |
| `BRIDGE_MODE=1` | `/bridge` | Remote collaboration |
| `ULTRAPLAN=1` | `/ultraplan`, `/loop` | Ultra-deep planning |
| `VOICE_MODE=1` | `/voice` | Voice dictation |

### Key Commands

- `/model` — Switch AI model (shows provider-specific models)
- `/provider` — Manage AI provider (set, list, key, models, reset)
- `/buddy` — Configure AI companion (Buddy)
- `/config` — Settings editor (theme, editor mode, verbose, etc.)
- `/cost` / `/usage` — Token usage and cost tracking
- `/context` — Context window usage
- `/mcp` — MCP server management (add, remove, auth, test)
- `/plugin` — Plugin marketplace (install, update, create, tag)
- `/skills` — Skill management
- `/doctor` — Diagnostics & auto-fix
- `/status` — System status (provider, model, session, MCP, plugins)
- `/compact` — Manual context compaction
- `/commit` — Git commit wizard
- `/resume` / `/continue` — Session resume

## Tools System

40+ built-in tools in `src/tools/`. Each tool exports:

```typescript
{
  name: string,
  description: string,
  parameters: zod.Schema,
  isEnabled: (context) => boolean,
  userFacingName: () => string,
  renderToolUse: () => JSX.Element,
  renderResult: () => JSX.Element,
}
```

### Tool Categories

- **File ops**: `FileReadTool`, `FileEditTool`, `FileWriteTool`, `GlobTool`, `GrepTool`
- **Shell**: `BashTool` (sandboxed), `PowerShellTool`
- **Web**: `WebFetchTool`, `WebSearchTool`
- **Agent**: `AgentTool`, `TaskCreateTool`, `TaskGetTool`, `TaskListTool`, `TaskStopTool`
- **MCP**: `MCPTool`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, `McpAuthTool`
- **Planning**: `EnterPlanModeTool`, `ExitPlanModeTool`, `VerifyPlanExecutionTool`
- **Other**: `TodoWriteTool`, `ConfigTool`, `LSPTool`, `SkillTool`, `WorkflowTool`, `SleepTool`

## Plugin System

Plugins extend Claude Code with custom commands, skills, and hooks.

### Plugin Structure

```
plugin-name/
├── .claude-plugin/
│   ├── plugin.json      # Manifest (name, version, skills, hooks)
│   ├── skills/          # Skill implementations
│   └── hooks/           # Hook handlers
├── marketplace.json     # Marketplace metadata
└── README.md
```

### Hook Types

Plugins can hook into lifecycle events:
- `PreToolUse` — Before tool execution (can block or modify)
- `PostToolUse` — After tool execution (includes `duration_ms`)
- `PreBash` — Before Bash command
- `PostPrompt` — After user prompt
- `PreAcceptEdit` — Before accepting edit

### Built-in Plugins

Located in `plugins/`:
- `agent-sdk-dev/` — Agent SDK development tools
- `claude-opus-4-5-migration/` — Migration assistant
- `code-review/` — Code review commands
- `commit-commands/` — Commit workflow commands

## Permissions System

Multi-layer security controlling what the AI can do.

### Permission Hierarchy (highest → lowest)

1. **Policy** — Managed by organization admin (cannot be overridden)
2. **Project** — `.claude/settings.json` in project root
3. **User** — `~/.claude/settings.json`
4. **Local** — `CLAUDE_CODE_LOCAL_*` env vars
5. **Environment** — `CLAUDE_CODE_*` env vars
6. **Code** — Hardcoded defaults

### Permission Modes

| Mode | Behavior |
|------|----------|
| `ask-first` | Prompt for each tool use (default, most secure) |
| `auto` | Auto-allow based on rules |
| `accept-edits` | Auto-allow file edits, prompt for other tools |
| `bypass-permissions` | No prompts (dangerous) |

### Sandboxing

Bash/PowerShell commands run sandboxed:
- Linux: PID namespace + seccomp-bpf
- macOS: Seatbelt sandbox
- Windows: Job objects + restricted token

## Session Management

Sessions stored in `~/.claude/sessions/`:
- `{id}.json` — Session metadata
- `{id}.txt` — Plaintext transcript
- `{id}.jsonl` — JSON transcript

### Session Modes

- **Normal** — Standard conversation
- **Plan** — Structured planning mode
- **Compact** — Context compression enabled
- **Focus** — Minimal UI, only conversation

### Session CLI Flags

- `--resume <id>` — Resume existing session
- `--continue` — Continue most recent session
- `--from-pr <url>` — Start from GitHub/GitLab/Bitbucket PR

## Bridge Mode

Remote collaboration system in `src/bridge/` (31 files). Requires `BRIDGE_MODE=1`.

**Features**: Share session URL, remote control from web/desktop, live transcription, voice dictation sync.

**Key files**: `bridgeMain.ts`, `replBridge.ts`, `codeSessionApi.ts`, `bridgeConfig.ts`

## Configuration

### Settings Sources (precedence: lowest → highest)

1. Built-in defaults
2. Environment variables (`CLAUDE_CODE_*`)
3. Managed settings (enterprise policy)
4. Project settings (`.claude/settings.json`)
5. User settings (`~/.claude/settings.json`)

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI GPT API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `KILOCODE_API_KEY` | KiloCode API key |
| `ANTHROPIC_BASE_URL` | Custom Anthropic endpoint |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint |
| `BRIDGE_MODE=1` | Enable bridge commands |
| `VOICE_MODE=1` | Enable voice commands |
| `ULTRAPLAN=1` | Enable ultraplan commands |
| `KAIROS=1` | Enable assistant/brief commands |
| `DISABLE_TELEMETRY=1` | Disable telemetry |
| `DEBUG=1` | Enable debug logging |
| `CLAUDE_CODE_HIDE_CWD=1` | Hide CWD in startup banner |

### Storage Layout

```
~/.claude/
├── sessions/            # Session files
├── settings.json        # User settings
├── credentials.json     # Stored API tokens (encrypted in system keychain)
├── keybindings.json     # Custom keybindings
├── plugins/             # Installed plugins
├── themes/              # Custom color themes
├── cache/
│   ├── models/          # Model metadata cache (5-min TTL)
│   └── providers/       # Provider response cache
└── crash-logs/          # Crash reports
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Bun / Node.js | JavaScript runtime |
| Language | TypeScript 5.x | Type-safe development |
| UI | React 19 + Ink 6 | Terminal UI components |
| CLI Parser | Commander.js | Argument parsing |
| AI SDK | Vercel AI SDK (`ai`) | Unified AI provider API |
| Validation | Zod 4 | Runtime schema validation |
| State | React Context / useReducer | Global state management |
| HTTP | Axios / Fetch | API requests |
| File Watch | chokidar | File system monitoring |
| Search | fuse.js | Fuzzy search |
| Diff | diff | Text diffing |
| Markdown | marked + highlight.js | Rendering & syntax highlighting |
| WebSocket | ws | Real-time communication |
| Process | execa | Child process management |
| Telemetry | OpenTelemetry | Traces, metrics, logs |

## Code Style & Conventions

### TypeScript

- `tsconfig.json`: `strict: false`, `jsx: "react-jsx"`, `module: "ESNext"`, `target: "ES2022"`
- Path aliases: `src/*` maps to `./src/*` (use `@/` prefix in imports)
- Prefer `unknown` over `any`; use Zod for runtime validation
- Use `debug()` library instead of `console.log`

### React / Ink

- Functional components only (no class components)
- Hooks for state and effects
- Always define props interfaces

### File Organization

- One export per file (unless closely related)
- Index files for barrel exports
- Co-locate tests: `file.ts` next to `file.test.ts`
- Commands: one directory per command under `src/commands/`
- Tools: one directory per tool under `src/tools/`

### Commit Messages

Follow conventional commits:

```
[type](scope): subject

Types: feat, fix, docs, style, refactor, perf, test, chore, revert
Scopes: provider, command, tool, ui, permissions, mcp, plugin, bridge, session, config
```

Examples:
```
feat(provider): add OpenRouter provider support
fix(command): handle null input in /model picker
docs(readme): update API key setup instructions
```

## Adding New Features

### Add a New Command

1. Create `src/commands/mycommand/index.ts`
2. Implement handler using `registerCommand()`
3. Import in command loader
4. (Optional) Add `*noninteractive.ts` for `--print` mode
5. (Optional) Add `*ui.tsx` for interactive UI

### Add a New Tool

1. Create `src/tools/MyTool/` directory
2. Implement the Tool interface (name, description, parameters, execute)
3. Register in tools registry
4. Add permission rules in `src/cli/permissions/`

### Add a New Provider

1. Create `src/services/ai/providers/MyProvider.ts`
2. Implement `ProviderInterface`
3. Register in `PROVIDER_REGISTRY` (`providerRegistry.ts`)
4. Add to `/provider` command's provider list
5. Add normalizers if provider uses non-standard formats

## Build & Release

### Build

```bash
bun run build    # Production build → dist/cli.js
bun run dev      # Dev mode with --watch
```

### Release Process

1. Bump version in `package.json`
2. Update `CHANGELOG.md`
3. `git add -A && git commit -m "Release vX.Y.Z"`
4. `git tag vX.Y.Z`
5. `git push origin main --tags`
6. `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`
7. Build: `bun run build`

## Testing

```bash
bun test                    # Run all tests
bun test test/unit/...      # Specific test file
bun test --coverage         # With coverage
bun test --watch            # Watch mode
bun test --bail             # Stop on first failure
```

Tests use Bun's built-in test runner (`import { test, expect } from "bun:test"`).

## Debugging

```bash
DEBUG=1 bun run src/main.tsx session              # Debug logging
bun run src/main.tsx session --verbose            # Verbose output
DEBUG=provider:anthropic bun run src/main.tsx session  # Module-specific debug
```

In-session diagnostics:
- `/status` — Show internal state
- `/doctor` — Run diagnostics
- `/doctor --fix` — Auto-fix issues
- `/context` — View context window usage

## Key Dependencies

### AI Provider SDKs

- `@ai-sdk/anthropic` — Anthropic Claude
- `@ai-sdk/openai` — OpenAI GPT
- `@ai-sdk/google` — Google Gemini
- `@openrouter/ai-sdk-provider` — OpenRouter
- `ai-sdk-provider-opencode-sdk` — KiloCode
- `@anthropic-ai/sdk` — Anthropic SDK (direct client)

### Cloud / Enterprise

- `@aws-sdk/client-bedrock` — AWS Bedrock
- `@aws-sdk/client-sts` — AWS STS
- `@azure/identity` — Azure authentication
- `@google/generative-ai` — Google AI / Vertex AI

### Core Libraries

- `ink` + `react` + `react-reconciler` — Terminal UI
- `ai` (Vercel AI SDK) — Unified streaming/provider API
- `zod` — Schema validation
- `chalk` — Terminal styling
- `diff` — Text diffing
- `marked` + `highlight.js` — Markdown rendering
- `fuse.js` — Fuzzy search
- `execa` — Process execution
- `chokidar` — File watching
- `ws` — WebSocket
- `yaml` — YAML parsing
- `glob` + `minimatch` + `picomatch` — File matching
- `ignore` — .gitignore parsing
- `tiktoken` — Token counting
- `sharp` — Image processing
- `qrcode` — QR code generation
- `jose` — JWT/JWE/JWS
- `hono` — HTTP framework

## Performance Optimizations

- **Model Cache** — 5-minute TTL for model lists from provider APIs
- **Session Index** — In-memory index for fast resume lookup
- **Lazy Loading** — Grammars and large dependencies loaded on-demand
- **Virtual Scroller** — Only visible messages rendered
- **Streaming SSE** — Real-time without buffering
- **Token Budgeting** — Preemptive compaction before context overflow
- **Prompt Caching** — Anthropic prompt caching (disable with `DISABLE_PROMPT_CACHING=1`)

## Security

- **Sandboxing** — All shell tool execution isolated per-platform
- **Permission Model** — Multi-layer approval system (policy → project → user → env → code)
- **Credential Storage** — Encrypted in system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Audit Trail** — All actions logged in session transcript
- **No Secret Logging** — API keys redacted from logs
- **Network Restrictions** — Configurable allowed/denied domains
- **MCP OAuth** — Full OAuth 2.1 flow with PKCE

## OpenTelemetry

Export traces, metrics, and logs via:
- `OTEL_EXPORTER_OTLP_ENDPOINT` — Export endpoint
- `OTEL_EXPORTER_OTLP_PROTOCOL` — grpc / http
- `OTEL_SERVICE_NAME` — Service identifier
- `OTEL_LOG_RAW_API_BODIES=1` — Log full API requests/responses

## Common Gotchas

- **`main.tsx` is monolithic** (809KB) — it handles CLI parsing, bootstrap, service init, and REPL loop all in one file. Be careful when editing.
- **Provider switching is immediate** — changing provider via `/provider` updates the active session instantly, no restart needed.
- **Ollama has no API key** — it's the only provider that doesn't require authentication; uses HTTP to `localhost:11434`.
- **Feature flags are env-only** — `KAIROS`, `BRIDGE_MODE`, `ULTRAPLAN`, `VOICE_MODE` can only be set via environment variables, not settings files.
- **Context auto-compaction** — when context reaches 80% of limit, old messages are automatically summarized. Configure via `autoCompact` and `compactThreshold` settings.
- **`tsconfig.json` has `strict: false`** — not all code is fully type-safe; be mindful of implicit `any`.
- **Path aliases** — `src/*` maps to `./src/*` via `tsconfig.json` paths; use `@/` prefix conventionally but verify actual import paths.
