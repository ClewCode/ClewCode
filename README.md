<p align="center">
  <img src="/assets/clew-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="readme/README.zh.md">中文</a> ·
  <a href="readme/README.th.md">ไทย</a> ·
  <a href="readme/README.ja.md">日本語</a> ·
  <a href="readme/README.ko.md">한국어</a> ·
  <a href="readme/README.es.md">Español</a> ·
  <a href="readme/README.fr.md">Français</a> ·
  <a href="readme/README.de.md">Deutsch</a> ·
  <a href="readme/README.pt.md">Português</a> ·
  <a href="readme/README.vi.md">Tiếng Việt</a> ·
  <a href="readme/README.id.md">Bahasa Indonesia</a> ·
  <a href="readme/README.ru.md">Русский</a> ·
  <a href="readme/README.hi.md">हिन्दी</a>
</p>

---

# Clew

Build from source. Run with any LLM. Own every line.

## What you get that you won't find elsewhere

**A peer-to-peer LAN mesh for your agents.** Most coding agents live on one machine. Clew Code discovers every machine on your LAN — desktops, laptops, build servers — and delegates work across them. Same-machine instances find each other through a shared file registry; cross-machine discovery runs on UDP multicast. 14 AI tools let your agent manage peers autonomously: discover, assign, run, coordinate. You're not the orchestrator anymore.

**An agent that learns how you work.** Every time you accept or reject an edit, Clew Code's Taste engine records it. Over time, a symbolic rule engine, neural scorer, and contextual bandit optimizer surface the patterns that actually matter — and inject them into every prompt. No more repeating the same correction in CLAUDE.md files that sit stale for months. Preferences auto-tighten, decay when unused, and get suggested back when they become relevant again.

**A cron scheduler that runs your agent on a clock.** Nightly checks, recurring maintenance, scheduled reports — `/loop` keeps your agent running 24/7 with a task queue and health checks. The 5-field cron scheduler handles jitter, lock-based dedup across sessions, and aged-out task cleanup. You don't need a shell script wrapper or a separate CI cron.

**Remote access without SSH gymnastics.** Behind NAT, on a phone, at a coffee shop — Clew Code's bridge and relay system tunnels WebSocket-based remote control through a self-hosted relay server. Permission prompts forward to your client. It feels local.

**Multi-agent swarm with a supervisor.** Split work across agents, let the supervisor handle coordination, approvals, and live status. Parallel work runs in parallel — not as a queue of sequential prompts.

**A plugin marketplace inside your terminal.** Browse, install, and manage plugins without leaving the CLI. Multi-scope support (user, project, local), dependency resolution, install counts. No scavenger hunt required.

**A research pipeline that does the digging.** Plan → collect → extract → report — one end-to-end flow across web search, scraping, and browser automation. No 15-tab bingo.


---

## Install

```bash
npm install -g clew-code
```

Run inside a project:

```bash
clew
```

> Requires Bun to be installed.

**Build from source:**

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd ClewCode
bun install && bun run build && bun run start
```

**Requirements:** Bun 1.3+, Node.js 18+, Git, one provider API key (or Ollama locally).

---

## Features

| Feature | Description |
|---|---|
| **Multi-provider** | Anthropic, OpenAI, Gemini, OpenRouter, Ollama, NVIDIA, DeepSeek, Copilot, any OpenAI-compatible endpoint. Switch via `/model`. |
| **Coding tools** | File read/edit/write, shell exec, LSP, MCP, `Glob`, `Grep`, `WebSearch`, `WebFetch`, browser automation. |
| **Code review** | `/code-review --fix`, `/simplify`, `/pr create/list/view/review/merge`. |
| **Agents** | Background runtime with supervisor, multi-step workflows, approvals, live footer status. |
| **Peer-to-peer** | LAN discovery (UDP multicast), task delegation, role-based naming, 14 AI tools for autonomous coordination. |
| **Taste** | Preference-learning from accept/reject signals. Rules inject into every prompt. 4 AI tools for rule management. |
| **Daemon & loop** | 24/7 autonomous mode (`/loop`), task queue, auto-scheduling, health checks. |
| **Plugins & hooks** | Pre/post tool hooks, dynamic skills (`.claude/skills/`), marketplace. |
| **Bridge & relay** | WebSocket remote control, relay server for cross-network access. |
| **Research** | Local-first multi-source research pipeline: plan → collect → extract → report. |
| **Permission modes** | Default, Auto, Plan, YOLO levels — granular tool execution control. |
| **Sessions** | Save, resume, compact, rewind — full conversation lifecycle. |
| **Compact** | KiloCompact: log snipping, failed-state consolidation, semantic pruning. |

---

## Provider setup

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

---

## Commands

<details>
<summary><strong>17 commands</strong></summary>

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

Type `/` to browse all commands.

---

## Taste

Learns from accept, reject, edit, test, and lint signals. Combines symbolic rules, semantic scoring, and contextual bandit optimization. Confidence decays on a 30-day half-life.

<details>
<summary><strong>Commands</strong></summary>

```
/taste                 Open menu
/taste learn <rule>    Add a rule manually
/taste forget <id>     Remove a rule
/taste profile         All current rules
/taste suggest         Auto-detected patterns
/taste init            Analyze codebase to generate initial rules
/taste eval            Self-evaluation
/taste export / import
/taste on / off
```

**AI tools:** `taste_learn`, `taste_forget`, `taste_profile`, `taste_suggest`

</details>

See [docs/taste.html](docs/taste.html).

---

## Peer-to-Peer

LAN peer discovery via UDP multicast. Discover workers, assign tasks, set roles, and coordinate autonomously.

<details>
<summary><strong>Commands</strong></summary>

```
/peer                  Open interactive menu
/peer share            Start advertising as worker
/peer share stop       Stop advertising
/peer discover         Scan LAN for peers
/peer join <port>      Connect to a peer
/peer list             Show connected peers
/peer todo <peer> <t>  Assign a task
/peer todos            View received tasks
/peer todo done <id>   Mark task complete
/peer name <name>      Set display name
/peer role <role>      Set role (builder, tester, etc.)
/peer inbox            View pending messages
/peer spawn [opts]     Spawn a new peer terminal
/peer help             Show all commands
```

**AI tools (14):** `peer_discover`, `peer_join`, `peer_send_task`, `peer_send_message`, `peer_run`, `peer_broadcast`, `peer_ping`, `peer_disconnect`, `peer_list_tasks`, `peer_list_roles`, `peer_list_messages`, `peer_set_name`, `peer_set_role`, `peer_share`

</details>

See [docs/features/peer.html](docs/features/peer.html).

---

## Scheduled tasks

```
/task
Name:     Server Check
Schedule: Daily at 20:00
Prompt:   Verify the status of local servers
Storage:  Durable
```

Durable tasks persist to `.claude/scheduled_tasks.json`. Session-only tasks disappear when the session ends. Recurring tasks use 5-field cron.

---

## Development

```bash
bun run dev          # live reload
bun run build        # build to dist/
bun test
bun x tsc --noEmit
bun run check:ci

DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

**Windows:**
```powershell
Remove-Item -Recurse -Force node_modules
bun install && bun run dev
```

---

## Project layout

<details>
<summary><strong>src/ tree</strong></summary>

```
src/
├── main.tsx              # entry point
├── query.ts / QueryEngine.ts
├── agentRuntime/         # background agent orchestration
├── commands/             # slash command implementations
├── tools/                # built-in tools
├── services/
│   ├── ai/               # provider manager and adapters
│   ├── mcp/              # MCP clients
│   ├── plugins/          # plugin hooks
│   ├── lsp/              # LSP integration
│   ├── Supervisor/       # agent supervisor
│   └── SessionMemory/
├── peer/                 # LAN peer discovery
├── coordinator/          # multi-agent coordinator
├── bridge/               # WebSocket bridge
└── vim/                  # vim navigation mode
```

</details>

---

## Docs

[Installation](docs/installation.html) · [Configuration](docs/configuration.html) · [Providers](docs/providers.html) · [Commands](docs/commands.html) · [Tools](docs/tools.html) · [Plugins](docs/plugins.html) · [Skills](docs/skills.html) · [Architecture](docs/architecture.html) · [Peer-to-Peer](docs/features/peer.html) · [Bridge Mode](docs/features/bridge-mode.html) · [Taste](docs/taste.html) · [Troubleshooting](docs/troubleshooting.html)

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), and [LICENSE.md](LICENSE.md) before submitting anything.

Don't submit proprietary code, leaked material, or credentials. Report security issues privately per [SECURITY.md](SECURITY.md) — not as public issues.

---

## Changelog

<details>
<summary><strong>0.2.4 — 2026-06-08</strong></summary>

- **Peer-to-peer** — UDP multicast peer discovery, file registry, `/peer share/discover/join/list/todo/name/role`. Interactive PeerMenu. 14 AI coordination tools. Inbound tasks auto-enqueue into AI prompt.
- **Taste tools** — `taste_learn`, `taste_forget`, `taste_profile`, `taste_suggest`
- **Autonomous agents** — agent loop, supervisor integration, task queue, Loop Lock
- **Workflow Rainbow** — per-character gradient for "workflow" keyword

</details>

<details>
<summary><strong>0.2.3 — 2026-06-07</strong></summary>

- `/effort` now works with any provider exposing `reasoningEffort` (NVIDIA, DeepSeek, OpenRouter, etc.)
- `/model` fetches live model list from NVIDIA API
- Taste auto-learns patterns from accept/reject signals; `/taste suggest` to review, `/taste init` to bootstrap from codebase
- Relay server for cross-network remote control (`/remote listen --relay`)
- Guardian: LLM permission reviewer with circuit breaker and `/approve` override
- Bridge v2: provider-agnostic remote control and REPL bridging
- `/pr create/list/view/review/merge/status`
- Security: PowerShell execution rules, malformed tool call guard, 100 MB bash output cap
- Bug fixes: blank screen on startup, autocomplete duplication, provider base URL resolution

</details>

[Full changelog](CHANGELOG.md)

---

## License

[LICENSE.md](LICENSE.md) — covers only contributor-authored modifications and original additions. Does not grant rights to third-party software, models, or trademarks.
