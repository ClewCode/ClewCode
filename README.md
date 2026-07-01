<div align="center">

<img src="assets/clew-logo-long.png" alt="Clew Code" width="480" />

# Clew Code

**An open-source, multi-provider AI coding agent for the terminal.**

A reverse-engineered, local-first coding CLI inspired by Claude Code. It runs on your own hardware with your own API keys — no vendor lock-in.

[![GitHub stars](https://img.shields.io/github/stars/ClewCode/ClewCode?style=social)](https://github.com/ClewCode/ClewCode/stargazers)
[![Release](https://img.shields.io/github/v/release/ClewCode/ClewCode)](https://github.com/ClewCode/ClewCode/releases)
[![npm](https://img.shields.io/npm/v/clew-code)](https://www.npmjs.com/package/clew-code)
[![CI](https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/ci.yml?branch=main)](https://github.com/ClewCode/ClewCode/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Windows%20·%20Linux-lightgrey.svg)](#install)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-ff69b4.svg)](https://bun.sh)

[GitHub](https://github.com/ClewCode/ClewCode) · [Website](https://clew-code.org) · [Issues](https://github.com/ClewCode/ClewCode/issues)

</div>

---

## Overview

Clew Code is an AI coding agent that runs in your terminal. It is **provider-agnostic**: bring an API key from OpenAI, Google, DeepSeek, Groq, OpenRouter, a local Ollama model, or any other supported provider, and switch between them mid-session.

The project is built around three principles:

- **Local-first.** Code, memory, and configuration stay on your machine. It ships as a single Bun bundle and requires no cloud backend.
- **Persistent memory.** A SQLite-backed memory system records decisions, preferences, and project context, then injects relevant history back into future prompts.
- **Horizontal scale.** Instances on the same LAN can discover one another, distribute tasks, synchronize memory, and execute commands as a swarm.

---

## Installation

### npm

```bash
npm install -g clew-code
```

### From source

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install && bun run build && bun run start
```

**Requirements:** [Bun](https://bun.sh) 1.3+, Git, and at least one provider API key.

<details>
<summary><b>Platform notes</b></summary>

- **macOS** — works out of the box (Apple Silicon and Intel).
- **Linux** — no special dependencies.
- **Windows** — requires Git Bash, WSL, or PowerShell.
</details>

---

## Quick start

```bash
# Launch in any project — select a provider on first run
cd my-project
clew
```

Set a provider key via environment variable, or configure it from within the REPL:

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export DEEPSEEK_API_KEY=...
export GROQ_API_KEY=...
export OPENROUTER_API_KEY=...
export OLLAMA_HOST=http://localhost:11434
```

```bash
# One-shot mode (pipe-friendly)
clew -p "summarize CHANGELOG.md"

# Resume the most recent session
clew --resume last
```

Common commands inside the REPL:

```text
❯ /model gemini-2.5-flash   # switch provider/model mid-session
❯ /model ollama/llama3.3    # switch to a fully local model
❯ /status                   # provider, model, and context usage
❯ /goal "tests pass"        # track and verify task completion
❯ /memory dashboard         # memory system status
❯ /peer discover            # find Clew instances on the LAN
❯ /mcp list                 # connected MCP servers
❯ /help                     # full command list
```

---

## Features

### Multi-provider support
OpenAI, Google Gemini and Code Assist, DeepSeek, Groq, xAI (Grok), Mistral, Cohere, Perplexity, Cerebras, Moonshot (Kimi), Zhipu (GLM), NVIDIA NIM, OpenRouter, OpenCode, KiloCode, Sakana AI, Ollama, Together AI, Fireworks AI, Deep Infra, SiliconFlow, Hugging Face, Poe, DigitalOcean, Cline, and custom endpoints. Switch providers or models at any time with `/model`. Anthropic models are reachable via OpenRouter or Cline.

### Memory system
A SQLite-backed memory store ranks entries by importance, confidence, and access frequency. It initializes and scans a project automatically on first use, then injects a token-budgeted selection of memories into the system prompt on each turn. Durable facts are extracted during context compaction, and background jobs consolidate memory over time.

### Peer-to-peer LAN swarm
Discover other Clew instances on the same machine or across the local network. Assign tasks, set roles, and broadcast shell commands to every peer in parallel, with team memory sync and conflict resolution.

### Tools
Built-in tools cover file I/O (Read, Write, Edit, Glob, Grep), shell execution (Bash), web access (WebSearch, WebFetch, browser automation via Playwright), task tracking, LSP integration, subagent dispatch (`Agent`), LAN peer coordination, MCP tools, and agent-driven memory curation.

### Extensibility
- **MCP** — connect external tools over stdio, SSE, or in-process DirectConnect.
- **Skills, plugins, and hooks** — extend behavior without modifying source. Skills are defined via `SKILL.md`, plugins via manifest, and lifecycle hooks cover PreToolUse, PostToolUse, PreBash, PostPrompt, and PreAcceptEdit.
- **Permission modes** — default, ask, plan, auto, acceptEdits, bypassPermissions, dontAsk, and guardian.

### Additional capabilities
- **Goals and verification** — track task completion with chained goals and independent LLM verification.
- **Autonomous agent loop** — a persistent task queue with lease-based concurrency, retry, and dead-letter handling.
- **Context compaction** — recursive compression as the context window fills.
- **Checkpoints** — progress snapshots with a scratchpad for layered rebuilds during compaction.

---

## Execution layers

Clew Code executes work at several distinct layers:

| Layer | Description | Typical use |
|-------|-------------|--------------|
| **Agent** | An AI worker with a prompt, model, tools, and permissions. The main chat is an agent; custom agents live in `.clew/agents/*.md`. | The session itself. |
| **Subagent** | A short-lived child process launched via the `Agent` tool. | Independent investigation, test triage, review. |
| **Teammate / Swarm** | A longer-lived agent with identity, mailbox, and task coordination. | Multi-turn collaboration between named workers. |
| **LAN Peer** | Another Clew instance on the same machine or network, reached via `/peer`. | Distributing work across machines. |
| **Process Peer** | A local worker that delegates to an external CLI via `exec`/`pty`. | Running another coding tool as a subprocess. |

---

## Commands

<details>
<summary><strong>Slash commands</strong></summary>

```
/model          Switch provider or model
/status         Provider, session, context info
/doctor         Diagnostics
/context        Active context usage
/compact        Compress history + extract memories
/goal           Track and verify task completion
/memory         Memory: init, scan, rebuild, recall, feedback, dashboard, search
/peer           LAN peers: discover, send, swarm, dashboard, memory sync
/daemon         Autonomous daemon dashboard
/task           Scheduled tasks
/mcp            MCP server management
/plugin         Plugin and hook management
/skills         List and manage skills
/code-review    Review changed files for bugs
/simplify       Cleanup-focused review
/guardian       Auto-review mode using a secondary LLM
/approve        Override guardian denials
/pr             GitHub PR lifecycle
/plan           Plan mode
/fork           Fork conversation into a new session
/rewind         Undo last response
/effort         Set reasoning effort
/stats          Session statistics
/voice          Voice input
/remote         WebSocket remote control
/bridge         Bridge mode config
/session        Session management
/theme          Theme switcher
/vim            Vim keybindings
/login          Sign in via Clew Gateway
/logout         Sign out
/upgrade        Check for updates
```

</details>

---

## Project layout

<details>
<summary><strong>src/ — single-entry Bun bundle</strong></summary>

```
src/
├── main.tsx              # Entry point
├── QueryEngine.ts        # Core query + tool loop
├── commands/             # Slash command implementations
├── tools/                # Built-in tools
├── services/
│   ├── ai/               # Provider manager + adapters
│   ├── mcp/              # MCP client + auth + transports
│   ├── plugins/          # Plugin hooks + marketplace
│   ├── autonomous/       # Agent loop + task queue + cron
│   ├── search/           # Web search providers
│   ├── checkpoint/       # Structured progress checkpoints
│   ├── goal/             # Goal evaluation and verification
│   ├── longTermMemory/   # Memory consolidation
│   └── compact/          # Context compression
├── peer/                 # PeerServer + PeerDiscovery
├── memory/               # MemoryDB + scanner + feedback
├── bridge/               # WebSocket bridge + relay
├── components/           # Ink terminal UI
└── hooks/                # React hooks
```

</details>

---

## Development

```bash
bun run dev           # Live reload
bun run build         # Build to dist/
bun test              # Run tests
bun x tsc --noEmit    # Type-check
bun run check:ci      # Lint + format check (Biome CI)
```

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before opening a pull request.

<a href="https://github.com/ClewCode/ClewCode/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ClewCode/ClewCode" alt="Contributors" />
</a>

---

## License

See [LICENSE.md](LICENSE.md).

Full version history: [CHANGELOG.md](CHANGELOG.md).
