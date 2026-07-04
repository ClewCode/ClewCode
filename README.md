<div align="center">

<img src="assets/clew-logo-long.png" alt="Clew Code" width="520" />

# Clew Code
### *The agent that works where you do.*

<p align="center">
  <a href="https://github.com/ClewCode/ClewCode/stargazers"><img src="https://img.shields.io/github/stars/ClewCode/ClewCode?style=for-the-badge&color=blue" alt="GitHub stars"></a>
  <a href="https://github.com/ClewCode/ClewCode/releases"><img src="https://img.shields.io/github/v/release/ClewCode/ClewCode?style=for-the-badge&color=orange" alt="Release"></a>
  <a href="https://www.npmjs.com/package/clew-code"><img src="https://img.shields.io/npm/v/clew-code?style=for-the-badge&color=red" alt="npm"></a>
  <a href="https://github.com/ClewCode/ClewCode/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge" alt="License"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/built%20with-Bun-ff69b4.svg?style=for-the-badge" alt="Bun"></a>
</p>

[Website](https://clew-code.org) · [Docs](https://clew-docs.pages.dev) · [Wiki](https://github.com/ClewCode/ClewCode/wiki) · [GitHub](https://github.com/ClewCode/ClewCode)

</div>

---

Clew Code is a terminal-native AI coding agent that lives in your repo, works with your API keys, and **doesn't phone home**. It reads your code, writes files, runs commands, and talks to any LLM you bring — all on your machine, no telemetry, no vendor lock-in.

If you want a coding assistant that feels local, fast, and doesn't ship your context to a third-party server, this is it.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Install](#quick-install)
- [Getting Started](#getting-started)
- [Use Cases](#use-cases)
- [Features](#features)
- [CLI Quick Reference](#cli-quick-reference)
- [Screenshots](#screenshots)
- [Security](#security)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [FAQ](#faq)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [Star History](#star-history)
- [License](#license)

---

## Prerequisites

- **Node.js** 18+ or **Bun** 1.x (recommended for development)
- An **API key** from at least one supported provider (see [Providers docs](https://clew-docs.pages.dev/providers))
- *Optional:* Git, Playwright (for browser automation), microphone (for voice input)

---

## Quick Install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.ps1 | iex
```

### npm (cross-platform)

```bash
npm install -g clew-code
```

---

## Getting Started

```bash
cd your-project
clew                      # Launch the REPL
clew -p "fix the tests"   # One-shot mode
clew --resume last         # Pick up where you left off
```

First launch walks you through provider setup. After that, use `/model` to switch providers mid-session.

---

## Use Cases

| Scenario | How Clew Code Helps |
|---|---|
| **Fix failing tests** | `clew -p "Fix the failing tests and explain what was wrong"` — reads test output, diagnoses root cause, applies fixes. |
| **Refactor a module** | Point it at a file, describe the target structure. Uses multi-file edit tools, git status awareness, and checkpoint rollback on mistakes. |
| **Research a codebase** | `/research "How does auth work?"` — searches code, docs, and web, then compiles a dossier with source references. |
| **Background automation** | Run `/bg` to delegate long-running tasks (migration, lint fixes) to a background agent while you keep working in the REPL. |
| **Cross-repo changes** | `/workspace link ../other-repo` — edit across linked projects with full context from both. |

---

## Features

| | |
|---|---|
| **29+ providers** | OpenAI, DeepSeek, Groq, Anthropic, Google, Ollama (local), and 22+ more. Switch mid-session with `/model`. No lock-in. |
| **Persistent memory** | SQLite-backed, MiMo-inspired store with importance ranking, confidence scoring, and cross-session persistence. Auto-consolidation via Dream + Distill. |
| **75+ tools** | Read, Write, Edit, Grep, Bash, Browser, MCP, LSP, git, web search, task management, peer coordination, media generation, voice input. |
| **LAN peer swarm** | Zero-config peer discovery over UDP multicast. Sync memory across machines, delegate tasks, broadcast shell commands across your network. |
| **MCP + Plugins + Skills** | Model Context Protocol over stdio/SSE/WebSocket. Extend with plugins, `SKILL.md` workflows, or lifecycle hooks. |
| **Background daemon** | Task queue with lease-based concurrency, cron scheduling, dead-letter retries, and memory maintenance. |
| **Goal verification + checkpoints** | Track completion with heuristic checks and independent LLM verification. Structured snapshots at 20%/45%/70% progress. |
| **Multi-agent architecture** | Agents, Subagents, LAN Peers, Process Peers. Personal profile turns Clew into a command center that delegates to Codex workers. |

---

## CLI Quick Reference

```
-p, --prompt <text>       One-shot prompt, then exit
-c, --continue            Continue last conversation
-r, --resume [id]         Resume a session (opens picker if no id)
--model <model>           Override model (sonnet, opus, gemini-2.5-flash, etc.)
--effort <level>          Reasoning effort (low|medium|high|max)
--agent <agent>           Custom agent profile
--permission-mode <mode>  default\|ask\|plan\|auto
--peer-share              Start as a LAN worker peer
--computer                Enable OS-level computer use (Windows only)
--debug                   Developer debug output
```

Slash commands: `/model`, `/memory`, `/task`, `/goal`, `/compact`, `/peer`, `/mcp`, `/agent`, `/plan`, `/voice`, `/research`, `/workflow`, `/skills`, and [many more](https://clew-docs.pages.dev/cli).

---

## Screenshots

![Clew Code REPL](assets/screenshots/clew-code-repl.png)

Clew Code running in the terminal REPL.

---

## Security

Clew Code runs entirely on your machine. No code or context leaves your network unless you explicitly configure a remote provider or send a web fetch.

- Prompts for permission before read, write, or terminal execution
- Fine-tune auto-approve rules per workspace
- Permission scopes: default, ask, plan, auto
- Guardian system for auto-review using secondary LLM

---

## Documentation

| Guide | Description |
|---|---|
| [Quick Start](https://clew-docs.pages.dev/quick-start) | Launch the CLI and start coding |
| [Installation](https://clew-docs.pages.dev/installation) | One-liner, npm, or build from source |
| [CLI Reference](https://clew-docs.pages.dev/cli) | Full CLI options, providers, commands |
| [Configuration](https://clew-docs.pages.dev/configuration) | Settings files, hooks, permission modes |
| [MCP Guide](https://clew-docs.pages.dev/mcp) | Connect external tools and APIs |
| [Plugins](https://clew-docs.pages.dev/plugins) | Lifecycle hooks and customization |
| [Security & Permissions](https://clew-docs.pages.dev/security-permissions) | Permission scopes, guardian system |
| [Skills System](https://clew-docs.pages.dev/skills) | Automate repeatable workflows |
| [Memory System](https://clew-docs.pages.dev/memory-system) | SQLite-backed long-term memory |
| [Peer-to-Peer LAN](https://clew-docs.pages.dev/peer-to-peer) | Discover, delegate, swarm commands |
| [Architecture](https://clew-docs.pages.dev/concepts-agents-subagents-peers) | Agents, Subagents, Peers |
| [Troubleshooting](https://clew-docs.pages.dev/troubleshooting) | Common issues and fixes |

Also available on the [GitHub Wiki](https://github.com/ClewCode/ClewCode/wiki).

---

## Configuration

Key environment variables read at startup:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Anthropic Claude models |
| `OPENAI_API_KEY` | No | OpenAI GPT models |
| `DEEPSEEK_API_KEY` | No | DeepSeek models |
| `GOOGLE_API_KEY` | No | Google Gemini models |
| `GROQ_API_KEY` | No | Groq-hosted models |
| `TAVILY_API_KEY` | No | Enhanced web search provider |
| `CLEW_DISABLE_TELEMETRY` | No | Disable anonymous usage stats (`1`) |

All provider keys can also be set via the `/model` provider setup flow or in `.clew/settings.json` under `env`.

---

## Architecture

```
┌─ REPL ─────────────────────────────┐
│  Ink + React 19          ┌───────┐ │
│  Slash commands / skills │ Tools │ │
│  Streaming / history     └───┬───┘ │
└────────┬─────────────────────┘     │
         ▼                           │
┌─ QueryEngine ──────────────────────┘
│  Tool loop · Provider routing · Streaming
│  Context compaction · Checkpoints
└──┬────┬────┬────┬────┐
   ▼    ▼    ▼    ▼    ▼
┌────┐┌────┐┌────┐┌────┐┌──────────┐
│ MCP││LSP ││Git ││Web ││ Provider │
│    ││    ││    ││    ││ Manager  │
└────┘└────┘└────┘└────┘└──────────┘
   │         LAN            │
   ▼         ▼              ▼
┌──────┐┌──────────┐┌──────────────┐
│ SQLite││ Peer     ││ AgentRuntime │
│Memory ││ Server   ││ Task Queue   │
└──────┘└──────────┘└──────────────┘
```

---

## Project Structure

```
src/
├── main.tsx              # Entry point
├── QueryEngine.ts        # Message + tool loop
├── commands/             # Slash command handlers
├── tools/                # 75+ tool implementations
├── services/
│   ├── ai/               # 29 provider adapters
│   ├── mcp/              # MCP client (stdio/SSE/WebSocket)
│   └── autonomous/       # Task queue, cron, daemon
├── peer/                 # LAN P2P discovery + server
├── memory/               # SQLite memory store
├── skills/               # SKILL.md loader
├── plugins/              # Plugin system
└── remote/               # Bridge v2 WebSocket server
```

Full breakdown in **[AGENTS.md](AGENTS.md)**.

---

## Development

```bash
bun run dev               # Live-reload REPL
bun run build             # Production build to dist/
bun test                  # Vitest suite
bun run check:ci          # Biome lint + format check
bun x tsc --noEmit        # TypeScript check
```

### Full pre-commit

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

### Shadow `.js` files

`src/` has ~410 `.js` files alongside `.ts` twins (leftover from JS → TS migration). Bun resolves `.js` import specifiers to the real `.js` file on disk — it does **not** prefer the `.ts` source. If you're making a runtime fix, check for a `.js` sibling and edit **both** files.

---

## FAQ

**Q: Does this send my code to a remote server?**  
A: No. Clew Code runs entirely on your machine. Code only leaves your network if you explicitly configure a remote provider or use a web fetch tool.

**Q: Which providers are supported?**  
A: 29+ including OpenAI, Anthropic, DeepSeek, Groq, Google, Ollama (local), and more. Switch mid-session with `/model`.

**Q: Can I use it without an internet connection?**  
A: Yes — pair it with a local provider like Ollama running on your machine.

**Q: How is this different from Claude Code or Cursor?**  
A: Clew Code is provider-agnostic (not locked to one LLM), fully local (no SaaS), and open source (GPL-3.0). It supports multi-provider routing, LAN peer swarms, and persistent memory.

**Q: Does it have a GUI?**  
A: It runs in the terminal with a full TUI (Ink + React 19). Some features are also available via a web dashboard at [clew-code.org/app](https://clew-code.org/app).

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Report bugs via [GitHub Issues](https://github.com/ClewCode/ClewCode/issues)
- Discuss ideas in [GitHub Discussions](https://github.com/ClewCode/ClewCode/discussions)
- Read [AGENTS.md](AGENTS.md) for architecture and code conventions

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ClewCode/ClewCode&type=Date)](https://star-history.com/#ClewCode/ClewCode&Date)

---

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).

Release history in [CHANGELOG.md](CHANGELOG.md).
