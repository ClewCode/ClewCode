# Architecture

This document outlines Claude Code's architecture, design patterns, and data flow.

## Overview

Claude Code is an AI-powered coding assistant with two frontends:
- **CLI** (TUI) — Built with Ink/React, runs in terminal
- **Web** — Next.js web app (optional)

Both share a common `shared/` package containing core services and AI provider integrations.

```
┌─────────────────────────────────────────────┐
│                  Frontends                   │
│  ┌─────────────┐         ┌─────────────┐   │
│  │   CLI TUI   │         │   Web App   │   │
│  │ (Ink/React) │         │  (Next.js)  │   │
│  └──────┬──────┘         └──────┬──────┘   │
│         │                       │           │
│         └───────────┬───────────┘           │
│                     │                       │
│         ┌───────────▼───────────┐           │
│         │   shared/ services    │           │
│         │  • Provider System    │           │
│         │  • Auth               │           │
│         │  • Tool definitions   │           │
│         └───────────────────────┘           │
└─────────────────────────────────────────────┘
```

## Core Components

### Main Entry Point

`src/main.tsx` — Bootstraps the application:
- Initializes telemetry & feature flags
- Loads settings from config/env
- Parses command-line arguments
- Starts the REPL (Read-Eval-Print Loop)

### Claude Integration

Located in `shared/services/ai/`:

- `ProviderManager.ts` — Central orchestrator for all AI providers
- `ProviderInterface.ts` — Base interface for all provider implementations
- `MultiProviderAuth.ts` — Manages authentication across multiple providers
- `AnthropicProvider.ts` — Anthropic Claude integration
- `OpenAIProvider.ts` — OpenAI GPT integration
- `GoogleProvider.ts` — Google Gemini integration
- `ClaudeModels.ts` — Model definitions and utilities (Anthropic-specific)

Flow:
```
CLI/UI → ProviderManager → ProviderInterface → Provider SDK → AI Provider API
```

## Current Implementation

The current implementation uses Anthropic's Claude models as the primary AI provider. The codebase includes configuration support for multiple providers, but the actual API integration currently only supports Anthropic.

### Current Architecture

```
CLI/UI → Anthropic Client → Anthropic API (Claude models)
```

The main API client (`src/services/api/client.ts`) uses the official `@anthropic-ai/sdk` package to interact with Claude models. It supports:

- Direct API access with `ANTHROPIC_API_KEY`
- AWS Bedrock deployment
- Azure Foundry (Azure OpenAI)
- Google Vertex AI

### Provider Configuration

While the runtime only supports Anthropic, the CLI includes a provider selection system that allows configuration of different providers for future multi-provider support. The configuration is stored in `~/.claude-code-provider.json`.

Available providers in configuration:
- **OpenAI** - GPT-4, GPT-4.1, GPT-4.1-mini, GPT-4o-mini
- **Anthropic** - Claude Opus 4, Sonnet 4, Haiku (active)
- **Google Gemini** - Gemini 2.5 Flash
- **OpenRouter** - 100+ models via OpenRouter
- **Groq** - Llama 3.3, 3.1, etc.
- **xAI** - Grok 4, Grok 4-mini
- **Mistral** - Mistral Large
- **KiloCode** - KiloCode AI Gateway
- **OpenCode** - OpenCode AI Gateway
- **Ollama** - Local models

### Current API Client

The `getAnthropicClient()` function in `src/services/api/client.ts` creates an Anthropic SDK client with support for:

- Standard API key authentication
- AWS Bedrock (with IAM or API key)
- Azure Foundry (with Azure AD or API key)
- Google Vertex AI (with GCP credentials)

### Future Multi-Provider Support

The codebase includes infrastructure for multi-provider support that could be activated:

- Provider configuration system (`CLI_PROVIDER_DEFAULTS`)
- Model selection per provider
- Base URLs for different providers
- Environment variable keys for each provider

To enable full multi-provider support, the following would need to be implemented:

