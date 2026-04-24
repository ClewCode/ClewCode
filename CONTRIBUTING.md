# Contributing to Claude Code

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **Bun** >= 1.0.0 (recommended) or npm
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/claude-code.git
cd claude-code

# Install dependencies
bun install

# Build the project
bun run build

# Run the CLI
bun run src/main.tsx
```

## Project Structure

```
claude-code/
├── src/                    # Core CLI application (Ink/React)
│   ├── cli/               # CLI setup and handlers
│   ├── commands/          # CLI commands
│   ├── services/          # Business logic, API integrations
│   ├── tools/             # Tools/functions the AI can use
│   ├── utils/             # Utilities and helpers
│   └── main.tsx           # Entry point
├── tools/                 # Development utilities
├── web/                   # Next.js web interface (separate package)
└── dist/                  # Built output (gitignored)
```

## Development Workflow

### 1. Make Changes

- Follow the existing code style (TypeScript, React for CLI)
- Add tests for new features or bug fixes
- Update documentation as needed

### 2. Type Checking

```bash
# Run TypeScript compiler
npx tsc --noEmit
```

### 3. Linting

(Project uses ESLint - add specific commands if configured)

### 4. Testing

```bash
# Run tests
bun test
```

### 5. Build Verification

```bash
# Build the CLI
bun run build

# Test the built output
node dist/main.js --help
```

## Adding a New CLI Command

1. Create file in `src/commands/<command-name>/index.ts`
2. Export command definition with CommanderJS
3. Register in `src/commands.js` if global, or specific command loader
4. Add any tool/utility dependencies as needed

Example:
```typescript
import { Command } from '@commander-js/extra-typings';
export const command = new Command('mycommand')
  .description('Does something useful')
  .action(async (options) => {
    // implementation
  });
```

## Adding a New Tool (for AI to use)

1. Extend `Tool` base class in `src/tools/Tool.ts`
2. Implement `execute` and `inputSchema` methods
3. Register in `src/tools.js` exports
4. Add permissions/sandbox rules if needed

## Adding a New AI Provider

To add support for a new AI provider:

1. **Add provider metadata** in `src/commands/provider-select/provider-select.ts`
   - `envKey`
   - `baseUrl`
   - `modelsUrl`
   - `defaultModel`
   - provider note

2. **Add runtime routing** in `src/services/api/claude.ts`
   - OpenAI-compatible providers should be added to the adapter allowlist and `OPENAI_COMPATIBLE_PROVIDER_DEFAULTS`
   - Providers with mixed endpoints need explicit per-model routing instead of blind `/chat/completions`
   - The default path should remain provider-neutral; Anthropic is only used when explicitly selected

3. **Patch built output** in `dist/main.js` until the build pipeline is available locally.

4. **Verify**:
   - `/provider list`
   - `/provider models <provider>`
   - `/provider key <provider> <api-key> set <provider> <model>`
   - `node --check dist/main.js`

5. **Write tests** for the new provider integration when the test harness is available.

6. **Update documentation**:
   - `docs/USAGE.md` — API key setup, provider usage
   - `docs/API.md` — Provider interface reference
   - `docs/ARCHITECTURE.md` — Architecture diagram if needed

## Code Style

- **TypeScript** strict mode where possible
- **Imports:** Use relative paths within src/
- **Formatting:** Prettier is recommended (run `bunx prettier --write .`)
- **Comments:** JSDoc for public functions and classes
- **Error handling**: Use `logError` from utils/log.js for consistent error reporting

## Commit Messages

Follow conventional commits:
```
feat: add support for Claude 3.5 Sonnet model
fix: resolve crash when API key is missing
chore: update dependencies
docs: improve installation instructions
```

## Reporting Bugs

Before filing a bug, check existing issues. Include:
- OS and Node/Bun version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (`--debug` flag helps)

## Questions?

Open an issue or discussion. We're happy to help!
