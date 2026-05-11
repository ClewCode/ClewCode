# Claude Code

by Dek1milliontoken

Claude Code is an experimental, Bun-powered AI coding assistant CLI. This fork focuses on learning, research, and extension: multi-provider model routing, terminal UI, MCP integration, plugin workflows, permissions, subagents, and local developer automation.

> This repository is not affiliated with Anthropic. It is an independent research and development fork.

## What This Project Includes

- A terminal-first AI coding interface built with React/Ink-style components.
- Multi-provider AI support through `src/services/ai`.
- Built-in tools for reading, editing, searching, shell execution, MCP, notebooks, planning, and agent workflows.
- Slash commands for configuration, model/provider selection, permissions, plugins, MCP, sessions, git/worktree workflows, and diagnostics.
- Plugin support for commands, agents, skills, hooks, MCP servers, and output styles.
- Static HTML documentation in `docs/`.
- Example configs, hooks, and MDM policy files in `examples/`.

## Requirements

- Bun 1.3 or newer
- Git
- Windows, macOS, Linux, or WSL
- At least one configured AI provider or compatible local provider

## Install

```bash
bun install
```

If dependencies ever get into a stale state:

```bash
rm -rf node_modules
bun install
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
bun install
```

## Run

Development mode with watch:

```bash
bun run dev
```

Start once:

```bash
bun run start
```

Build:

```bash
bun run build
```

Test:

```bash
bun test
```

The dev script runs:

```bash
bun --watch run src/main.tsx
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full history. Key recent improvements:

- **MCP Stability**: per-call timeout isolation, 3× retry on transient errors, OAuth `client_secret_post` support, `alwaysLoad` option, auth error recovery, and header expansion.
- **Plugin fixes**: Windows path resolution for MCPB, npm update detection, hook version locking, and re-install dependency re-resolution.
- **OAuth fixes**: default TTL 24h (was 1h), unhandled rejection fix, needs-auth visibility for headersHelper servers.

## Provider Configuration

The repo contains provider implementations for:

- Anthropic
- OpenAI
- OpenAI Responses
- Google Gemini
- OpenRouter
- Ollama
- OpenAI-compatible endpoints
- ChatGPT session/OAuth flows
- Copilot
- KiloCode

Common environment variables:

```bash
# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google Gemini
export GOOGLE_GENERATIVE_API_KEY=...

# OpenRouter
export OPENROUTER_API_KEY=sk-or-...

# Ollama
export OLLAMA_HOST=http://localhost:11434
```

Inside the CLI, use:

```text
/provider
/model
```

See [docs/providers.html](docs/providers.html) and [docs/provider-pattern.html](docs/provider-pattern.html).

## Important Commands

Common interactive commands include:

```text
/help              Show command help
/model             Select or inspect models
/provider          Switch AI provider
/config            Edit configuration
/permissions       Review permission settings
/yolo              Open automation mode picker
/mcp               Manage MCP servers
/agents            Manage subagents
/plugins           Manage plugins
/reload-plugins    Reload plugin state
/theme             Change terminal theme
/doctor            Run diagnostics
/compact           Compact context
/resume            Resume a previous session
```

More command docs are in [docs/commands.html](docs/commands.html).

## Permissions And Automation

The project includes an ask-first permission model plus progressive automation modes. Keep the default permission behavior for normal development.

Automation modes such as `yolo-lite`, `yolo`, and `yolo-max` can allow broad tool execution. Use them only in trusted repositories or disposable sandboxes.

See:

- [docs/permissions.html](docs/permissions.html)
- [docs/permission-model.html](docs/permission-model.html)

## Plugins

Plugin examples live in `plugins/`. Current plugin folders include:

- `agent-sdk-dev`
- `claude-opus-4-5-migration`
- `code-review`
- `commit-commands`
- `explanatory-output-style`
- `feature-dev`
- `frontend-design`
- `hookify`
- `learning-output-style`
- `plugin-dev`
- `pr-review-toolkit`
- `ralph-wiggum`
- `security-guidance`

Plugins can contribute commands, agents, skills, hooks, MCP servers, and output styles depending on their manifest and file layout.

See:

- [plugins/README.md](plugins/README.md)
- [docs/plugins.html](docs/plugins.html)
- [docs/plugin-system.html](docs/plugin-system.html)

## MCP

MCP support is implemented under `src/services/mcp` and exposed through CLI commands and tool integration. The codebase includes MCP config loading, OAuth/auth flows, transport support, channel notifications, official registry helpers, and in-process transport utilities.

See [docs/mcp-integration.html](docs/mcp-integration.html).

## Project Layout

```text
src/
  commands/          Slash commands and command UI
  components/        Terminal UI components
  context/           React contexts and shared app state
  services/          AI providers, MCP, analytics, search, plugins, voice, VCR
  skills/            Built-in skill loading and skill helpers
  tools/             Built-in tool implementations
  utils/             Config, permissions, telemetry, shell, plugins, filesystem
  native-ts/         TypeScript ports/replacements for native helpers

docs/                Static HTML documentation site
plugins/             Bundled/example plugin directories
examples/            Example settings, hooks, and policy files
scripts/             Utility and automation scripts
assets/              Media assets
```

## Documentation

Open [docs/index.html](docs/index.html) in a browser.

Useful pages:

- [Installation](docs/installation.html)
- [Quick Start](docs/quick-start.html)
- [Configuration](docs/configuration.html)
- [Providers](docs/providers.html)
- [Commands](docs/commands.html)
- [Tools](docs/tools.html)
- [Agents](docs/agents.html)
- [Plugins](docs/plugins.html)
- [Architecture](docs/architecture.html)
- [Troubleshooting](docs/troubleshooting.html)

## Notes For Windows

This repo is intended to run with Bun on Windows as well as Unix-like environments. If you see repeated module resolution errors after dependency changes, refresh `node_modules`:

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

## Status

This is an active experimental fork. Some features are research-oriented, some are platform-specific, and some integrations may require private configuration, environment flags, or external services.

## License

See [LICENSE.md](LICENSE.md).
