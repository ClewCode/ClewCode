<div align="center">

<img src="assets/clew-logo-long.png" alt="Clew Code" width="520" />

# Clew Code

**An AI coding agent that lives in your terminal, uses your API keys, and doesn't phone home.**

[![GitHub stars](https://img.shields.io/github/stars/ClewCode/ClewCode?style=flat-square&color=blue)](https://github.com/ClewCode/ClewCode/stargazers)
[![Release](https://img.shields.io/github/v/release/ClewCode/ClewCode?style=flat-square&color=orange)](https://github.com/ClewCode/ClewCode/releases)
[![npm](https://img.shields.io/npm/v/clew-code?style=flat-square&color=red)](https://www.npmjs.com/package/clew-code)
[![CI](https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/ci.yml?branch=main&style=flat-square)](https://github.com/ClewCode/ClewCode/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg?style=flat-square)](#license)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-ff69b4.svg?style=flat-square)](https://bun.sh)

[GitHub](https://github.com/ClewCode/ClewCode) · [Website](https://clew-code.org) · [Docs](https://clew-docs.pages.dev)

</div>

---

Clew Code is a local-first AI coding agent. It reads your repo, writes code, runs commands, and talks to LLMs through your own API keys. No SaaS, no vendor lock-in, no telemetry.

It's one binary that replaces the loop you'd otherwise do manually: think, edit, run, read errors, repeat. You bring the API keys, it brings 29 providers, 70+ tools, and enough infrastructure to keep a session alive across days of work.

## Why this exists

Most AI coding tools are either hosted SaaS (your code leaves your machine) or tied to a single provider. Clew Code is neither. It's a CLI that runs on your hardware, talks to any provider you configure, and saves everything to a local SQLite database. Your context, memory, and session state survive restarts. No data leaves your network unless you explicitly allow it.

## What you get

- **A terminal REPL** — Ink-based with autocomplete, syntax highlighting, slash commands, inline streaming. Feels like a real editor, not a chat widget.
- **Multi-provider out of the box** — Switch between OpenAI, Anthropic, Google, DeepSeek, Groq, OpenRouter, Ollama, and 20+ others mid-session with `/model`.
- **Persistent memory** — SQLite-backed store that learns your project over time. Facts survive compaction, sessions, and restarts. No vector DB needed.
- **LAN swarm** — Zero-config peer discovery over UDP multicast. Sync memory across machines, delegate tasks, broadcast shell commands to your whole local network.
- **MCP support** — Model Context Protocol over stdio, SSE, or direct WebSocket. Bolt on external tools without modifying Clew Code itself.
- **Background daemon** — Runs a task queue with lease-based concurrency, cron scheduling, dead-letter retries, and memory maintenance while you're not looking.
- **70+ built-in tools** — File I/O, git, browser automation, LSP, web search, task management, goal verification, peer coordination, media generation, voice input.

## Quick start

```bash
npm install -g clew-code

cd your-project
clew
```

First launch walks you through provider setup. After that, `/model` to pick your LLM, then start typing.

One-shot commands without entering the REPL:

```bash
clew -p "Fix the failing tests and explain what was wrong"
```

Resume where you left off:

```bash
clew --resume last
```

## Providers

Clew Code talks to any OpenAI-compatible API plus native SDKs for Anthropic, Google, and others. Configure one or configure ten — switch with `/model` any time.

openai · anthropic · google · openrouter · deepseek · groq · xai · mistral · together · fireworks · deepinfra · nvidia · cohere · perplexity · cerebras · siliconflow · moonshot · zhipu · huggingface · poe · digitalocean · cline · ollama · kilocode · opencode · opencode-go · clew-gateway · custom

Full list at **[clew-docs.pages.dev](https://clew-docs.pages.dev)**.

## CLI options

```
-p, --prompt <text>       One-shot prompt, then exit
-c, --continue            Continue last conversation
-r, --resume [id]         Resume a session (opens picker if no id)
--fork-session            Clone a session under a new ID
--model <model>           Override model (sonnet, opus, gemini-2.5-flash, etc.)
--effort <level>          Reasoning effort (low|medium|high|max)
--agent <agent>           Custom agent profile
--permission-mode <mode>  default|ask|plan|auto
--peer-share              Start as a LAN worker peer
--computer                Enable OS-level computer use (Windows)
--debug                   Developer debug output
```

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

## Project structure

```
src/
├── main.tsx              # Entry point
├── QueryEngine.ts        # Message + tool loop
├── query.ts              # Non-streaming variant
├── commands/             # Slash command handlers
├── tools/                # 70+ tool implementations
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

### Codebase graph

```bash
graphify query "<question>"   # Ask about the codebase
graphify update .             # Refresh after changes
```

### Shadow `.js` files

`src/` has ~188 `.js` files alongside `.ts` twins (JS→TS migration in progress). Bun resolves `.js` import specifiers to the real `.js` file on disk. If you're making a runtime fix, edit **both** the `.ts` and `.js` files.

## License

GPL-3.0. See [LICENSE.md](LICENSE.md).

Release history in [CHANGELOG.md](CHANGELOG.md).
