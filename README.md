<p align="center">
  <img src="assets/claude-logo-long.png" alt="Claude Code" width="480" />
</p>

<p align="center">
  <a href="https://github.com/ClaudeCore/claudecode/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-purple.svg" alt="License" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-blue?logo=bun&logoColor=white" alt="Bun Runtime" /></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/language-TypeScript-blue?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/ui-Ink%20React-ff69b4?logo=react&logoColor=white" alt="Ink React" /></a>
</p>

<p align="center">
  <strong>Languages:</strong>
  <a href="README.md"><strong>English</strong></a> ·
  <a href="readme/README.zh.md">中文 (简体)</a> ·
  <a href="readme/README.th.md">ไทย</a>
</p>

---

# 🔮 Claude Code

Claude Code is an independent, research-oriented **reverse-engineered rebuild and extension** of Anthropic's [Claude Code](https://claude.ai/code) CLI. It provides a fully **runnable, buildable, and debuggable** terminal workflow compiled directly from source—liberating your terminal from closed binaries and locked proprietary environments.

We supercharge the terminal experience by combining the elegant developer UX of the upstream model with multi-provider routing, dynamic theme controls, advanced permission structures, and custom developer tools.

> [!IMPORTANT]
> **Disclaimer:** This repository is not affiliated with, endorsed by, or sponsored by Anthropic PBC. The upstream Claude Code product is proprietary; this project reconstructs, refactors, and extends behavior for research, educational, and self-hosted use. Please review [LICENSE.md](LICENSE.md) before redistributing or deploying.

---

## 🎨 What Makes Us Different: Exclusive Features

This rebuild is packed with powerful features you won't find in the upstream proprietary client:

### 1. 🌈 Dynamic Theme Customization & Purple Aesthetic
Say goodbye to static, hardcoded color schemes. We have redesigned the terminal experience:
* **Electric Purple Theme:** Upgraded from the static peach/orange theme to a breathtaking, premium modern purple (`autoAccept` HSL color space) by default.
* **マスッコト & UI Integration:** Custom colors apply dynamically across the entire CLI—including the **Clawd mascot**, welcome banner, dividers, and status indicators.
* **Dynamic `/color` Control:** Use the `/color <color>` command to change terminal highlights instantly. Change your border color, status logs, and prompt box to match your exact mood or terminal setup on the fly!

### 2. ⚡ Universal `Shift+Tab` Auto-Permission Cycle
Tired of answering prompt confirmation dialogues? 
* We have **completely unlocked and democratized Auto Mode**!
* By removing restrictive upstream feature gates (`TRANSCRIPT_CLASSIFIER`) and persistent caching barriers, `auto` mode is now universally available for all builds.
* Cycle seamlessly through permissions (`normal` ➡️ `notify` ➡️ `auto`) at any point using the standard `Shift+Tab` interactive carousel.

### 3. 🔍 Polished Multi-Provider Model Names
* Enjoy pristine terminal headers. We fixed the double provider prefix bug (e.g. rendering "DeepSeek: deepseek-v4-flash" with redundant provider names).
* Your active model is displayed cleanly, elegantly, and correctly, whether you are querying Claude, DeepSeek, Gemini, or custom local setups.

---

## 🚀 Key Capabilities

* **Multi-Provider AI Routing:** Run on Anthropic, OpenAI, Google Gemini, DeepSeek, OpenRouter, Ollama, GitHub Copilot, and any OpenAI-compatible custom endpoints.
* **Runtime Switching:** Swap models instantly with `/model <provider>/<model-name>`.
* **Deep Codebase Tools:** Full tool suite for reading, writing, regex searching, multi-file editing, shell execution, LSP analysis, web browsing, and MCP server connectivity.
* **24/7 Autonomous Daemon:** Persistent background agent queues, auto-heals, locks, lease checks, and retry mechanics to run tasks safely overnight.
* **Scheduled Tasks (`/task`):** Elegant interactive task creators. Setup cron jobs, delayed one-shots, and persistent routines saved cleanly to `.claude/scheduled_tasks.json`.
* **Bridge & Session Memory:** Seamless remote collaboration bridges and durable agent memory sessions to preserve context across invocations.

---

## 📦 Quick Start

### Global Installation

Using **npm**:
```bash
npm install -g claudecode
```

Using **Bun** (Recommended):
```bash
bun install -g claudecode
```

Once installed, boot the agent inside any project directory:
```bash
claude
```

---

### Run and Develop from Source

For developers who want to patch, inspect, or customize the runtime locally:

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/ClaudeCore/claudecode.git
   cd claudecode
   ```

2. **Install Dependencies:**
   ```bash
   bun install
   ```

3. **Run in Watch / Dev Mode:**
   ```bash
   bun run dev
   ```

4. **Build the Production Bundle:**
   ```bash
   bun run build
   bun run start
   ```

---

## 🔑 AI Provider Configuration

Set one or more provider keys in your environment (or inside a local `.env` file):

```bash
# Set your chosen API keys
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
export GOOGLE_API_KEY="AIzaSy..."
export DEEPSEEK_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."

