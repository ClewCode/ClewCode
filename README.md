# Claude Code

A research fork of Anthropic's Claude Code CLI.

## About

This project studies how Claude Code works — its architecture, design decisions, and implementation. We built this to understand multi-provider AI routing, plugin systems, permission models, and terminal UI design.

> **Not affiliated with Anthropic.** Not a replacement. A learning project.

We believe that understanding how great tools work makes us better developers. By studying Claude Code, we've learned about building AI-powered developer tools — a skill that will only become more valuable.

---

## Quick Start

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Start a session
bun run src/main.tsx session

# Or use development mode (with hot reload)
bun run dev
```

### Setting Up API Keys

At least one provider API key is required:

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google Gemini
export GOOGLE_GENERATIVE_API_KEY=...

# OpenRouter
export OPENROUTER_API_KEY=sk-or-...

# Ollama (local)
export OLLAMA_HOST=http://localhost:11434
```

---

## Key Differences from Original Claude Code

| Feature | Claude Code | This Fork |
|---------|-------------|-----------|
| **AI Providers** | Anthropic only | 11 providers |
| **YOLO Modes** | Basic (4 tiers) | 5 tiers (+ YoloGod) |
| **ChatGPT OAuth** | Not supported | Supported |
| **Documentation** | Markdown files | HTML website |
| **Focus** | Production use | Learning & research |

### YoloGod Mode

YoloGod is the highest level of permission bypass. In this mode:

- All safety checks are bypassed
- Claude makes decisions without asking
- Web searches happen automatically
- Tool execution proceeds without prompts

**Use with caution.** This mode is designed for fully autonomous operation where human intervention is not expected.

---

## Features

### 11 AI Providers

Claude Code supports 11 different AI providers through a unified provider adapter system:

1. **Anthropic** (default)
   - claude-sonnet-4-20250514
   - claude-opus-4-5-20250514
   - claude-3-5-sonnet-20241022
   - claude-3-haiku-20240307

2. **OpenAI**
   - gpt-4o, gpt-4o-mini
   - gpt-4-turbo, gpt-3.5-turbo

3. **Google Gemini**
   - gemini-2.0-flash-exp
   - gemini-1.5-pro, gemini-1.5-flash

4. **OpenRouter**
   - 100+ models including:
   - anthropic/claude-3-5-sonnet
   - openai/gpt-4o
   - google/gemini-pro
   - meta/llama-3.1-70b
   - mistral/mistral-large

5. **Ollama** (Local)
   - llama3, llama3.1
   - mistral, codellama
   - phi3, qwen2

6. **xAI Grok**
   - grok-2, grok-2-vision

7. **Mistral**
   - mistral-large-latest
   - codestral-latest

8. **OpenAI Compatible**
   - Connect to any OpenAI-compatible API
   - LM Studio, local APIs, custom endpoints

9. **ChatGPT OAuth**
   - Use existing ChatGPT Plus/Pro subscription
   - Authenticate via browser session token

10. **Copilot**
    - GitHub Copilot integration

11. **KiloCode**
    - Specialized provider for specific tasks

### 90+ Commands

Claude Code provides over 90 slash commands:

**File Operations**
- `/read` — Read file contents
- `/write` — Create or overwrite file
- `/edit` — Edit specific part of file
- `/glob` — Find files by pattern
- `/grep` — Search file contents
- `/add-dir` — Add directory to project
- `/path` — Show file path
- `/rename` — Rename files
- `/files` — File browser
- `/tag` — Tag files

**Git Operations**
- `/git` — Run git commands
- `/branch` — List/create branches
- `/diff` — Show changes
- `/commit` — Create git commit
- `/enter` — Enter worktree
- `/exit` — Exit worktree

**Development**
- `/test` — Run tests
- `/build` — Build project
- `/npm` — Run npm commands
- `/agent` — Create subagent
- `/agents` — Manage agents
- `/resume` — Resume agent
- `/tasks` — List background tasks
- `/capabilities` — Show capabilities

