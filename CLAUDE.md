# CLAUDE.md

This file gives AI coding agents the minimum context needed to work safely and effectively in this repository.

## Repository Purpose

This repository is a research-oriented fork of Anthropic's Claude Code CLI. It keeps the original terminal-first coding-agent workflow while adding:

- unified multi-provider model routing
- provider-specific adapters
- built-in tools and slash commands
- plugin and skill systems
- MCP, LSP, bridge, supervisor, and session infrastructure

The project should be treated as a large TypeScript/Bun CLI application with a React/Ink terminal UI and a provider-agnostic AI execution layer.

> This is an independent research and development project. Do not imply affiliation, endorsement, or sponsorship by Anthropic unless the repository explicitly says so elsewhere.

## Working Principles for Agents

### Default Behavior

- Make surgical changes. Touch only the files needed for the requested task.
- Prefer simple fixes over new abstractions.
- Preserve existing APIs, command names, config names, and file layout unless the task explicitly requires changing them.
- Keep user-facing terminal output concise and consistent with the existing UI style.
- Do not rename providers, tools, slash commands, environment variables, or config files without checking all call sites.
- Do not edit generated build output in `dist/` as the source of truth.
- Do not remove compatibility code only because it looks unused; this repo supports multiple providers, platforms, commands, and runtime modes.

### Before Editing

1. Identify the affected layer: UI, command, provider, adapter, query loop, tool execution, plugin, skill, config, or infrastructure.
2. Search for existing patterns before adding a new implementation.
3. Check related tests near the changed files.
4. For provider/tool/query changes, inspect normalization, streaming, error handling, and usage accounting paths.
5. For command changes, verify registration in `src/commands.ts` or the relevant command registry.

### Before Editing — Context Preloader

Before editing a module, preload its context:

```bash
bun run preload bridge          # bridge/
bun run preload query           # query.ts
bun run preload commands        # commands/
bun run preload services/ai     # services/ai/
bun run preload src/bridge      # also works with src/ prefix
```

The script generates context at `.claude/context/<module>.md`:
- All files in the module with sizes
- Exports and key types
- Internal dependencies
- Recent git history (10 commits)
- Outstanding TODO/FIXME items

> Then read the context file with the Read tool before editing code.

### After Editing

Run the smallest useful validation first:

```bash
bun x tsc --noEmit
bun test <path>
```

For broader changes, run:

```bash
bun test
bun run build
bun run check     # Biome lint + format + import organize
```

If a test cannot be run in the current environment, state what should be run and why.

## Development Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev mode with watch
bun run start            # Run CLI without watch
bun run build            # Build production bundle into dist/
bun test                 # Run all tests
bun test <path>          # Run a single test file or directory
bun x tsc --noEmit       # TypeScript type check only
bun run check            # Biome lint + format + organize imports (safe fixes)
bun run lint             # Biome lint only (safe fixes)
bun run format           # Biome format only
bun run check:ci         # Biome CI check (no writes, for CI pipelines)
bun run ast-grep -- <args>  # AST-based code search & rewrite (via ast-grep)
bun run preload <module>  # Context Preloader — prepare module context before editing
bun run session <cmd>     # Session Bridge — save/list/restore session context
bun run codeindex <cmd>   # CodeIndex — index/search codebase (fuzzy search)
```

### ast-grep usage (structural code search/rewrite)

```bash
# Search by AST pattern (not regex — understands code structure)
bun run ast-grep run -p 'console.log($_)' src/         # Find all console.log
bun run ast-grep run -p 'try { $$$ } catch($ERR) {}'  # Find empty catch blocks
bun run ast-grep run -p 'function $F($$$) { $$$ }'    # Find all function declarations

# Search by file pattern
bun run ast-grep run -p 'import { $A } from "$B"' --glob '**/*.ts'

# Rewrite (search + replace with AST awareness)
bun run ast-grep run -p '$X.catch($F)' -r 'await $X.catch($F)' src/

# Run rules from config
bun run ast-grep scan
```

### Session Bridge (cross-session context)

```bash
# Save context before closing a session
bun run session save "adding auth middleware to bridge"
bun run session save "refactoring ProviderManager"

# In a new session — see what the last session was doing
bun run session list

# Restore context from the latest session
bun run session restore

# When starting a new session:
# 1. session restore → know where you left off
# 2. codegraph → see the latest codebase structure
# 3. preload <module> → context for the module you're editing
```

### CodeIndex (fuzzy code search)

```bash
# Index the codebase (once, persists to .claude/code-index/)
bun run codeindex index

# Search across all indexed code
bun run codeindex search "bridgeMain"
bun run codeindex search "getSessionId"
bun run codeindex search "handleIngressMessage"