# For local models
export OLLAMA_HOST="http://localhost:11434"
```

Inside the active terminal session, switch providers dynamically:
```text
/model list                     # View all active and available models
/model deepseek/deepseek-chat   # Switch to DeepSeek
/model google/gemini-2.5-pro    # Switch to Google Gemini
/model openai/gpt-4o            # Switch to OpenAI GPT-4o
```

---

## 🛠️ CLI Interactive Slash Commands

Type `/` within the terminal shell to access the suite of built-in diagnostics and features:

| Command | Action |
| --- | --- |
| `/model` | Configure, switch, or inspect available LLM models & providers |
| `/color` | Customize UI colors dynamically (e.g. `/color purple`, `/color green`) |
| `/status` | Check model provider, session health, tokens, and active workspace metrics |
| `/context` | Deep-dive into active context window token utilization |
| `/compact` | Perform a smart compaction of the conversation memory |
| `/mcp` | List, link, configure, and inspect connected Model Context Protocol servers |
| `/plugin` | Toggle, configure, and load terminal lifecycle plugin hooks |
| `/daemon` | Launch the 24/7 Autonomous Agent task-queue control panel dashboard |
| `/task` | Open the interactive cron-like scheduled tasks wizard |
| `/doctor` | Run diagnostic suite on CLI dependencies, environments, and network nodes |
| `/bridge` | Enable bridge mode to pair-program remotely or connect IDE interfaces |

---

## 🗓️ Scheduled & Cron Tasks

Launch the interactive scheduler wizard by typing `/task` to create jobs without writing complex cron patterns:

> [!TIP]
> The scheduler automatically handles cron math behind the scenes!

* **Daily:** Schedule a prompt to run every day at a specific time (e.g. `Daily at 09:00` generates `0 9 * * *`).
* **Weekdays:** Keep tasks aligned with your work week (e.g. Weekdays at 17:00 generates `0 17 * * 1-5`).
* **Delay / One-Shot:** Run a single-shot reminder after a custom delay (e.g., `In 10 minutes` to commit current progress).
* **Durable vs. Session Storage:** Decide whether a task should persist to disk (`.claude/scheduled_tasks.json`) or remain active only for the current shell runtime.

---

## 🏗️ Project Architecture & Layout

Our modular architecture isolates the user interface from core AI adapters and orchestration services:

```text
src/
├── main.tsx              # CLI bootstrapper & global React Ink runtime loop
├── QueryEngine.ts        # Orchestration layer for token streaming and reasoning loops
├── agentRuntime/         # Agent orchestration, persistent run store, and tools gateway
├── commands/             # Slash command implementations (e.g., /model, /color, /daemon)
├── components/           # Terminal UI visual elements (Welcome banners, inputs, status logs)
├── cli/                  # CLI input handlers and shell controllers
├── services/
│   ├── ai/               # Provider manager, unified adapters, and model registry
│   ├── autonomous/       # Background daemon task runner & persistent queue manager
│   ├── mcp/              # Model Context Protocol integration and JSON-RPC transport
│   ├── plugins/          # Extension points, prompt filters, and system hook lifecycle
│   ├── tools/            # Unified code manipulation and terminal execution engine
│   └── SessionMemory/    # Long-term session storage and vector-like conversation recall
└── skills/               # Dynamic declarative capability loader (.claude/skills/*)
```

---

## 💻 Developer Command Suite

We provide native engineering utilities for rapid debugging, profiling, and testing:

```bash
bun run dev              # Build and run with hot-reload file watching
bun run start            # Execute the compiled CLI binary
bun run build            # Compile production-ready build to dist/
bun test                 # Run the test suites
bun x tsc --noEmit       # Execute typescript check
bun run lint:check       # Run Biome/Linter checkers
bun run format:check     # Check code formatting consistency
```

### Advanced Codebase Utilities:
* **Preloader (`bun run preload <module>`)**: Preload specific module contexts to prime the LLM context.
* **Session Manager (`bun run session <cmd>`)**: Snapshot, inspect, or restore terminal sessions.
* **AST Search (`bun run ast-grep`)**: Query and rewrite files utilizing concrete syntax trees.
* **Dependency Visualizer (`bun run codegraph`)**: Map out module dependencies and visualize relationships.

---

## 🖥️ Platform Notes

### Windows Development
For smooth Windows installations, ensure a native terminal environment is configured:
```powershell
# Reset node modules if dependencies conflict
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```
*Note: A custom Windows-optimized `ripgrep` binary is precompiled and vendor-embedded at `src/utils/vendor/ripgrep/x64-win32/rg.exe` for lightning-fast search performance.*

---

## 🤝 Contributing

We welcome contributions, bug reports, and design feedback! Please review our [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) files before submitting pull requests.

To ensure your code meets standard styling and types:
```bash
bun test
bun run lint:check
bun x tsc --noEmit
```

---

## 📜 License & Release Notes

* **License:** Refer to [LICENSE.md](LICENSE.md) for details.
* **Changelog:** Refer to [CHANGELOG.md](CHANGELOG.md) to explore recent feature updates and patch details.
