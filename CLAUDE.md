# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code By Dek1MillionToken** is a terminal-based AI coding assistant with multi-provider support. It unifies 12+ AI providers into one terminal interface with unified tool calls, token normalization, and plugin extensibility.

- **Repository**: `https://github.com/JunusNattapong/ClaudeCode.git`
- **Author**: Dek1milliontoken
- **License**: Proprietary — See `LICENSE.md`
- **Current Version**: `2.1.121`
- **Runtime**: Bun 1.0+ (recommended) or Node.js 18+
- **Language**: TypeScript 5.x (`strict: false`, `jsx: "react-jsx"`, `module: "ESNext"`, `target: ES2022`)
- **UI Framework**: React 19 + Ink 6 (React for CLIs)
- **Build**: `bun build src/main.tsx --outdir ./dist --target bun`

## Commands

```bash
bun install              # Install dependencies
bun run build            # Production build → dist/
bun run dev              # Dev mode with --watch
bun run src/main.tsx session   # Run CLI directly
bun test                 # Run all tests
bun test test/unit/...   # Run specific test
bun test --coverage      # With coverage
bun test --watch         # Watch mode
bun test --bail          # Stop on first failure
bun x tsc --noEmit       # Type check

# CLI Flags

```bash
bun run src/main.tsx session --provider openai --model gpt-4o    # Set provider and model
bun run src/main.tsx session --provider anthropic --model claude-opus-4-7
bun run src/main.tsx session --provider ollama --model llama3
bun run src/main.tsx session --print                              # Non-interactive mode
bun run src/main.tsx session --verbose                       # Verbose output
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

The provider system lives in `src/services/ai/`. All providers implement `ProviderInterface`:

```typescript
export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'gemini'
  | 'openrouter' | 'opencode' | 'cline' | 'groq'
  | 'xai' | 'mistral' | 'kilocode' | 'ollama'
  | 'copilot' | 'chatgpt-session'

export interface ProviderInterface {
  readonly providerId: ProviderId
  readonly label: string
  streamMessage(): Promise<ProviderStreamResult>
  nonStreamingMessage(): Promise<ProviderNonStreamResult>
  getModels(): Promise<ProviderModelInfo[]>
  getToolResultSchema(): z.ZodSchema
  normalizeError(error: unknown): NormalizedError
  normalizeUsage(usage: unknown): NormalizedUsage
  normalizeToolCall(toolCall: unknown): NormalizedToolCall
}
```

### Provider Registry

`src/services/ai/providerRegistry.ts` exports `PROVIDER_REGISTRY` — a singleton mapping all provider IDs to registry entries containing:
- `providerId`, `label`, `envKey` (API key env var name)
- `defaultBaseUrl`, `modelsUrl` (for model discovery)
- `defaultModel`, `capabilities` (tool calling, streaming, vision, etc.)
- `models[]` — Array of `ProviderModelInfo` with per-model capabilities

### Provider Implementations

| Provider | Adapter | Tool Calling | API Key Env |
|----------|---------|-------------|-------------|
| Anthropic | `@ai-sdk/anthropic` | Native | `ANTHROPIC_API_KEY` |
| OpenAI | `@ai-sdk/openai` | Native | `OPENAI_API_KEY` |
| Google | `@ai-sdk/google` | Native | `GOOGLE_API_KEY` |
| OpenRouter | `@openrouter/ai-sdk-provider` | Native | `OPENROUTER_API_KEY` |
| KiloCode | `ai-sdk-provider-opencode-sdk` | Native | `KILOCODE_API_KEY` |
| Ollama | Custom HTTP | JSON-text | None (local) |
| Groq | OpenAI-compatible | Native | `GROQ_API_KEY` |
| xAI | OpenAI-compatible | Native | `XAI_API_KEY` |
| Mistral | OpenAI-compatible | Native | `MISTRAL_API_KEY` |
| Cline | OpenAI-compatible | Native | `CLINE_API_KEY` |
| OpenCode | OpenAI-compatible | Native | `OPENCODE_API_KEY` |
| Copilot | OpenAI-compatible | Native | `COPILOT_API_KEY` |
| ChatGPT Session | OpenAI-compatible | Native | `CHATGPT_SESSION_KEY` |

### Key Normalizers

Three normalizers unify provider-specific differences:
- **`errorNormalizer.ts`** — Maps provider-specific error codes to unified error types
- **`usageNormalizer.ts`** — Normalizes token usage (input/output/cache) across providers
- **`toolCallParser.ts`** — Parses tool calls from providers using JSON-text instead of native function calling

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
| `yolo` | YOLO Mode - auto-allow most tools |
| `yoloLite` | YOLO Lite - reduced auto-allow |
| `yoloMax` | YOLO Max - maximum auto-allow |
| `yoloGod` | YOLO God - maximum power, no limits |

## Storage Layout

```
~/.claude/
├── sessions/            # Session files
├── settings.json         # User settings
├── credentials.json      # Stored API tokens (encrypted)
├── keybindings.json      # Custom keybindings
├── plugins/              # Installed plugins
├── themes/               # Custom color themes
├── cache/
│   ├── models/           # Model metadata cache (5-min TTL)
│   └── providers/        # Provider response cache
└── crash-logs/           # Crash reports
```

## Code Style & Conventions

### TypeScript

- `tsconfig.json`: `strict: false`, `jsx: "react-jsx"`, `module: "ESNext"`, `target: ES2022`
- Prefer `unknown` over `any`; use Zod for runtime validation
- Use `debug()` library instead of `console.log`

### React / Ink

- Functional components only (no class components)
- Hooks for state and effects
- Always define props interfaces

### Commit Messages

Follow conventional commits: `[type](scope): subject`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `revert`
Scopes: `provider`, `command`, `tool`, `ui`, `permissions`, `mcp`, `plugin`, `bridge`, `session`, `config`

## Debugging

```bash
DEBUG=1 bun run src/main.tsx session                # Debug logging
bun run src/main.tsx session --verbose              # Verbose output
DEBUG=provider:anthropic bun run src/main.tsx session  # Module-specific debug
```

In-session diagnostics:
- `/status` — Show internal state
- `/doctor` — Run diagnostics
- `/doctor --fix` — Auto-fix issues
- `/context` — View context window usage

## Common Gotchas

- **`main.tsx` is monolithic** — handles CLI parsing, bootstrap, service init, and REPL loop all in one file. Be careful when editing.
- **Provider switching is immediate** — changing provider via `/provider` updates the active session instantly, no restart needed.
- **Ollama has no API key** — it's the only provider that doesn't require authentication; uses HTTP to `localhost:11434`.
- **Feature flags are env-only** — `KAIROS`, `BRIDGE_MODE`, `ULTRAPLAN`, `VOICE_MODE` can only be set via environment variables, not settings files.
- **Context auto-compaction** — when context reaches 80% of limit, old messages are automatically summarized. Configure via `autoCompact` and `compactThreshold` settings.
- **`tsconfig.json` has `strict: false`** — not all code is fully type-safe; be mindful of implicit `any`.

## Documentation

| Document | Description |
|----------|-------------|
| `README.md` | User-facing docs, providers, installation |
| `ARCHITECTURE.md` | System architecture & data flow |
| `DEVELOPMENT.md` | Development guide & conventions |
| `COMMANDS.md` | Complete command reference |
| `CONFIGURATION.md` | Configuration & settings reference |
| `API.md` | API & provider reference |
| `CHANGELOG.md` | Version history |
| `TESTING.md` | Testing guide |
| `TROUBLESHOOTING.md` | Common issues & fixes |
| `USAGE.md` | Usage examples |