# Show index stats
bun run codeindex stats
```

> Note: the built-in CodeIndexTool requires the CODE_INDEX feature flag (disabled by default).
> `bun run codeindex` bypasses the flag and uses the CodeIndex utility directly.

### Debugging

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

Useful in-session commands:

```text
/status     Show model, provider, context, and internal state
/doctor     Run diagnostics and possible auto-fixes
/context    Show context window usage
/model      Switch provider or model at runtime
/compact    Compress session context
/mcp        Manage MCP servers
/plugin     Manage plugins
/bridge     Configure remote collaboration mode
```

## Architecture Map

```text
Terminal UI
  src/cli/App.tsx
  src/components/
  src/context/
  src/buddy/

Command Layer
  src/commands.ts
  src/commands/
  src/keybindings/
  src/vim/

AI Provider + Adapter Layer
  src/services/ai/ProviderManager.ts
  src/services/ai/providerRegistry.ts
  src/services/ai/providers.json
  src/services/ai/providers/
  src/services/ai/adapter/
  src/services/ai/contentBlockUtils.ts
  src/services/ai/toolCallParser.ts
  src/services/ai/errorNormalizer.ts
  src/services/ai/usageNormalizer.ts

Core Query + Streaming Layer
  src/main.tsx
  src/query.ts
  src/QueryEngine.ts
  src/query/

Tool System
  src/Tool.ts
  src/tools.ts
  src/tools/
  src/services/tools/

Infrastructure
  src/services/mcp/
  src/services/plugins/
  src/services/lsp/
  src/services/Supervisor/
  src/services/SessionLifecycle/
  src/services/SessionMemory/
  src/services/settingsSync/
  src/bridge/
  src/coordinator/
