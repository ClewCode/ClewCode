# Claude Code CLI Usage Guide

Claude Code is a powerful AI coding assistant that runs in your terminal. This guide covers all the commands and features.

## Quick Start

```bash
# Run the CLI
bun run src/main.tsx

# Or after building
bun run build
node dist/main.js

# Set your API key first
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Configuration

### Setting API Keys

Claude Code uses Anthropic's Claude models. Set your API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or configure interactively:
```
/config
```

### Selecting Models

```bash
/model claude-3-5-sonnet-20241022
```

List available models:
```
/model --list
```

Note: While the configuration system includes support for multiple providers (OpenAI, Google Gemini, etc.), the current runtime only supports Anthropic Claude models. All API requests are sent to Anthropic's API.

Or configure interactively:
```
/config
```

### Selecting Provider

```bash
# Switch AI provider
claude --provider openai
claude --provider anthropic
claude --provider gemini
```

### Selecting Models

```
/model gpt-4.1-mini
```

List available models:
```
/model --list
```

### Selecting Provider

```bash
# List and select provider interactively
claude --provider-select

# Or use CLI flag
claude --provider openai --model gpt-4.1-mini
```

## Core Commands

### Chat / Prompt
```
.p             # Send message to AI
```

Just type your question or request at the prompt. Claude Code has full context of your codebase.

### File Operations

```
/files              # List files in current directory
/r                  # Read a file
/w <file>           # Write content to file
/edit <file>        # Open file in editor
/glob <pattern>     # Search files by pattern
```

### Git Integration

```
/git diff           # Show git diff
/git status         # Show git status
/git log            # Show commit history
/git branch         # List branches
/commit             # Create a commit with AI-generated message
```

### Search & Edit

```
/grep <pattern>     # Search file contents
/replace <old> <new> # Replace text in files
```

### Tool Usage

Claude Code can use tools automatically. Some tools require approval:

- `Bash` — Execute shell commands
- `Glob` — Find files
- `Grep` — Search file contents
- `Read` — Read file contents
- `Write` — Write to files
- `Edit` — Edit files
- `MultiEdit` — Edit multiple files
- `Git` — Git operations
- `WebSearch` — Search the web
- `WebFetch` — Fetch URLs
- `Task` — Create sub-agents for parallel work

Configure permissions with `/permissions`.

### Session Management

```
/session save <name>      # Save current session
/session list             # List saved sessions
/session load <name>      # Load a session
/session delete <name>    # Delete a session
/clear                    # Clear conversation
```

### Context Management

Add files/directories to context:

```
/add <path>              # Add file/directory to context
/context                 # Show current context
/context clear           # Clear all context
```

### Cost & Usage

```
/cost                    # Show current session cost
/cost --reset            # Reset cost counter
```

## Settings

```
/settings                # Open settings dialog (if using TUI)
/config                  # Show current config
```

Key settings:
- `maxTokens` — Maximum response tokens
- `temperature` — Creativity (0-1)
- `effort` — Thinking effort (low/medium/high)
- `safePrompts` — Enable safety filters

## Advanced Features

### Task / Sub-agent Mode

Break complex work into parallel tasks:
```
/task build authentication system
/task refactor payment module
```

### Agent System

Create custom agents with specialized knowledge:
```
/agent create <name> --prompt "You are a..."
/agent list
/agent use <name>
```

### MCP Servers

Connect external data sources and tools:

```
/mcp list          # List available MCP servers
/mcp add <url>     # Add MCP server
/mcp enable        # Enable all project MCP servers
```

### Teleport / Remote Sessions

Collaborate with teammates:
```
/teleport invite <email>   # Invite user
/teleport join <session>   # Join remote session
```

## Keyboard Shortcuts

- `Ctrl+C` — Exit/abort
- `Ctrl+R` — Reverse search history
- `↑/↓` — Navigate history
- `Tab` — Autocomplete commands

## Tips & Best Practices

1. **Be specific** — Clear prompts yield better results
2. **Add context** — Use `/add` to include relevant files
3. **Use sessions** — Save work with `/session save`
4. **Check cost** — Monitor with `/cost`
5. **Review changes** — Always review code before committing
6. **Break tasks** — Use `/task` for complex multi-step work

## Troubleshooting

### "Provider not configured"
Use `/provider` to select a provider and ensure the corresponding API key is set (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`).

### "Model not available"
Run `/model --list` to see available models for the current provider. Some models require access or are provider-specific.

### Tool failures
Check `/permissions` to ensure tools are allowed.

### High latency
Enable streaming mode in settings for faster perceived response.

### Rate limits
Check your provider quota. Use `/provider` to switch to a different provider if needed.

## Getting Help

```
/help               # Show help
/help <command>     # Show command-specific help
```

Or join our community:
- GitHub Issues: https://github.com/your-org/claude-code/issues
- Discord: [link]

---

Happy coding with Claude Code! 🚀
