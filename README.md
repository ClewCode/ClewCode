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

Clew Code is a reverse-engineered reimplementation of [Claude Code](https://github.com/anthropics/claude-code) (Anthropic), rebuilt from the ground up to be **multi-provider** — you're not locked into one API. As of this writing the project ships agent-to-agent LAN mesh coordination, a preference-learning engine, autonomous background loops, multi-pass context compaction, MCP integration, plan mode with full bypass permissions, goal verification, Max Mode parallel candidates, structured checkpoints, automated memory consolidation, and 27+ provider adapters.

> Reverse-engineered from Claude Code. Rebuilt for every provider.

---

## Features

- **27+ providers** — Anthropic, OpenAI, Google Gemini & Code Assist, DeepSeek, Groq, xAI (Grok), Mistral, Cohere, Perplexity, Cerebras, Moonshot (Kimi), Zhipu (GLM), NVIDIA NIM, OpenRouter, OpenCode, KiloCode, Ollama (local), Together AI, Fireworks AI, Deep Infra, SiliconFlow, Hugging Face, Poe, DigitalOcean, Cline, OpenCode Go. Switch mid-session.
- **Agent-to-agent mesh** — find other Clew instances on the same machine (file registry) or across machines (UDP multicast). Assign tasks, set roles, execute remote commands — 15 mesh AI tools (discover, run, spawn, share, join, ping, broadcast, send_message, list_roles, list_messages, set_name, set_role, disconnect, info, help) let your agent coordinate autonomously via `/mesh` commands.

- **Autonomous agent loop** — file-backed persistent task queue, lease-based concurrency, exponential backoff retry, dead-letter management. Cron scheduler for recurring jobs. Max 3 concurrent workers.
- **50+ built-in tools** — Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Browser (Playwright), PR (create/list/view/review/merge/status), NotebookEdit, JsonPath, ReadArtifact, mesh tools (15 LAN coordination tools), MCP tools, ProcessMesh (exec/pty), plan mode with full bypass permissions, multi-pass context compaction.
- **Goal system** — `/goal` tracks task completion with heuristic pre-checks (exit codes, test output, lint results). Goal chains with `then` syntax. Auto-integrates with AFK mode and the autonomous loop.
- **Goal Verifier** — When the agent attempts to terminate, an independent LLM verifier reviews the conversation against the goal text. If unsatisfied, the gap is reported as metadata for automatic re-prompting.
- **Max Mode** — parallel candidate generation (default 3 per turn) using forked agents. Selects the best response via LLM judge (model-as-judge) with heuristic fallback. Toggle with `/maxmode`.
- **Structured checkpoints** — automatic progress snapshots at 20%/45%/70% milestones with notes scratchpad (`notes.md`) for main-agent findings. Multi-cycle rebuild from checkpoints during compaction preserves layered context (decisions → notes → blockers → next steps).
- **Project memory promotion** — at the 70% checkpoint, stable information (active files, persistent decisions, notes) is promoted to `MEMORY.md` for cross-session persistence.
- **Automated memory consolidation** — Dream process (7-day cycle) merges duplicate insights and creates weekly digests. Distill process (30-day cycle) extracts reusable patterns and generates skill suggestions.
- **MCP — Model Context Protocol** — connect external tools via stdio (local subprocesses), SSE (remote servers with OAuth), or DirectConnect (in-process plugin servers).
- **Skills, plugins, hooks** — extend without touching source. Skills via `SKILL.md`, plugins with manifest, hooks at every lifecycle stage (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit).
- **7 permission modes** — default, ask, plan, auto, acceptEdits, bypassPermissions, dontAsk. Granular allow/deny rules with pattern matching.

---

## Concepts: Agents, Subagents, and Mesh

Clew Code has several execution layers. They are related, but they do different jobs:

- **Agent:** An AI worker with a prompt, model, tools, and permissions. The main chat session is an agent. Custom agents live in `.clew/agents/*.md`, and built-ins include `Explore`, `Plan`, and `general-purpose`.
- **Subagent:** A short-lived child agent launched by another agent through the `Agent` tool. Use subagents for independent work such as codebase exploration, test triage, or review. The built-in `Explore` agent is read-only and is the right choice for parallel "go inspect this area" tasks.
- **Teammate / Swarm:** A longer-lived agent team member with an identity, mailbox, task coordination, and optional pane/tmux or in-process execution. Use this when agents need to keep working together across multiple turns, not for isolated one-shot exploration.
- **LAN Mesh:** A network of Clew instances on the same machine or LAN. `/mesh` discovers peers, sends messages, assigns tasks, and runs commands on other Clew nodes.
- **Process Mesh:** A local process-backed worker layer. It delegates a prompt to an external CLI/provider such as Codex using `exec` or `pty`, then returns stdout, stderr, exit code, timeout state, and progress.

Typical flows:

```text
User
  -> main Clew agent
      -> Agent tool
          -> short-lived subagent, e.g. Explore
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
- Need Clew to run a local external worker such as Codex? Use Process Mesh.

Other runtime concepts:
- **Plan mode:** Full-access planning mode with bypass permissions — explore, read, write, and edit files freely. Plan files persist to `.clew/plans/long-term-plan.md` with task progress snapshot.
- **Multi-pass compaction:** Automatic chunk-based context compression with recursive re-compaction when context exceeds the model window.
- **Goal verification:** When the agent declares a task done, an independent LLM call reviews the conversation against the goal text and reports specific gaps if unsatisfied (attached as `goalGap` in result metadata).
- **Max Mode:** Generates N parallel candidate responses per turn via forked agents, then selects the best one via LLM judge with heuristic fallback. Toggle with `/maxmode`.
- **Checkpoints:** Structured snapshots at 20%/45%/70% progress milestones. Includes a `notes.md` scratchpad for the main agent's findings. Used for layered multi-cycle rebuild during compaction.

---

## Profiles: Coding vs Personal

Clew Code has two profiles you switch between with `/profile`:

- **Coding profile** (`/profile coding`) — default. Directly implement software changes: inspect repo, edit files, run validation.
- **Personal profile** (`/profile personal`) — command center mode. Plan, split tasks, **delegate** code work to a Codex worker via `process_mesh`, then review and summarize results.

### How personal delegation works

```
You → personal profile → understand requirement → plan approach
     → /delegate skill → process_mesh → Codex worker
     → worker implements → report back → you review
```

In personal profile, you never edit files directly — the `delegate` skill spawns a Codex worker with a structured task prompt (goal, scope, constraints, validation criteria) and reports what was done, what passed/failed, and what's blocked. Use personal profile when you want to orchestrate rather than implement.

Profile and last-used permission mode are saved between sessions.

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
❯ /goal "tests pass"  # track task completion
❯ /maxmode on     # parallel candidate generation
❯ /mesh discover  # find other Clew instances on LAN
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
export GEMINI_API_KEY=...
```

---

## Commands

<details>
<summary><strong>22 slash commands</strong></summary>

```
/model        Switch provider or model
/status       Provider, session, context info
/doctor       Diagnostics
/profile      Switch between coding and personal profiles
/context      Active context usage
/compact      Compress conversation history
/goal         Track and verify task completion
/maxmode      Toggle parallel candidate generation
/mcp          MCP server management
/code-review  Review changed files for bugs
/simplify     Cleanup-focused review
/plugin       Plugin and hook management
/bridge       Bridge mode config
/agent        Background agent dispatch & subcommands
/agents       TUI Agent dashboard (operational view)
/mesh         Collaborate with Clew instances on LAN
/remote       WebSocket remote control
/loop         24/7 autonomous agent loop
/daemon       Autonomous daemon dashboard
/task         Scheduled tasks
/memory       Long-term memory search and management
/tasks        Curated task list management
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
│   ├── ai/                  # Provider manager + 27+ providers
│   ├── mcp/                 # MCP client + auth + transports
│   ├── plugins/             # Plugin hooks + marketplace
│   ├── autonomous/          # Agent loop + task queue + cron
│   ├── checkpoint/          # Structured progress checkpoints
│   ├── goal/                # Goal evaluation and verification
│   ├── longTermMemory/      # Dream (7d) + Distill (30d) consolidation
│   ├── maxMode/             # Candidate runner + evaluator
│   ├── lsp/                 # LSP integration
│   └── Supervisor/          # Agent supervisor IPC
├── mesh/                    # MeshServer + MeshDiscovery (agent-to-agent)
├── memory/                  # Long-term memory (SQLite, FTS5)
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
<summary><strong>v0.2.22 — 2026-06-15</strong></summary>

- **Max Mode** — parallel candidate generation (default 3 per turn), `/maxmode` command
- **Goal system** — `/goal` with heuristic pre-checks, goal chains (`then`), AFK integration
- **Structured checkpoints** — progress snapshots at 20%/45%/70%, session rebuild from checkpoints
- **Dream process** — 7-day automated memory consolidation cycle
- **Distill process** — 30-day pattern extraction and reusable skill generation
- **Video input** — paste mp4/mov/webm to video-capable models (Gemini, GPT-5.x)
- **Image & Video generation** — `GenerateImage` (DALL-E 3, Imagen 3) and `GenerateVideo` (Runway Gen-4)
- **Profile system** — `/profile` switches between `coding` and `personal` profiles
- **Execution modes** — `/mode` with `safe`, `yolo`, `afk`, `review-only`, `browser-safe`
- **ReadArtifact tool** — read truncated large outputs in chunks
- **Bounded tool output** — 200-line cap with disk persistence for large results

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
