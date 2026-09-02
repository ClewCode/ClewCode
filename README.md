# Clew Code

Clew Code is an AI coding agent for the terminal. It works in your repository, where it can read and edit files, run commands, use development tools, and help complete multi-step tasks.

Clew Code supports multiple AI providers. Choose the provider and model that fit your project.

- [Install](#install)
- [Quick start](#quick-start)
- [Choose a model](#choose-a-model)
- [What you can do](#what-you-can-do)
- [Commands](#commands)
- [Configuration](#configuration)
- [Security](#security)
- [Develop](#develop)
- [Contributing](#contributing)

## Install

### npm

```bash
npm install --global clew-code
```

This installs the `clew` and `clewcode` commands.

### macOS and Linux

```bash
curl --fail --silent --show-error --location https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.ps1 | iex
```

## Quick start

Change to a project directory and start Clew Code:

```bash
cd path/to/your-project
clew
```

On the first run, configure a provider. You can sign in through the Clew gateway with `/login`, or configure a provider API key directly.

You can also run one prompt without opening the interactive interface:

```bash
clew -p "run the tests and fix the failures"
```

Other useful examples:

```bash
clew --resume last
clew --model openai/gpt-5.5
```

## Choose a model

Open the model picker:

```text
/model
```

You can select a model for the current session or save it as the default. To select a model directly:

```text
/model provider/model
```

Use `/providers` to configure provider connections. Clew Code supports Claude, GPT, Gemini, DeepSeek, Groq, Ollama, OpenRouter, and other providers.

By default, `/login` uses the Clew gateway at `api.clew-code.org`. Set `CLEW_DISABLE_GATEWAY=1` to use provider credentials directly.

## What you can do

Clew Code provides:

- Repository-aware code exploration and editing
- Shell, Git, web, browser, media, and LSP tools
- Streaming responses and multi-step tool use
- Plans, tasks, checkpoints, context compaction, and `/rewind`
- Multiple agents, background tasks, cron jobs, and daemons
- **Filesystem-first Memory** (`.clew/memory/store/*.md` + `index.json` cache + `timeline.jsonl`) and **Taste** (`.clew/taste/rules|evidence|conflicts`) with auto-learning (`/taste why`)
- **The Shining** — anticipatory layer (`needed_context` / `next_tool` / `risk` premonitions → prefetch + `ToolSearch` preload)
- Prompt cache for all providers (27 `automatic` + Anthropic `explicit`, 4 breakpoints, `CLEW_CACHE_RETENTION=long` defaults to 1h)
- Semantic code search, plugins, skills, hooks, and MCP servers
- Workspace linking and optional audit logs
- Permission modes: `default`, `ask`, `plan`, and `auto`

## Commands

Use `/help` for the complete list. Common commands include:

| Command | Use it to |
| --- | --- |
| `/model` | Select a model |
| `/providers` | Configure providers |
| `/plan` | Plan a multi-step change |
| `/task` | View or manage tasks |
| `/code-review` | Review the current diff |
| `/research` | Research code, documentation, or the web |
| `/bg` | Run a task in the background |
| `/agents` | Inspect active agents |
| `/compact` | Reduce conversation context |
| `/rewind` | Restore a previous checkpoint |
| `/mcp` | Configure MCP servers |
| `/workspace` | Link repositories |
| `/doctor` | Diagnose configuration problems |

## Configuration

Provider credentials can be configured interactively or with environment variables.

| Variable | Provider or purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `GOOGLE_API_KEY` | Google Gemini |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `GROQ_API_KEY` | Groq |
| `TAVILY_API_KEY` | Tavily web search |
| `BRAVE_API_KEY` | Brave web search |
| `SERPER_API_KEY` | Serper web search |
| `JINA_API_KEY` | Jina search and fetch |
| `CLEW_DISABLE_GATEWAY=1` | Use provider keys directly |
| `CLEW_DISABLE_TELEMETRY=1` | Disable anonymous usage statistics |
| `CLEW_CACHE_RETENTION=long` | Prompt cache 1h (default) — `short` for 5m, alias `PI_CACHE_RETENTION` |
| `bun run cleanup:memory-db` | Remove legacy `memory.db`/`chunks.db`/`taste.db` SQLite caches |

Settings are stored locally. See the [provider documentation](https://clew-docs.pages.dev/providers) for the current provider list.

### Audit logging

Enable audit logging with:

```bash
CLEW_AUDIT_LOG=1 CLEW_AUDIT_LOG_PATH=.clew/audit bun run dev
```

Additional audit settings include `CLEW_AUDIT_LOG_MAX_BYTES`, `CLEW_AUDIT_LOG_MAX_FILES`, `CLEW_AUDIT_LOG_INCLUDE`, `CLEW_AUDIT_LOG_EXCLUDE`, `CLEW_AUDIT_LOG_MIN_LEVEL`, `CLEW_AUDIT_LOG_CONSOLE`, and `CLEW_AUDIT_USER`.

## Security

Clew Code runs locally. The configured AI provider receives the prompts and repository context needed for each request. Review provider policies before sending sensitive code.

Clew Code can ask for confirmation before file changes and shell commands. Use the permission mode that matches your workflow, and do not put secrets in prompts or tracked files.

## Develop

Requirements:

- [Bun](https://bun.sh/)
- Node.js 18 or later

Clone the repository and install dependencies:

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install
```

Start the development CLI:

```bash
bun run dev
```

Useful commands:

```bash
bun run build
bun run start
bun test
bun run check:ci
bun x tsc --noEmit
```

Before pushing changes:

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

See [AGENTS.md](AGENTS.md) for repository conventions and architecture.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before making changes.

- Report bugs in [GitHub Issues](https://github.com/ClewCode/ClewCode/issues)
- Discuss ideas in [GitHub Discussions](https://github.com/ClewCode/ClewCode/discussions)
- Keep tests and documentation up to date

## Links

- [Website](https://clew-code.org)
- [Documentation](https://clew-docs.pages.dev)
- [GitHub](https://github.com/ClewCode/ClewCode)
- [Releases](https://github.com/ClewCode/ClewCode/releases)

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).
