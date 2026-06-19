<div align="center">

<img src="assets/clew-logo-long.png" alt="Clew Code" width="480" />

# Clew Code

**The open-source AI coding agent — in your terminal and on your LAN.**

A multi-provider AI coding CLI that codes, learns your preferences, coordinates across machines, and runs autonomously on your own hardware. One Bun bundle. Local-first by design. MiMo-inspired memory system. Peer-to-peer LAN swarm. 70+ built-in tools.

[![GitHub stars](https://img.shields.io/github/stars/ClewCode/ClewCode?style=social)](https://github.com/ClewCode/ClewCode/stargazers)
[![Contributors](https://img.shields.io/github/contributors/ClewCode/ClewCode.svg)](https://github.com/ClewCode/ClewCode/graphs/contributors)
[![Release](https://img.shields.io/github/v/release/ClewCode/ClewCode)](https://github.com/ClewCode/ClewCode/releases)
[![npm](https://img.shields.io/npm/v/clew-code)](https://www.npmjs.com/package/clew-code)
[![CI](https://img.shields.io/github/actions/workflow/status/ClewCode/ClewCode/ci.yml?branch=main)](https://github.com/ClewCode/ClewCode/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-macOS%20·%20Windows%20·%20Linux-lightgrey.svg)](#installation)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-ff69b4.svg)](https://bun.sh)

[GitHub](https://github.com/ClewCode/ClewCode) · [Latest Release](https://github.com/ClewCode/ClewCode/releases) · [Docs](docs/index.html) · [Issues](https://github.com/ClewCode/ClewCode/issues)

</div>

---

## Hacking in public

Clew Code is a reverse-engineered reimplementation of [Claude Code](https://github.com/anthropics/claude-code) (Anthropic), rebuilt from the ground up to be **multi-provider** — you're not locked into one API. As of this writing the project ships a MiMo-inspired memory system (SQLite-backed, budgeted injection, cross-session persistence), agent-to-agent LAN peer coordination with swarm execution and memory sync, a preference-learning engine, autonomous background loops, multi-pass context compaction, MCP integration, plan mode with full bypass permissions, goal verification, Max Mode parallel candidates, structured checkpoints, automated memory consolidation (Dream + Distill), and 28 provider adapters.

> Reverse-engineered from Claude Code. Rebuilt for every provider.

---

## Install

### One-liner (recommended)

Installs Bun automatically if missing, then installs clew-code and opens a new terminal ready to go.

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.sh | bash
```

Windows (PowerShell as Admin):
```powershell
irm https://raw.githubusercontent.com/ClewCode/ClewCode/main/scripts/install.ps1 | iex
```

### With npm (requires Bun or Node.js already installed)

```bash
npm install -g clew-code
```

```bash
# Then run inside any project
cd my-project
clew
```

Requires [Bun](https://bun.sh) 1.3+, Node.js 18+, Git, and one provider API key.

### Build from source

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
❯ /goal "tests pass"  # track task completion with verification
❯ /maxmode on     # parallel candidate generation
❯ /peer discover  # find other Clew instances on LAN
❯ /peer swarm clew -p "summarize CHANGELOG.md"  # run on all peers
❯ /peer dashboard # show peer task checklist
❯ /peer memory sync       # import memories from all peers
❯ /peer memory auto on    # auto-sync memories every 60 min
❯ /mcp list       # connected MCP servers
❯ /daemon        # background autonomous loop
❯ /compact        # compress context + auto-extract durable memories
❯ /memory dashboard # unified memory system status
❯ /memory init    # bootstrap project memory (SQLite + scan)
❯ /memory rebuild # reconstruct context from ranked memories
❯ /memory recall --verbose  # recall ranked memories
❯ /profile personal  # command-center mode with delegation

# One-shot mode (pipe-friendly)
clew -p "summarize CHANGELOG.md"

# Resume last session
clew --resume last
```

---

## Provider setup

```bash
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export DEEPSEEK_API_KEY=...
export GROQ_API_KEY=...
export OPENROUTER_API_KEY=...
export OLLAMA_HOST=http://localhost:11434
export GEMINI_API_KEY=...
```

---

## Features

- **28 providers** — OpenAI, Google Gemini & Code Assist, DeepSeek, Groq, xAI (Grok), Mistral, Cohere, Perplexity, Cerebras, Moonshot (Kimi), Zhipu (GLM), NVIDIA NIM, OpenRouter, OpenCode, OpenCode Go, KiloCode, Ollama (local), Together AI, Fireworks AI, Deep Infra, SiliconFlow, Hugging Face, Poe, DigitalOcean, Cline, custom. Switch mid-session. *(Anthropic provider removed — use [Claude Code](https://github.com/anthropics/claude-code) directly for Anthropic-first workflows.)*
- **Memory system (MiMo-inspired)** — SQLite-backed memory store with importance ranking, confidence scoring, access tracking, and timeline event logging. Auto-init + legacy migration + scan on first use. Budgeted memory injection into system prompt selects memories by importance × recency × confidence to fit the token budget. **In-compact extraction** automatically saves durable facts (`[decision]`, `[architecture]`, `[taste]`, `[bug]`) during context compaction. **Dream** (7-day) + **Distill** (30-day) auto-consolidate. Dream output synced to MemoryDB automatically. `/memory dashboard` shows unified status of MemoryDB, Dream, Distill, Peer Sync, and timeline.
- **Peer-to-peer LAN** — find other Clew instances on the same machine (file registry) or across machines (UDP multicast). Assign tasks, set roles, execute remote commands — 15+ peer AI tools let your agent coordinate autonomously via `/peer` commands. **Swarm execution** broadcasts shell commands to all peers in parallel with aggregated results. **Peer memory sync** imports memories from all peers into local MemoryDB; auto-sync on cron. **Message broker** (in-process queue) enables offline message delivery with correlation IDs. **Peer dashboard** shows task checklists across all peers.
- **Autonomous agent loop** — file-backed persistent task queue, lease-based concurrency, exponential backoff retry, dead-letter management. Cron scheduler for recurring jobs. Max 3 concurrent workers.
- **70+ built-in tools** — Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Browser (Playwright), NotebookEdit, JsonPath, ReadArtifact, peer tools (15+ LAN coordination tools including swarm + dashboard), MCP tools, ProcessPeer (exec/pty), MemoryFeedback (agent-driven memory curation), plan mode with full bypass permissions, multi-pass context compaction, GenerateImage (DALL-E 3 / Imagen 3), GenerateVideo (Runway Gen-4), ReadMediaFile (video input).
- **Goal system** — `/goal` tracks task completion with heuristic pre-checks (exit codes, test output, lint results). Goal chains with `then` syntax. Templates for common workflows (`fix-build`, `green-tests`, `refactor`). Auto-integrates with AFK mode and the autonomous loop. Independent LLM verifier reviews completion and reports gaps.
- **Max Mode** — parallel candidate generation (default 3 per turn) using forked agents. Selects the best response via LLM judge (model-as-judge) with heuristic fallback. Toggle with `/maxmode`.
- **Structured checkpoints** — automatic progress snapshots at 20%/45%/70% milestones with notes scratchpad (`notes.md`) for main-agent findings. Multi-cycle rebuild from checkpoints during compaction preserves layered context (decisions → notes → blockers → next steps). Project memory promotion at 70% checkpoint.
- **Personal profile** — `/profile personal` sets command-center mode with plan/split/delegate workflow to Codex workers via ProcessPeer. Profile + last permission mode saved between sessions.
- **MCP — Model Context Protocol** — connect external tools via stdio (local subprocesses), SSE (remote servers with OAuth), or DirectConnect (in-process plugin servers).
- **Skills, plugins, hooks** — extend without touching source. Skills via `SKILL.md`, plugins with manifest, hooks at every lifecycle stage (PreToolUse, PostToolUse, PreBash, PostPrompt, PreAcceptEdit).
- **8 permission modes** — default, ask, plan, auto, acceptEdits, bypassPermissions, dontAsk, guardian. Granular allow/deny rules with pattern matching.

---

## Concepts: Agents, Subagents, and Peers

Clew Code has several execution layers. They are related, but they do different jobs:

- **Agent:** An AI worker with a prompt, model, tools, and permissions. The main chat session is an agent. Custom agents live in `.clew/agents/*.md`, and built-ins include `Explore`, `Plan`, and `general-purpose`.
- **Subagent:** A short-lived child agent launched by another agent through the `Agent` tool. Use subagents for independent work such as codebase exploration, test triage, or review. The built-in `Explore` agent is read-only and is the right choice for parallel "go inspect this area" tasks.
- **Teammate / Swarm:** A longer-lived agent team member with an identity, mailbox, task coordination, and optional pane/tmux or in-process execution. Use this when agents need to keep working together across multiple turns, not for isolated one-shot exploration.
- **LAN Peer:** A network of Clew instances on the same machine or LAN. `/peer` discovers peers, sends messages, assigns tasks, and runs commands on other Clew nodes.
- **Process Peer:** A local process-backed worker layer. It delegates a prompt to an external CLI/provider such as Codex using `exec` or `pty`, then returns stdout, stderr, exit code, timeout state, and progress.

Typical flows:

```text
User
  -> main Clew agent
      -> Agent tool
          -> short-lived subagent, e.g. Explore
```

```text
Clew instance A
  -> LAN Peer
      -> Clew instance B
          -> local agent, daemon task, or process worker
```

Use the layers by intent:

- Need a quick independent read-only investigation? Use an `Explore` subagent.
- Need long-running coordination between named workers? Use teammates/swarm.
- Need another Clew instance on the LAN? Use `/peer`.
- Need Clew to run a local external worker such as Codex? Use Process Peer.

Other runtime concepts:
- **Plan mode:** Full-access planning mode with bypass permissions — explore, read, write, and edit files freely. Plan files persist to `.clew/plans/long-term-plan.md` with task progress snapshot.
- **Multi-pass compaction:** Automatic chunk-based context compression with recursive re-compaction when context exceeds the model window.
- **Goal verification:** When the agent declares a task done, an independent LLM call reviews the conversation against the goal text and reports specific gaps if unsatisfied (attached as `goalGap` in result metadata).
- **Max Mode:** Generates N parallel candidate responses per turn via forked agents, then selects the best one via LLM judge with heuristic fallback. Toggle with `/maxmode`.
- **Checkpoints:** Structured snapshots at 20%/45%/70% progress milestones. Includes a `notes.md` scratchpad for the main agent's findings. Used for layered multi-cycle rebuild during compaction.

---

## Profiles: Coding vs Personal

Clew Code has a **personal profile** (`/profile personal`) — command center mode. Plan, split tasks, **delegate** code work to a Codex worker via `process_peer`, then review and summarize results.

### How personal delegation works

```
You → personal profile → understand requirement → plan approach
     → /delegate skill → ProcessPeer → Codex worker
     → worker implements → report back → you review
```

In personal profile, you never edit files directly — the `delegate` skill spawns a Codex worker with a structured task prompt (goal, scope, constraints, validation criteria) and reports what was done, what passed/failed, and what's blocked. Use personal profile when you want to orchestrate rather than implement.

Profile and last-used permission mode are saved between sessions.

---

## Commands

<details>
<summary><strong>30+ slash commands</strong></summary>

```
/model          Switch provider or model
/status         Provider, session, context info
/doctor         Diagnostics
/profile        Personal profile mode (coding / personal)
/context        Active context usage
/compact        Compress conversation history + extract memories
/goal           Track and verify task completion (chains, templates)
/maxmode        Toggle parallel candidate generation
/mcp            MCP server management
/code-review    Review changed files for bugs
/simplify       Cleanup-focused review
/plugin         Plugin and hook management
/bridge         Bridge mode config
/agent          Background agent dispatch & subcommands
/agents         TUI Agent dashboard (operational view)
/peer           LAN peers: share, discover, join, send, swarm, dashboard, memory sync/auto
/remote         WebSocket remote control
/daemon         Autonomous daemon dashboard
/task           Scheduled tasks
/memory         Memory system: init, scan, rebuild, recall, feedback, dashboard, search
/tasks          Curated task list management
/effort         Set reasoning effort (including ultracode)
/stats          Session statistics and cost breakdown
/guardian       Auto-review mode using secondary LLM
/approve        Override guardian denials
/pr             GitHub PR lifecycle
/voice          Voice input via browser Web Speech API
/buddy          Companion card and naming
/team           Team dashboard for in-process teammates
/bg             Background sessions
/plan           Plan mode
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
├── tools/                   # 70+ built-in tools
├── services/
│   ├── ai/                  # Provider manager + 28 providers
│   ├── mcp/                 # MCP client + auth + transports
│   ├── plugins/             # Plugin hooks + marketplace
│   ├── autonomous/          # Agent loop + task queue + cron
│   ├── checkpoint/          # Structured progress checkpoints
│   ├── goal/                # Goal evaluation and verification
│   ├── longTermMemory/      # Dream (7d) + Distill (30d) consolidation
│   ├── maxMode/             # Candidate runner + evaluator
│   ├── lsp/                 # LSP integration
│   └── Supervisor/          # Agent supervisor IPC
├── peer/                    # PeerServer + PeerDiscovery (agent-to-agent)
├── memory/                  # MemoryDB + autoInit + scanner + hierarchy + feedback (MiMo-style)
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
<summary><strong>v0.3.2 — 2026-06-18</strong></summary>

- **Fixed `schema._zod.def` crash**: `zodToJsonSchema()` now checks for `_zod` branding before calling `toJSONSchema()`, preventing crashes when a non-Zod value is passed as a tool schema.
- **Fixed `generateSettingsJSONSchema()` crash**: Wrapped `toJSONSchema()` with try-catch to handle Zod v4 serialization failures.

</details>

<details>
<summary><strong>v0.3.1 — 2026-06-18</strong></summary>

- **Fixed PeerStore infinite recursion**: Removed 7 duplicate alias methods that called themselves recursively, fixing `Maximum call stack size exceeded` during `peer_discover`.

</details>

<details>
<summary><strong>v0.3.0 — 2026-06-18</strong></summary>

- **Peer memory sync**: `/peer memory sync` imports memories from all connected peers. Auto-sync on cron (`/peer memory auto on`).
- **Memory system dashboard**: `/memory dashboard` shows unified view of MemoryDB, Dream, Distill, Peer Sync, and timeline.
- **Legacy migration**: Auto-migrates old `session-memory.db` into MemoryDB during `/memory init`.
- **Redirected longTermMemory to MemoryDB**: Dream, graph, experience, cross-session all now read/write to MemoryDB instead of their own SQLite/JSON files.
- **MemoryDB — SQLite-backed memory store**: `memories` table (importance, confidence, access_count, type), `memory_timeline` table (event lifecycle). Budgeted querying, auto-eviction, timeline logging.
- **Memory hierarchy**: `.clew/memory/` directory with MEMORY.md, DECISIONS.md, TASTE.md. Auto-initializes on first use.
- **Budgeted injection**: Importance-ranked memory injection into system prompt, fits configurable token budget.
- **`/memory scan`**: Detects stack/language/package-manager/entrypoints, bootstraps seed memories.
- **`/memory rebuild`**: Reconstructs context from memories via budgeted injection with per-memory detail.
- **`/memory recall`**: Recalls memories ranked by combined score. Access count bump, `--verbose` for breakdown.
- **`/memory feedback`**: 7 signals (accepted, rejected, corrected, preferred, disliked, important, wrong). Updates importance/confidence, writes `preferred` to TASTE.md.
- **In-compact memory extraction**: Compact prompt asks LLM for `<memories>` block with structured facts; `parseCompactMemories()` extracts and saves to MemoryDB + markdown.
- **Peer task dashboard**: `/peer dashboard` command + `peer_dashboard` AI tool. Shows connected peers, tasks, and result summaries.
- **`/peer swarm`**: Sends shell command to ALL connected peers in parallel via `/peer-exec`, aggregates results. Supports `--timeout`, `--filter`, `--dry-run`.
- **`peer_swarm` tool**: New AI-callable tool — runs shell commands on all peers in parallel.
- **In-process message broker**: `POST /broker/send`, `GET /broker/recv` (long-poll), `POST /broker/reply`. Message queuing with correlation IDs inside existing PeerServer.
- **`/model` fetches from API for all providers**: `supportsModelFetching()` expanded to all providers (except google-assist).
- **Removed Anthropic provider**: clew-gateway + cline cover Anthropic models. Standalone `anthropic` entry removed.
- **Hidden `clew-gateway` provider**: Filtered from `PROVIDER_IDS`.
- **Auto memory lifecycle**: `ensureMemorySystem()` auto-inits DB + auto-scans on first access. Budgeted memories auto-injected every turn.
- **Memory tests**: 8 new tests for upsert idempotency, content-hash detection, recall ranking, feedback signals, and budget limits.

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
