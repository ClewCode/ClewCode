<div align="center">

# Clew Code

**The open-source AI coding agent — in your terminal and on your LAN.**

A multi-provider AI coding CLI that codes, learns your preferences, coordinates across machines, and runs autonomously on your own hardware. One Bun bundle. Local-first by design.

[![GitHub stars](https://img.shields.io/github/stars/ClewCode/ClewCode?style=social)](https://github.com/ClewCode/ClewCode/stargazers)
[![Contributors](https://img.shields.io/github/contributors/ClewCode/ClewCode.svg)](https://github.com/ClewCode/ClewCode/graphs/contributors)
[![Release](https://img.shields.io/github/v/release/ClewCode/ClewCode)](https://github.com/ClewCode/ClewCode/releases)
[![npm](https://img.shields.io/npm/v/clew-code)](https://www.npmjs.com/package/clew-code)
[![CI](https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/release.yml?branch=main)](https://github.com/ClewCode/ClewCode/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Windows%20·%20Linux-lightgrey.svg)](#installation)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-ff69b4.svg)](https://bun.sh)

[GitHub](https://github.com/ClewCode/ClewCode) · [Latest Release](https://github.com/ClewCode/ClewCode/releases) · [Docs](docs/index.html) · [Issues](https://github.com/ClewCode/ClewCode/issues)

</div>

---

## Hacking in public

Clew Code is a fork of [Claude Code](https://github.com/anthropics/claude-code) (Anthropic), rebuilt from the ground up to be **multi-provider** — you're not locked into one API. As of this writing the project ships peer-to-peer LAN coordination, a preference-learning engine, autonomous background loops, MCP integration, and 27 provider adapters.

> Forked from Claude Code. Rebuilt for every provider.

---

## Features

- **27 providers** — Anthropic, OpenAI, Google Gemini, DeepSeek, Groq, xAI (Grok), Mistral, Cohere, Perplexity, Cerebras, Moonshot (Kimi), Zhipu (GLM), NVIDIA NIM, OpenRouter, GitHub Copilot, OpenCode, KiloCode, Ollama (local), Together AI, Fireworks AI, Deep Infra, SiliconFlow, Hugging Face, Poe, DigitalOcean, Cline, OpenCode Go. Switch mid-session.
- **Peer-to-peer LAN mesh** — find other Clew instances on the same machine (file registry) or across machines (UDP multicast). Assign tasks, set roles, execute remote commands — 14 AI tools let your agent coordinate autonomously.
- **Preference learning (Taste)** — learns from accept, reject, edit, test, and lint signals. Three-tier rule engine (≥0.85 blocks edits, ≥0.55 injects into prompts, <0.55 scores silently). Contextual bandit with 6 strategy arms. Auto-decay on 30-day half-life.
- **Autonomous agent loop** — file-backed persistent task queue, lease-based concurrency, exponential backoff retry, dead-letter management. Cron scheduler for recurring jobs. Max 3 concurrent workers.
- **50+ built-in tools** — Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Browser (Playwright), PR (create/list/view/review/merge/status), NotebookEdit, JsonPath, peer tools, MCP tools.
- **MCP — Model Context Protocol** — connect external tools via stdio (local subprocesses), SSE (remote servers with OAuth), or DirectConnect (in-process plugin servers).
- **Skills, plugins, hooks** — extend without touching source. Skills via `SKILL.md`, plugins with manifest, hooks at every lifecycle stage (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit).
- **7 permission modes** — default, ask, plan, auto, acceptEdits, bypassPermissions, dontAsk. Granular allow/deny rules with pattern matching.

---

## Install

```bash
npm install -g clew-code
```

```bash
# Then run inside any project
cd my-project
clew
```

Requires [Bun](https://bun.sh) 1.3+, Node.js 18+, Git, and one provider API key.

**Build from source:**

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install && bun run build && bun run start
```

<details>
<summary><b>Platform notes</b></summary>

- **macOS** — works out of the box (Apple Silicon & Intel)
- **Linux** — no special dependencies
- **Windows** — requires Git Bash, WSL, or PowerShell. Some tools (ComputerUse) are Windows-only.
</details>

---

## Quick start

```sh
# First run — pick a provider when prompted
clew

# Configure a provider (inside the REPL)
❯ /provider openai
❯ /model gpt-5.5

# Or try DeepSeek
❯ /model deepseek-v4-pro

# Or go local with Ollama
❯ /model ollama/llama3.3

# In-session commands
❯ /help           # list everything
❯ /status         # current provider, model, context info
❯ /taste          # preference-learning menu
❯ /peer discover  # find other Clew instances on LAN
❯ /mcp list       # connected MCP servers
❯ /loop start     # background autonomous loop

# One-shot mode (pipe-friendly)
clew -p "summarize CHANGELOG.md"

# Resume last session
clew --resume last
```

---

## Provider setup

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export DEEPSEEK_API_KEY=...
export GROQ_API_KEY=...
export OPENROUTER_API_KEY=...
export OLLAMA_HOST=http://localhost:11434
export COPILOT_GITHUB_TOKEN=gho_...
```

---

## Commands

<details>
<summary><strong>17 slash commands</strong></summary>

```
/model        Switch provider or model
/taste        Preference-learning menu
/status       Provider, session, context info
/doctor       Diagnostics
/context      Active context usage
/compact      Compress conversation history
/mcp          MCP server management
/code-review  Review changed files for bugs
/simplify     Cleanup-focused review
/plugin       Plugin and hook management
/bridge       Bridge mode config
/agent        Background agent workflows
/peer         LAN peer coordination
/remote       WebSocket remote control
/loop         24/7 autonomous agent loop
/daemon       Autonomous daemon dashboard
/task         Scheduled tasks
```

</details>

---

## Project layout

<details>
<summary><strong>src/ — single-entry Bun bundle</strong></summary>

```
src/
├── main.tsx                 # Entry point
├── query.ts / QueryEngine.ts
├── agentRuntime/            # Background agent orchestration
├── commands/                # Slash command implementations
├── tools/                   # 50+ built-in tools
├── services/
│   ├── ai/                  # Provider manager + 27 providers
│   ├── mcp/                 # MCP client + auth + transports
│   ├── plugins/             # Plugin hooks + marketplace
│   ├── autonomous/          # Agent loop + task queue + cron
│   ├── taste/               # Preference-learning engine
│   ├── lsp/                 # LSP integration
│   └── Supervisor/          # Agent supervisor IPC
├── peer/                    # PeerServer + PeerDiscovery
├── bridge/                  # WebSocket bridge + relay
├── components/              # Ink terminal UI components
├── state/                   # AppState management
└── hooks/                   # React hooks
```

</details>

---

## Development

```bash
bun run dev           # Live reload
bun run build         # Build to dist/
bun test              # Vitest
bun x tsc --noEmit    # Type-check
bun run check:ci      # Full CI check (lint + test + typecheck)
```

**Windows:**
```powershell
Remove-Item -Recurse -Force node_modules
bun install && bun run dev
```

---

## Contribute

We welcome contributions. Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), and [LICENSE.md](LICENSE.md) before submitting.

### Good first issues

- Add a new provider adapter in `src/services/ai/`
- Write tests for untested tools
- Fix docs, add examples
- Build a plugin or MCP server
- Improve Windows support

### Contributors

<a href="https://github.com/ClewCode/ClewCode/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ClewCode/ClewCode" alt="Contributors" />
</a>

---

## Documentation

[Installation](docs/installation.html) · [Configuration](docs/configuration.html) · [Providers](docs/providers.html) · [Models](docs/models.html) · [Commands](docs/commands.html) · [Tools](docs/tools.html) · [MCP](docs/mcp.html) · [Plugins](docs/plugins.html) · [Skills](docs/skills.html) · [Peer-to-Peer](docs/peer.html) · [Taste](docs/taste.html) · [Agent Loop](docs/loop.html) · [Permission Model](docs/permission-model.html) · [Daemon](docs/daemon.html) · [Bridge Mode](docs/features/bridge-mode.html) · [Troubleshooting](docs/troubleshooting.html)

---

## Changelog

<details>
<summary><strong>v0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — UDP multicast discovery, file registry, 14 AI coordination tools, interactive PeerMenu
- **Taste** — `taste_learn`, `taste_forget`, `taste_profile`, `taste_suggest` tools
- **Autonomous agents** — agent loop, supervisor integration, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient highlight for "workflow" keyword

</details>

<details>
<summary><strong>v0.2.3 — 2026-06-07</strong></summary>

- `/effort` works with any provider exposing `reasoningEffort` (NVIDIA, DeepSeek, OpenRouter, etc.)
- `/model` fetches live model list from provider APIs
- Taste auto-learns patterns from accept/reject signals
- Relay server for cross-network remote control
- Bridge v2: provider-agnostic remote control
- `/pr create/list/view/review/merge/status`
- Security: PowerShell rules, malformed tool call guard, 100 MB bash output cap

</details>

[Full changelog](CHANGELOG.md)

---

## License

[LICENSE.md](LICENSE.md) — covers only contributor-authored modifications and original additions. Does not grant rights to third-party software, models, or trademarks.

Clew Code is a fork of [Claude Code](https://github.com/anthropics/claude-code) (Anthropic). All original Claude Code code remains under its license.
