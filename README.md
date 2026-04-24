# Claude Code

Claude Code is a powerful AI-powered coding assistant. This fork keeps the Claude Code branding while adding provider-neutral routing for OpenAI-compatible APIs, Google Gemini, OpenRouter, KiloCode, local Ollama, and optional Anthropic Claude.

## Features

- **Multi-Provider Support** (configuration): Switch between OpenAI-compatible providers, Gemini, OpenRouter, KiloCode, Ollama, and Anthropic
- **CLI Interface**: Fast terminal-based workflow with rich tooling
- **Web Interface**: Modern web UI for visual interaction
- **40+ Built-in Tools**: File operations, git integration, web search, MCP, LSP, and more
- **Agent System**: Create and manage custom AI agents
- **Plugin System**: Extensible architecture with skills and plugins
- **Session Management**: Resume conversations, teleport sessions, remote collaboration
- **Cost Tracking**: Monitor token usage and costs across providers

## Quick Start

### CLI

```bash
# Install
npm install -g claude-code

# Run
claude
```

### Web Interface

```bash
# Start web server
claude --web

# Open browser to http://localhost:3000
```

## Configuration

Set your Anthropic API key (current runtime only supports Anthropic Claude models):

```bash
export ANTHROPIC_API_KEY="your-key"
```

Note: While the configuration system supports multiple providers (OpenAI, Google Gemini, etc.), the current runtime only supports Anthropic Claude models. All API requests are sent to Anthropic's API. Multi-provider support is planned for future implementation.

## Provider Selection

```bash
# Switch provider
claude --provider openai

# Select model
claude --model gpt-4o
```

## Development

```bash
# Clone and install
git clone <repository>
cd claude-code
bun install

# Run CLI in development
bun run src/main.tsx

# Build
bun run build

# Run tests
bun test
```

## License

MIT