1. Provider abstraction layer (similar to the documented `ProviderInterface`)
2. Provider-specific SDK integrations (OpenAI, Google, etc.)
3. Unified message format conversion
4. Runtime provider switching logic
5. Per-provider authentication management

### Message Format

The system uses Anthropic's message format with beta features for:
- Tool use
- JSON mode output
- Document inputs
- Image inputs

### Message Pipeline

```
User Input → Tool Execution → Context Assembly → Anthropic Client → Anthropic API → Streaming Response → Display
```

Key modules:
- `src/utils/messages.ts` — Message conversion utilities
- `src/services/api/client.ts` — Anthropic SDK client
- `src/services/api/claude.ts` — Message processing and streaming
- `src/utils/toolExecution.ts` — Tool orchestration

### Tool System

Tools allow the AI to interact with the environment (files, git, shell, etc.).

Structure:
```
src/tools/
├── Tool.ts              # Base class
├── index.ts             # Tool registry
├── BashTool/           # Shell execution
├── FileReadTool/       # Read files
├── FileWriteTool/      # Write files
├── GitTool/            # Git operations
├── WebSearchTool/      # Web search
└── ...
```

Each tool implements:
- `inputSchema` — Zod schema for validation
- `execute` — Runtime implementation
- Permissions (sandbox requirements)

### Permission System

Located in `src/utils/permissions/`:

- Tools require approval (auto/manual mode)
- Sandboxing for shell commands
- Configurable per-session or globally

### Session & State Management

- **Zustand** stores in `src/state/` for UI state (CLI)
- Session data persisted in `~/.claude/` or project `.claude/`
- `src/utils/sessionStorage.ts` — Save/resume sessions
- `src/history.js` — Command history

### MCP (Model Context Protocol)

MCP servers extend Claude Code with external tools and data:

```
Claude Code ↔ MCP Client ↔ MCP Server (external process)
```

Implementation:
- `src/services/mcp/client.ts` — MCP client
- `src/services/mcp/config.ts` — MCP config parsing
- Tools/resources from MCP are dynamically added

### Remote Control & Teleport

Multi-user collaboration features:

- `src/bridge/` — REPL bridge for remote connections
- `src/remote/` — Remote session management
- WebSocket-based communication

### Feature Flags & Analytics

- **GrowthBook** for feature flags
- `src/services/analytics/` — Event tracking
- `src/utils/fastMode.ts` — Early loading optimizations

## Data Flow

### Single Query (Non-Streaming)

1. User types message in REPL
2. Context manager adds relevant files/git status
3. Tool use decisions are made by model
4. Tool results collected and fed back
5. Final response rendered
6. Session persisted

### Streaming Query

Same as above, but response tokens stream as they arrive.

## Extensibility

### Adding a Tool

1. Create tool class extending `Tool`
2. Define input schema with Zod
3. Implement `execute` method
4. Register in `src/tools/index.ts`
5. Add permission flags if sandboxed

### Adding a Command

1. Create file `src/commands/<name>/index.ts`
2. Export Commander command
3. Register in appropriate command loader
4. Add help text

## Performance Optimizations

- **Prefetching**: Startup prefetch for user config, git status
- **Bundle splitting**: Dynamic imports for heavy features
- **Caching**: Prompt cache, provider config cache
- **Lazy loading**: MCP servers only when needed

## Security Considerations

- API keys stored in OS keychain or env vars
- Shell commands sandboxed by default
- Tools require explicit permission (except safe ones)
- Code execution always asks confirmation unless auto-mode enabled
- All tool inputs validated with Zod schemas

## Testing

- Unit tests with Bun's test runner
- Integration tests for tools and providers
- E2E tests with Playwright (optional)

Run:
```bash
bun test
# or specific test
bun test test/my-test.ts
```

## Build & Distribution

```bash
# Build CLI
bun run build  # Outputs to dist/

# Package with pkg or nexe for distribution
# Bundled executables available from releases
```

## Future Directions

- VS Code extension integration
- Enhanced Claude feature support (vision, tool use)
- Improved agent system (auto-swarming)
- Cloud sync for sessions
- Plugin marketplace
