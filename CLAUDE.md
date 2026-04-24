# Claude Code Agent Instructions

## Purpose
This file gives AI coding agents the context needed to contribute correctly to this repository.

## Key project facts
- This is a Bun-based TypeScript/React CLI app called **Claude Code**.
- The app is a terminal-first AI assistant with a web interface option.
- The main entrypoint is `src/main.tsx`.
- `shared/` contains cross-cutting provider and AI integration code.
- `dist/` is generated build output and should not be edited directly.

## Build and test commands
Use Bun for development and verification:
- `bun install`
- `bun run src/main.tsx` — run in development mode
- `bun run build` — build output to `dist/`
- `bun test` — run tests

If you need type checking, use:
- `npx tsc --noEmit`

## Important directories
- `src/` — primary source code for the CLI app and core runtime
- `src/commands/` — command definitions and CLI behavior
- `src/tools/` — tool implementations the AI can use
- `shared/services/ai/` — provider abstractions and AI integrations
- `web/` — web interface code (separate frontend path)
- `docs/` — design, usage, and architecture documentation

## Provider and configuration conventions
- Supports multiple AI providers: Anthropic, OpenAI, Google, and others.
- Common environment variables:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`
- Provider selection is exposed via CLI flags such as `--provider` and `--model`.

## Agent guidance
- Prefer modifying source files under `src/` or `shared/`.
- Do not edit the generated `dist/` directory.
- Avoid adding or changing `node_modules/`.
- When adding features, also add or update tests.
- Keep code style consistent with existing TypeScript and React patterns.

## What to link instead of duplicate
- Use `README.md` for high-level usage and developer setup.
- Use `CONTRIBUTING.md` for contribution workflow and conventions.
- Use `docs/ARCHITECTURE.md` for architecture guidance.

## When working on commands and tools
- New CLI commands should generally be added under `src/commands/` and registered through the main command loader.
- Tool implementations belong in `src/tools/` and must expose input validation, execution logic, and registration.
- If a change affects provider behavior, inspect `shared/services/ai/` first.

## Notes for AI agents
- This repo is not a typical `create-react-app` or full-stack monorepo; focus on the CLI code paths.
- Don’t assume a separate package manager workflow beyond Bun.
- Validate changes by running the relevant Bun scripts when possible.
