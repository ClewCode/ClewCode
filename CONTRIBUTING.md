# Contributing

Thank you for your interest in contributing.

This repository is an unofficial, community-maintained rebuild and extension project. It is not an official Anthropic product, distribution, or supported implementation.

Please read `LICENSE.md` and `SECURITY.md` before contributing.

## Scope of Contributions

Contributions should be limited to material you have the right to submit and license.

Do not contribute:

* Proprietary source code
* Leaked or copied code
* Private documentation
* Credentials, API keys, tokens, or secrets
* Material copied from Anthropic's proprietary products or private services
* Code that violates third-party licenses or terms

Contributor-authored modifications and original additions may be licensed under the terms described in `LICENSE.md`.

## Getting Started

### Prerequisites

* Node.js >= 18.0.0
* Bun >= 1.0.0
* Git

### Installation

```bash
git clone https://github.com/ClewCode/ClewCode.git
cd claudecode

bun install
bun run build
bun run start
```

For development with watch mode:

```bash
bun run dev
```

## Project Structure

```text
claudecode/
├── src/                      # Core CLI application
│   ├── main.tsx              # Application entry point
│   ├── cli/                  # CLI handlers
│   ├── commands/             # CLI commands
│   ├── services/             # Business logic and integrations
│   │   ├── ai/               # AI provider system
│   │   │   ├── providers/    # Provider implementations
│   │   │   ├── ProviderManager.ts
│   │   │   └── providerRegistry.ts
│   │   ├── api/              # API clients and message handling
│   │   ├── oauth/            # OAuth authentication flows
│   │   ├── mcp/              # Model Context Protocol client
│   │   ├── lsp/              # Language Server Protocol integration
│   │   └── ...
│   ├── components/           # Ink React UI components
│   ├── tools/                # Tools available to the agent runtime
│   └── types/                # TypeScript type definitions
├── plugins/                  # Bundled plugin packages
├── docs/                     # Documentation
├── bin/                      # CLI entry wrappers
├── dist/                     # Built output
├── .claude-plugin/           # Plugin marketplace manifest (legacy name, kept for compatibility)
├── package.json
└── README.md
```

## Development Workflow

### 1. Make Changes

* Follow the existing TypeScript style.
* Keep changes focused and reviewable.
* Add or update tests when changing behavior.
* Update documentation when changing commands, configuration, providers, or user-facing behavior.

### 2. Type Checking

```bash
npx tsc --noEmit
```

### 3. Linting and Formatting

This project uses Biome.

```bash
bun run lint:check
bun run format:check
```

To apply fixes:

```bash
bun run check
```

Or run individual fix commands:

```bash
bun run lint
bun run format
```

### 4. Testing

```bash
bun test
```

Run a specific test file:

```bash
bun test path/to/test.ts
```

### 5. Build Verification

```bash
bun run build
```

After building, verify the CLI output:

```bash
node dist/main.js --help
```

If using the package binary locally, verify:

```bash
bun link
clew --help
```

## Adding a New CLI Command

1. Create a command under `src/commands/<name>/`.
2. Use `.tsx` for Ink-based interactive commands.
3. Use `.ts` for non-interactive command logic.
4. Register the command in the appropriate command loader.
5. Add help text and documentation.
6. Add tests when practical.

Example Ink command:

```tsx
import * as React from 'react'
import { Box, Text } from '../../ink.js'

type Props = {
  onDone: (value: string) => void
}

export default function MyCommand({ onDone }: Props) {
  return (
    <Box>
      <Text>My command output</Text>
    </Box>
  )
}
```

## Adding a New Tool

Tools live under `src/tools/`.

1. Create a tool implementation in `src/tools/<ToolName>/index.ts`.
2. Extend the existing tool base class or follow the current project tool pattern.
3. Define an input schema.
4. Implement execution behavior.
5. Register the tool in the tool registry.
6. Add permission handling if the tool reads files, writes files, runs commands, or accesses external services.
7. Add tests for success and failure cases.

Example:

```ts
import { z } from 'zod'
import { Tool } from '../Tool.js'

export class MyTool extends Tool {
  inputSchema = z.object({
    param: z.string(),
  })

  async execute({ param }: { param: string }) {
    return {
      ok: true,
      value: param,
    }
  }
}
```

## Adding a New AI Provider

The provider system lives in `src/services/ai/`.

1. Implement the provider under `src/services/ai/providers/<ProviderName>Provider.ts`.
2. Implement the required provider interface methods:

   * `streamMessages()`
   * `stopGeneration()`
   * `countTokens()`
3. Use the OpenAI-compatible provider base when the target API supports OpenAI-style chat completions.
4. Register the provider in `providerRegistry.ts`.
5. Add provider metadata:

   * Provider name
   * Environment variable names
   * Base URL
   * Supported models
   * Capabilities
6. Add tests for model listing, request formatting, streaming behavior, and error handling.
7. Update documentation in `docs/` and `README.md`.

Manual verification:

```bash
clew --provider-select
```

Inside the CLI, verify provider commands such as:

```text
/provider list
/provider models <provider-name>
```

## Plugin, MCP, and Tool Safety

Changes that affect plugins, MCP servers, hooks, command execution, file access, or sandbox behavior require extra review.

Before submitting those changes, check:

* Permission prompts cannot be bypassed.
* User-controlled input is not passed directly into shell commands.
* File paths are normalized and constrained.
* Secrets are not logged.
* Tool output does not expose credentials.
* Remote content cannot silently execute local code.
* Defaults are conservative.

## Code Style

* Use TypeScript.
* Prefer explicit types for exported functions and public interfaces.
* Keep React/Ink components functional.
* Use project-local utilities for logging and error handling.
* Avoid adding large dependencies without justification.
* Keep user-facing error messages clear and actionable.
* Do not include secrets, tokens, local absolute paths, or private environment details in tests or fixtures.

## Commit Messages

Use conventional commits:

```text
feat: add provider selection command
fix: prevent crash when API key is missing
docs: update installation steps
chore: update dependencies
test: add provider registry tests
```

## Pull Request Checklist

Before opening a pull request:

* [ ] The change is focused and reviewable.
* [ ] Tests pass with `bun test`.
* [ ] Formatting and lint checks pass.
* [ ] The project builds with `bun run build`.
* [ ] Documentation has been updated if needed.
* [ ] No secrets, credentials, copied proprietary code, or private files are included.
* [ ] Security-sensitive changes include a clear explanation of risk and mitigation.

## Reporting Bugs

Before filing a bug, search existing issues.

Include:

* Operating system
* Node.js version
* Bun version
* Package version or commit hash
* Steps to reproduce
* Expected behavior
* Actual behavior
* Relevant logs
* Whether plugins, hooks, MCP servers, or custom providers were enabled

Do not include API keys, tokens, private prompts, private repository content, or credentials in public issues.

## Security Issues

Do not open public issues for security vulnerabilities.

Follow the private reporting process in `SECURITY.md`.

## Questions and Discussions

Use GitHub Discussions or issues for general questions, proposals, and design discussions.

For security-sensitive topics, use the private vulnerability reporting process instead.