**Search & Web**
- `/search` — Web search (DuckDuckGo/Brave)
- `/fetch` — Fetch URL content
- `/ls` — List directory
- `/find` — Find files
- `/mcp` — MCP server management

**AI & Model**
- `/model` — Switch model
- `/provider` — Switch provider
- `/cost` — Show API cost
- `/usage` — Show token usage
- `/extra-usage` — Detailed usage breakdown

**Permissions**
- `/yolo` — Open YOLO mode picker
- `/yolo-lite` — Auto-approve read-only
- `/yolo` — Auto-approve most
- `/yolo-max` — Full auto including destructive
- `/yolo-god` — Complete autonomy
- `/permissions` — Permission settings
- `/plan` — Enter plan mode

**Session**
- `/session` — New session
- `/clear` — Clear conversation
- `/context` — View context usage
- `/compact` — Compact context
- `/rewind` — Rewind conversation
- `/resume` — Resume previous session
- `/export` — Export conversation
- `/memory` — Memory management

**Settings**
- `/config` — Edit settings
- `/theme` — Change theme
- `/color` — Change color
- `/keybindings` — View keybindings
- `/hooks` — Manage hooks
- `/mcp` — MCP configuration
- `/privacy` — Privacy settings

**Collaboration**
- `/bridge` — Start bridge mode
- `/remote-env` — Remote environment
- `/remote-setup` — Remote setup
- `/sticker` — Send stickers
- `/btw` — Send message

**Utility**
- `/help` — Show help
- `/stats` — Show usage stats
- `/status` — Show internal state
- `/doctor` — Run diagnostics
- `/skill` — Load skill
- `/skills` — List skills
- `/ide` — Open in IDE

### 40+ Tools

Built-in tools for various operations:

**File Tools**
- Read — Read file contents
- Edit — Edit specific part of file
- Write — Create or overwrite file
- Glob — Find files by pattern
- Grep — Search file contents
- NotebookEdit — Edit Jupyter notebooks

**Shell Tools**
- Bash — Run shell commands (Unix)
- PowerShell — Run PowerShell commands (Windows)
- Tungsten — Claude Code shell wrapper

**Web Tools**
- WebSearch — Search the web
- WebFetch — Fetch URL content
- Browser — Browser automation

**Development Tools**
- Agent — Create and manage subagents
- LSP — Language server protocol operations
- MCP — Model Context Protocol tools
- Config — Edit configuration

**Git Tools**
- EnterWorktree — Enter git worktree
- ExitWorktree — Exit git worktree

**Planning Tools**
- EnterPlanMode — Enter plan mode
- ExitPlanMode — Exit plan mode

**Utility Tools**
- AskUser — Ask user for input
- JsonPath — Query JSON data
- Brief — File upload/attachments
- ComputerUse — Computer use automation
- CodeIndex — Code indexing for search

### 12+ Plugins

Extensible plugin system:

- **plugin-dev** — Plugin development toolkit
- **feature-dev** — Feature development workflow
- **code-review** — Automated code review
- **hookify** — Git hooks integration
- **commit-commands** — Enhanced git commits
- **frontend-design** — UI/UX assistance
- **pr-review-toolkit** — PR review automation
- **agent-sdk-dev** — Agent SDK development
- **learning-output-style** — Learning output
- **explanatory-output-style** — Detailed explanations
- **claude-opus-4-5-migration** — Migration guide
- **ralph-wiggum** — Debug mode

### YOLO Permission Modes

| Mode | Description |
|------|-------------|
| Default | Ask before tool execution |
| Auto | Auto-approve safe tools |
| yoloLite | Auto-approve read-only (Glob, Grep, Read) |
| yolo | Auto-approve most tools |
| yoloMax | Full auto including destructive operations |
| yoloGod | Complete autonomy + automatic web search |

---

## Architecture