```

## Key Files

| File | Role |
| --- | --- |
| `src/main.tsx` | Main CLI bootstrap, Ink app setup, streaming loop |
| `src/query.ts` | Core query processing, message building, context handling, tool call loop |
| `src/QueryEngine.ts` | Query orchestration, caching, deduplication, rate limiting |
| `src/commands.ts` | Slash command registry |
| `src/tools.ts` | Built-in tool registry |
| `src/Tool.ts` | Base tool types and schemas |
| `src/services/ai/ProviderManager.ts` | Provider selection, API keys, config migration, model resolution |
| `src/services/ai/providerRegistry.ts` | Provider metadata and capability resolution |
| `src/services/ai/providers.json` | Declarative provider config, env keys, models, base URLs, capabilities |
| `src/services/autonomous/taskQueue.ts` | Persistent task queue (file-backed, priorities, leases, dead-letter) |
| `src/services/autonomous/agentLoop.ts` | 24/7 autonomous agent loop (queue → spawn worker → monitor → repeat) |
| `src/services/autonomous/daemonMode.ts` | Daemon entry point for supervisor-managed background process |
| `src/services/autonomous/supervisorIntegration.ts` | Supervisor hooks: auto-start, health checks, auto-respawn |
| `src/services/ai/adapter/AnthropicAdapter.ts` | Anthropic-compatible adapter for non-Anthropic providers |
| `src/services/ai/adapter/GoogleAdapter.ts` | Google/Gemini adapter |
| `src/services/ai/contentBlockUtils.ts` | Content block conversion between provider formats |
| `src/services/ai/toolCallParser.ts` | Tool call normalization across providers |
| `src/services/tools/StreamingToolExecutor.ts` | Streaming tool execution |
| `src/services/tools/toolHooks.ts` | Pre/post tool hooks |
| `src/bridge/bridgeMain.ts` | WebSocket bridge and remote collaboration |
| `src/state/store.ts` | Lightweight observable store |

## Multi-Provider Flow

1. User selects a provider/model through `/model` or provider config.
2. `ProviderManager` resolves provider, API key, model, and config migration.
3. `providerRegistry` loads provider capabilities and model metadata.
4. Non-Anthropic providers are wrapped by the adapter layer.
5. `contentBlockUtils` normalizes content blocks.
6. `toolCallParser` normalizes tool calls.
7. The core query/streaming loop processes the response uniformly.
8. Usage, errors, and tool results are normalized before display or persistence.

When modifying this flow, check all of these areas:

- streaming chunks
- tool call parsing
- content block conversion
- error normalization
- usage accounting
- retry/rate-limit behavior
- provider capability flags
- model discovery and cache behavior

## Tool Execution Flow

1. Model emits one or more `tool_use` blocks.
2. Tool calls are normalized across provider formats.
3. `StreamingToolExecutor` executes tools.
4. Tool hooks run before and after execution.
5. Results are returned as `tool_result` blocks.
6. The query loop continues until completion or stop condition.

When adding or editing a tool:

- define strict schemas
- validate input early
- keep output stable and machine-readable where possible
- avoid hidden side effects
- respect permission and hook behavior
- add or update tests near the tool when possible

## Slash Command Guidelines

Slash commands live under `src/commands/` and are registered through the command registry.

When adding or editing a command:

- keep interactive and non-interactive behavior consistent
- update command registration
- preserve existing aliases
- avoid breaking scripts that call command names directly
- keep terminal UI output short
- add tests for parser or non-interactive logic when available

## Plugin and Skill Guidelines

Plugins are loaded from user and bundled plugin locations. Hook points include:

- `PreToolUse`
- `PostToolUse`
- `PreBash`
- `PostPrompt`
- `PreAcceptEdit`

Skills are progressive capability packages loaded from bundled and project-level locations.

When changing plugin or skill behavior:

- preserve manifest compatibility
- avoid changing hook payload shape without migration
- keep bundled skills independent from local user configuration
- do not assume a plugin is installed unless the code path guarantees it

## Platform and Build Notes

- Runtime: Bun 1.3+
- Language: TypeScript 5.x with ESM / `NodeNext`
- UI: React 19 + Ink 6
- Validation: Zod 3 and Valibot 0.42
- CLI: Commander.js 13
- Code Search: ast-grep (AST-based), ripgrep (in `src/utils/vendor/`)
- Markdown: marked, highlight.js, turndown
- Lint/Format: Biome 2.4 (via `bun run check` / `bun run lint` / `bun run format`)
- Terminal: chalk, ora, ink-spinner, ink-text-input

Important constraints:

- Windows uses bundled ripgrep at `src/utils/vendor/ripgrep/x64-win32/rg.exe`; `Glob` and `Grep` may depend on it.
- `@ant/claude-for-chrome-mcp` is dynamically imported at runtime for Claude-in-Chrome functionality.
- Native TypeScript ports live in `src/native-ts/`.
- Some native or external packages are intentionally externalized during build.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic provider key |
| `OPENAI_API_KEY` | OpenAI provider key |
| `GOOGLE_API_KEY` | Google/Gemini provider key |
| `OPENROUTER_API_KEY` | OpenRouter provider key |
| `DEEPSEEK_API_KEY` | DeepSeek provider key |
| `XAI_API_KEY` | xAI/Grok provider key |
| `MISTRAL_API_KEY` | Mistral provider key |
| `GROQ_API_KEY` | Groq provider key |
| `COPILOT_GITHUB_TOKEN` | GitHub Copilot token |
| `OLLAMA_HOST` | Local Ollama host |
| `DEBUG` | Debug logging, e.g. `1` or `provider:anthropic` |
| `NO_COLOR` / `FORCE_COLOR` | Terminal color control |
| `NODE_OPTIONS` | Node/Bun runtime options |

Provider-specific environment keys should be checked in `src/services/ai/providers.json` before adding new ones.

## Testing Strategy

Tests use Bun's built-in test runner.

Common patterns:

- test files are usually colocated with source
- test names use `*.test.ts`
- targeted tests are preferred during active development
- full tests and build are preferred before finalizing broad changes

Useful commands:

```bash
bun test src/utils/codeIndex/
bun test src/utils/agentSwarmsEnabled.test.ts
bun x tsc --noEmit
bun run build
```

## Change Risk Checklist

Use this checklist before making risky changes.

### Provider or Adapter Changes

- Does streaming still work?
- Are text blocks, tool calls, thinking blocks, and errors normalized?
- Are usage tokens counted correctly?
- Does model discovery still fall back to `providers.json`?
- Are provider capability flags accurate?

### Tool Changes

- Are schemas strict enough?
- Are permission checks preserved?
- Do hooks still fire?
- Are tool results compatible with the query loop?
- Are failures returned as structured errors rather than thrown unexpectedly?

### Command/UI Changes

- Is the command still registered?
- Does it work in both interactive and non-interactive paths if both exist?
- Is terminal output stable and readable?
- Are keybindings or aliases affected?

### Build/Runtime Changes

- Does the change affect Windows, macOS, Linux, or WSL2 differently?
- Does it introduce a native dependency that must be externalized or bundled?
- Does it break Bun ESM / `NodeNext` resolution?
- Does it rely on Node-only behavior unsupported by Bun?

## Do Not Do

- Do not rewrite major architecture unless explicitly requested.
- Do not collapse provider-specific adapters into one generic adapter without proving compatibility.
- Do not bypass `ProviderManager` for provider/model selection.
- Do not bypass tool hooks or permission checks.
- Do not hardcode API keys, user paths, local machine paths, or provider secrets.
- Do not remove Windows-specific vendor/runtime handling without replacement.
- Do not introduce new dependencies unless the benefit is clear and existing utilities are insufficient.
- Do not use README-style marketing language inside this file; keep this file operational for coding agents.

## Preferred Response Format for Coding Agents

When reporting work, use this structure:

```text
Summary
- What changed

Validation
- Commands run and results

Notes
- Risks, skipped checks, or follow-up work
```
