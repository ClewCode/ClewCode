# Troubleshooting Claude Code

Common issues and solutions.

## Installation Issues

### "Bun not found" or "npm not recognized"

Install Bun:
```bash
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

Ensure it's in PATH:
```bash
bun --version
```

### Dependencies fail to install

```bash
# Clear cache and retry
bun install --no-cache

# Or delete node_modules and bun.lock, then reinstall
rm -rf node_modules bun.lockb
bun install
```

### Build fails with "module not found"

Check that all dependencies are installed. Some shared modules require building:
```bash
bun run build
```

## Runtime Issues

### "Provider not configured" or "Missing API Key"

Set your Anthropic API key environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Check it's set:
```bash
echo $ANTHROPIC_API_KEY
```

On Windows PowerShell:
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-..."
```

Or persist in shell profile:
- Bash/Zsh: `~/.bashrc`, `~/.zshrc`
- Fish: `~/.config/fish/config.fish`
- PowerShell: `$PROFILE`

Or configure interactively:
```
/config
```

Note: While the configuration system supports multiple providers (OpenAI, Google, etc.), the current runtime only supports Anthropic Claude models.

### "Model not available" or "Invalid model"

List available models:
```
/model --list
```

Some models require access (e.g., Claude 3 Opus waitlist). Use `/provider` to switch providers and `/model` to select a compatible model.

### "Permission denied" when running tools

Tools require approval the first time. Accept prompts or enable auto-mode:
```
/permissions auto
```

WARNING: Auto-mode allows unrestricted shell access.

### "Command not found" or "Unknown command"

You might be in a mode that doesn't support that command. Press `Ctrl+C` to return to main prompt. Check current mode indicator in UI.

### Slow performance / high latency

Causes:
- Cold start (first query loads models)
- Large context (many files loaded)
- Network issues

Solutions:
- Wait a moment for models to load
- Clear context: `/context clear`
- Reduce max tokens or use faster model
- Check internet connection

### "Rate limit exceeded" or "429 error"

Your provider's quota exceeded. Wait or:
- Upgrade your provider plan
- Reduce query frequency
- Switch to a different provider (`/provider`)
- Use a faster/cheaper model

### Terminal displays garbage or formatting broken

- Ensure terminal supports UTF-8 and 256 colors
- Set `TERM=xterm-256color` on Linux/Mac
- On Windows, use Windows Terminal (not legacy cmd)
- If using SSH, ensure `TERM` is set correctly

### Ctrl+C doesn't exit / hangs

Some operations (tool executions) may block SIGINT. Force quit:
- `Ctrl+\\` (SIGQUIT) in some terminals
- Close terminal window
- `kill` from another terminal

### "Out of memory" crash

Large context or codebase can exhaust memory:
- Reduce files in context (`/forget <file>`)
- Close other applications
- Use `--max-context` flag to limit context size

### Authentication prompts loop

- Ensure API key is valid (test with `curl`)
- Some keys require billing setup
- Check for typos (copy-paste carefully)

## Platform-Specific Issues

### Windows

**Problem**: `'bun' is not recognized`
**Solution**: Install via PowerShell script above. May need to restart shell.

**Problem**: `EMBER_DEBUG` errors with Git
**Solution**: Ensure Git is in PATH. Use Git Bash or WSL for best compatibility.

**Problem**: PowerShell profile errors
**Solution**: Temporarily run from plain `cmd.exe` to isolate.

### macOS

**Problem**: "Operation not permitted" with keychain
**Solution**: Claude Code uses Keychain for secrets. Allow access in Keychain Access app.

**Problem**: Permissions on executable files
**Solution**:
```bash
chmod +x dist/main.js
```

### Linux

**Problem**: Missing `libc` or GLIBC version
**Solution**: Ensure system is up-to-date. Use glibc 2.28+.

**Problem**: Sandbox errors (Bubblewrap, Firejail)
**Solution**: Install required sandbox tools or run without sandbox: `--unsandboxed`

## Configuration Issues

### Settings don't persist

Claude Code stores config in:
- `~/.config/claude/` (Linux/Mac)
- `%APPDATA%/claude/` (Windows)

Ensure directory is writable:
```bash
# Linux/Mac
mkdir -p ~/.config/claude
chmod 700 ~/.config/claude
```

### Environment variables not loading

Shell profile files:
- Bash: `~/.bashrc` or `~/.bash_profile`
- Zsh: `~/.zshrc`
- Fish: `~/.config/fish/config.fish`
- PowerShell: `$PROFILE`

Reload:
```bash
source ~/.bashrc  # or appropriate file
```

### Incorrect editor opened

Set `EDITOR` environment variable:
```bash
export EDITOR="code"     # VS Code
export EDITOR="vim"      # Vim
export EDITOR="nano"     # Nano
```

## Web Interface Issues

### Web build fails

If building `web/` separately:
```bash
cd web
bun install
bun run build
```

Ensure shared modules are linked correctly (symlink or monorepo tool).

### Web cannot connect to API

CORS may block. API routes use Next.js API Routes (same origin). If custom server, add CORS headers.

## Debug Mode

Enable verbose logging:
```bash
# Set log level
export CLAUDE_CODE_LOG_LEVEL=debug

# Or use flag
--debug
```

Logs written to:
- `~/.claude/logs/` (or configured dir)

View live logs:
```bash
tail -f ~/.claude/logs/$(date +%Y-%m-%d).log
```

## Still Stuck?

1. Check existing GitHub issues: https://github.com/your-org/claude-code/issues
2. Search with keywords (error message, provider name)
3. Create a new issue with:
   - OS and version
   - Node/Bun version
   - Claude Code version (`--version`)
   - Full error message
   - Steps to reproduce

## Common Error Messages

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `ENOENT: no such file` | Missing file/directory | Check paths, run from project root |
| `EAI_AGAIN` | DNS/network error | Check internet, try again |
| `401 Unauthorized` | Invalid API key | Verify key, check env var |
| `429 Too Many Requests` | Rate limit | Wait, upgrade plan |
| `ECONNREFUSED` | Service unreachable | Check network, server status |
| `EPERM` | Permission denied | Run with proper permissions |
| `MODEL_NOT_FOUND` | Invalid model name | Use `/model` to list available |

---

Still need help? Open an issue or ask on Discord!