```
src/
├── commands/           # 90+ slash commands
│   ├── agent/          # Subagent commands
│   ├── git/            # Git operations
│   ├── model/          # Model switching
│   ├── mcp/            # MCP server management
│   └── ...
├── services/ai/        # AI Provider Layer
│   ├── providers/      # 11 provider adapters
│   │   ├── AnthropicProvider.ts
│   │   ├── OpenAIProvider.ts
│   │   ├── GoogleProvider.ts
│   │   ├── OpenRouterProvider.ts
│   │   ├── OllamaProvider.ts
│   │   ├── xAIProvider.ts
│   │   ├── MistralProvider.ts
│   │   ├── OpenAICompatibleProvider.ts
│   │   ├── ChatGPTSessionProvider.ts
│   │   ├── CopilotProvider.ts
│   │   └── KiloCodeProvider.ts
│   ├── ProviderManager.ts
│   └── providerRegistry.ts
├── tools/              # 40+ built-in tools
│   ├── AgentTool/      # Subagent execution
│   ├── BashTool/       # Shell commands
│   ├── WebSearchTool/  # Web search
│   ├── WebFetchTool/   # URL fetching
│   ├── FileEditTool/   # File editing
│   └── ...
├── plugins/            # Plugin system
├── skills/             # Skill system
├── components/         # React UI components
└── utils/              # Utilities

docs/                   # HTML documentation
plugins/                # Community plugins
```

### Provider Adapter Pattern

Each provider implements a common interface, enabling seamless switching:

```typescript
interface Provider {
  streamMsg(messages: Message[], options: StreamOptions): AsyncIterable<any>
  nonStreamingMsg(messages: Message[], options: NonStreamOptions): Promise<any>
  getModels(): Promise<Model[]>
  getToolResultSchema(): JSONSchema
}
```

---

## Documentation

Full HTML documentation available at [docs/](docs/):

| Page | Description |
|------|-------------|
| [Installation](docs/installation.html) | Setup guide |
| [Quick Start](docs/quick-start.html) | 5-minute start guide |
| [Configuration](docs/configuration.html) | Settings reference |
| [Commands](docs/commands.html) | All 90+ commands |
| [Tools](docs/tools.html) | All 40+ tools |
| [Providers](docs/providers.html) | All 11 providers |
| [Agents](docs/agents.html) | Subagent system |
| [Plugins](docs/plugins.html) | Plugin directory |
| [Skills](docs/skills.html) | Skill reference |
| [Permissions](docs/permissions.html) | YOLO modes explained |
| [FAQ](docs/faq.html) | Common questions |
| [Troubleshooting](docs/troubleshooting.html) | Problem solving |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| UI | React 19 + Ink 6 |
| AI SDK | Vercel AI SDK |
| Validation | Zod 3, Valibot |
| CLI | Commander.js |

---

## Development

```bash
# Start development mode (with hot reload)
bun run dev

# Build for production
bun run build

# Run all tests
bun test

# TypeScript check
bun x tsc --noEmit
```

---

## What We Learned

This project provided hands-on experience with:

1. **Multi-Provider AI Routing**
   - How to abstract different AI APIs behind a unified interface
   - Request routing and failover strategies
   - Model discovery and caching

2. **Provider Adapter Pattern**
   - Implementing consistent interfaces across different services
   - Handling provider-specific quirks and limitations
   - Token counting and cost management

3. **Plugin System Design**
   - Creating extensible architecture
   - Hook points and event systems
   - Skill-based instruction sets

4. **Permission Models**
   - Balancing safety with usability
   - Progressive permission bypass
   - Security consideration in AI tools

5. **Terminal UI Development**
   - Building CLI tools with React/Ink
   - Real-time updates and progress indicators
   - Keyboard navigation and shortcuts

6. **Agent Orchestration**
   - Subagent lifecycle management
   - Background task handling
   - Inter-agent communication

---

## Contributing

This is a learning project. Contributions are welcome:

1. Fork the repository
2. Make your changes
3. Submit a pull request

Please ensure code is properly typed and tested.

---

## License

See [LICENSE.md](LICENSE.md)

---

## Disclaimer

This is not Claude Code. This is our attempt to understand Claude Code by studying its implementation.

This project comes from an npm disclosure and may have legal implications. Use at your own risk.

---

**Built with curiosity, not competition.**

[GitHub](https://github.com/anomalyco/claude-code) • [Docs](docs/)