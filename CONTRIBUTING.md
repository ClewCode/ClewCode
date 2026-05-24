# Contributing to Claude Code

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **Bun** >= 1.0.0 (required)
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/JonusNattapong/claudecode.git
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
├── src/                      # Core CLI application (Ink/React)
│   ├── main.tsx              # Application entry point
│   ├── cli/                  # CLI handlers (auth, plugins, MCP, transports)
│   ├── commands/             # CLI commands (provider, model, config, etc.)
│   ├── services/             # Business logic, API integrations
│   │   ├── ai/               # AI provider system
│   │   │   ├── providers/    # Provider implementations (Anthropic, OpenAI, Google, etc.)
│   │   │   ├── ProviderManager.ts
│   │   │   └── providerRegistry.ts
│   │   ├── api/              # API clients and message handling
│   │   ├── oauth/            # OAuth authentication flows
│   │   ├── mcp/              # Model Context Protocol client
│   │   ├── lsp/              # Language Server Protocol
│   │   └── ...
│   ├── components/           # Ink React UI components
│   ├── tools/                # Tools/functions the AI can use
│   └── types/                # TypeScript type definitions
├── plugins/                  # Bundled plugin packages
├── .claude/                  # Local CLI commands (gitignored)
├── .claude-plugin/           # Plugin marketplace manifest
├── shared/                   # Shared utilities (if monorepo)
└── dist/                     # Built output (gitignored)
```

## Development Workflow

### 1. Make Changes

- Follow the existing code style (TypeScript, React for CLI with Ink)
- Add tests for new features or bug fixes
- Update documentation as needed

### 2. Type Checking

```bash
# Run TypeScript compiler
npx tsc --noEmit
```

### 3. Linting

(Project uses ESLint — specific commands configured in package.json)

### 4. Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test path/to/test.ts

# Run with pattern
bun test --pattern "pattern"
```

### 5. Build Verification

```bash
# Build the CLI
bun run build

# Test the built output
node dist/main.js --help
```

## Adding a New CLI Command

1. Create file in `src/commands/<name>/index.tsx` (or `.ts` for non-React commands)
2. Export a React component or CommanderJS command definition
3. Register in `src/commands/index.ts` or appropriate command loader
4. Add help text and documentation

Example (React-based Ink command):
```typescript
import * as React from 'react'
import { Box, Text } from '../../ink.js'

export default function MyCommand({ onDone }: { onDone: (value: string) => void }) {
  return (
    <Box>
      <Text>My command output</Text>
    </Box>
  )
}
```

## Adding a New Tool (for AI to use)

1. Create tool class in `src/tools/<ToolName>/index.ts`
2. Extend the `Tool` base class
3. Implement `inputSchema` (Zod) and `execute` methods
4. Register in `src/tools/index.ts`
5. Add permission flags if sandboxed

Example:
```typescript
import { Tool } from '../Tool.js'
import { z } from 'zod'

export class MyTool extends Tool {
  inputSchema = z.object({
    param: z.string()
  })

  async execute({ param }: { param: string }) {
    // implementation
  }
}
```

## Adding a New AI Provider

The provider system lives in `src/services/ai/`.

1. **Implement ProviderInterface** in `src/services/ai/providers/<ProviderName>Provider.ts`:
   - `streamMessages()` — streaming chat
   - `stopGeneration()` — cancellation
   - `countTokens()` — token estimation

2. **Register in `providerRegistry.ts`**:
   - Add entry to `PROVIDER_REGISTRY` with metadata (env key, base URL, models, capabilities)

3. **Use OpenAI-compatible approach** when possible: extend `OpenAICompatibleProvider` for OpenAI-format APIs.

4. **Verify**:
   ```bash
   claude --provider-select  # provider appears
   /provider list            # models load
   /provider models <name>   # model list works
   ```

5. **Write tests** for the new provider integration.

6. **Update documentation**:
   - `docs/USAGE.md` — API key setup, provider usage
   - `README.md` — provider list

## Code Style

- **TypeScript** strict mode
- **Imports**: Use bare import specifiers (`'../../utils/...'`) within `src/`
- **Formatting**: Prettier is recommended (`bunx prettier --write .`)
- **Comments**: JSDoc for public functions and classes
- **Error handling**: Use `logError()` from `utils/log.js` for consistent error reporting
- **React/Ink components**: Functional components with hooks

## Commit Messages

Follow conventional commits:
```
feat: add support for Gemini 2.5 Flash model
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
