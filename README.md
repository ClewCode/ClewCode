<div align="center">

<img src="assets/clew-logo-long.png" alt="Clew Code" width="480" />

# Clew Code

**The open-source AI coding agent — in your terminal and on your LAN.**

A multi-provider AI coding CLI that codes, learns your preferences, coordinates across machines, and runs autonomously on your own hardware. One Bun bundle. Local-first by design.

[![GitHub stars](https://img.shields.io/github/stars/ClewCode/ClewCode?style=social)](https://github.com/ClewCode/ClewCode/stargazers)
[![Contributors](https://img.shields.io/github/contributors/ClewCode/ClewCode.svg)](https://github.com/ClewCode/ClewCode/graphs/contributors)
[![Release](https://img.shields.io/github/v/release/ClewCode/ClewCode)](https://github.com/ClewCode/ClewCode/releases)
[![npm](https://img.shields.io/npm/v/clew-code)](https://www.npmjs.com/package/clew-code)
[![CI](https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/release.yml?branch=main)](https://github.com/ClewCode/ClewCode/actions)
[![License: MIT](https://img.shields.io/badge/license-GPL3-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Windows%20·%20Linux-lightgrey.svg)](#installation)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-ff69b4.svg)](https://bun.sh)

[GitHub](https://github.com/ClewCode/ClewCode) · [Latest Release](https://github.com/ClewCode/ClewCode/releases) · [Docs](docs/index.html) · [Issues](https://github.com/ClewCode/ClewCode/issues)

</div>

---

## Hacking in public

Clew Code is a fork of [Claude Code](https://github.com/anthropics/claude-code) (Anthropic), rebuilt from the ground up to be **multi-provider** — you're not locked into one API. As of this writing the project ships agent-to-agent LAN mesh coordination, a preference-learning engine, autonomous background loops, multi-pass context compaction, MCP integration, plan mode with full bypass permissions, and 27 provider adapters.

> Forked from Claude Code. Rebuilt for every provider.

---

## Features

- **27 providers** — Anthropic, OpenAI, Google Gemini, DeepSeek, Groq, xAI (Grok), Mistral, Cohere, Perplexity, Cerebras, Moonshot (Kimi), Zhipu (GLM), NVIDIA NIM, OpenRouter, GitHub Copilot, OpenCode, KiloCode, Ollama (local), Together AI, Fireworks AI, Deep Infra, SiliconFlow, Hugging Face, Poe, DigitalOcean, Cline, OpenCode Go. Switch mid-session.
- **Agent-to-agent mesh** — find other Clew instances on the same machine (file registry) or across machines (UDP multicast). Assign tasks, set roles, execute remote commands — 15 mesh AI tools (discover, run, spawn, share, join, ping, broadcast, send_message, list_roles, list_messages, set_name, set_role, disconnect, info, help) let your agent coordinate autonomously via `/mesh` commands.

- **Autonomous agent loop** — file-backed persistent task queue, lease-based concurrency, exponential backoff retry, dead-letter management. Cron scheduler for recurring jobs. Max 3 concurrent workers.
- **50+ built-in tools** — Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Browser (Playwright), PR (create/list/view/review/merge/status), NotebookEdit, JsonPath, mesh tools (15 LAN coordination tools), MCP tools, ProcessMesh (exec/pty), plan mode with full bypass permissions, multi-pass context compaction.
- **MCP — Model Context Protocol** — connect external tools via stdio (local subprocesses), SSE (remote servers with OAuth), or DirectConnect (in-process plugin servers).
- **Skills, plugins, hooks** — extend without touching source. Skills via `SKILL.md`, plugins with manifest, hooks at every lifecycle stage (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit).
- **7 permission modes** — default, ask, plan, auto, acceptEdits, bypassPermissions, dontAsk. Granular allow/deny rules with pattern matching.

---

## Concepts: Agents, Subagents, Mesh, and ACP

Clew Code has several execution layers. They are related, but they do different jobs:

- **Agent:** An AI worker with a prompt, model, tools, and permissions. The main chat session is an agent. Custom agents live in `.claude/agents/*.md`, and built-ins include `Explore`, `Plan`, and `general-purpose`.
- **Subagent:** A short-lived child agent launched by another agent through the `Agent` tool. Use subagents for independent work such as codebase exploration, test triage, or review. The built-in `Explore` agent is read-only and is the right choice for parallel "go inspect this area" tasks.
- **Teammate / Swarm:** A longer-lived agent team member with an identity, mailbox, task coordination, and optional pane/tmux or in-process execution. Use this when agents need to keep working together across multiple turns, not for isolated one-shot exploration.
- **LAN Mesh:** A network of Clew instances on the same machine or LAN. `/mesh` discovers peers, sends messages, assigns tasks, and runs commands on other Clew nodes.
- **Process Mesh:** A local process-backed worker layer. It delegates a prompt to an external CLI/provider such as Codex using `exec` or `pty`, then returns stdout, stderr, exit code, timeout state, and progress.
- **ACP:** An external protocol boundary. Editors, IDEs, REST clients, or other agents can send work into Clew through ACP. ACP should normalize the external request and route execution through Clew's internal layers instead of hardcoding a provider in every ACP entry point.

Typical flows:

```text
User
  -> main Clew agent
      -> Agent tool
          -> short-lived subagent, e.g. Explore
```

```text
External editor / external agent
  -> ACP
      -> shared ACP-to-mesh boundary
          -> Process Mesh provider, e.g. codex
              -> external CLI process
```

```text
Clew instance A
  -> LAN Mesh
      -> Clew instance B
          -> local agent, daemon task, or process worker
```

Use the layers by intent:

- Need a quick independent read-only investigation? Use an `Explore` subagent.
- Need long-running coordination between named workers? Use teammates/swarm.
- Need another Clew instance on the LAN? Use `/mesh`.
- Need an external editor or agent to call into Clew? Use ACP.
- Need Clew to run a local external worker such as Codex? Use Process Mesh.

Other runtime concepts:
- **Plan mode:** Full-access planning mode with bypass permissions — explore, read, write, and edit files freely. Plan files persist to `.clew/plans/long-term-plan.md` with task progress snapshot.
- **Multi-pass compaction:** Automatic chunk-based context compression with recursive re-compaction when context exceeds the model window.

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
❯ /mesh discover # find other Clew instances on LAN
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
/status       Provider, session, context info
/doctor       Diagnostics
/context      Active context usage
/compact      Compress conversation history
/mcp          MCP server management
/code-review  Review changed files for bugs
/simplify     Cleanup-focused review
/plugin       Plugin and hook management
/bridge       Bridge mode config
/agent        Background agent dispatch & subcommands
/agents       TUI Agent dashboard (operational view)
/mesh        Collaborate with Clew instances on LAN (formerly /peer)
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
│   ├── lsp/                 # LSP integration
│   └── Supervisor/          # Agent supervisor IPC
├── mesh/                    # MeshServer + MeshDiscovery (agent-to-agent)
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

[Installation](docs/installation.html) · [Configuration](docs/configuration.html) · [Providers](docs/providers.html) · [Models](docs/models.html) · [Commands](docs/commands.html) · [Tools](docs/tools.html) · [MCP](docs/mcp.html) · [Plugins](docs/plugins.html) · [Skills](docs/skills.html) · [Peer-to-Peer](docs/peer.html) · [Agent Loop](docs/loop.html) · [Permission Model](docs/permission-model.html) · [Daemon](docs/daemon.html) · [Bridge Mode](docs/features/bridge-mode.html) · [Troubleshooting](docs/troubleshooting.html)

---

## Changelog

<details>
<summary><strong>v0.2.7 — 2026-06-11</strong></summary>

- **process_peer PTY terminal box** — terminal-style progress box with ANSI-preserving output tail
- **`/mesh run codex <task>`** — run one-shot Codex process peer from chat
- **Auto-update dialog** — npm update notification before app starts
- **Rich model fetching** — API models now carry context window, vision, tools, reasoning, free tags
- **`/model list` capability tags** — `[200K ctx, vision, tools, reason, free]` per model
- **GlimmerMessage gradient** — per-character color interpolation with fade effect
- **Cost in status line** — shows session cost when >$0

</details>

<details>
<summary><strong>v0.2.6 — 2026-06-10</strong></summary>

- **Peer HTTP heartbeat** — 60s liveness checks, offline peers detected immediately
- **Removed GitHub Copilot** — provider and all references cleaned out
- **`/agents` visual polish** — redesigned dashboard, cleaner layout
- **Auto-updater** — switched from Anthropic GCS to npm registry

</details>

<details>
<summary><strong>v0.2.5 — 2026-06-10</strong></summary>

- **Rebranded to Clew Code** — docs, UI copy, and package updated
- **Memory search** — `/memory search` for stored entries
- **Peer tools** — 14 AI coordination tools, peer help, connection count in footer
- **Fixed `/providers`** — duplicate `const info` runtime error fixed

</details>

<details>
<summary><strong>v0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — UDP multicast discovery, file registry, 14 AI coordination tools, interactive PeerMenu
- **Autonomous agents** — agent loop, supervisor integration, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient highlight for "workflow" keyword

</details>

<details>
<summary><strong>v0.2.3 — 2026-06-07</strong></summary>

- `/effort` works with any provider exposing `reasoningEffort` (NVIDIA, DeepSeek, OpenRouter, etc.)
- `/model` fetches live model list from provider APIs
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
