# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**For full architectural details, see [AGENT.md](AGENT.md).**

## 📝 Keep Docs in Sync (always)

**Whenever you fix, add, remove, or change anything, update the relevant docs in the SAME change** — do not defer it. This includes:
- `CLAUDE.md` / `AGENT.md` — architecture, commands, patterns, conventions
- `PLAN.md` — progress/status of ongoing work (e.g. shadow reconciliation counts)
- `CHANGELOG.md`, `README.md`, and any skill `SKILL.md` affected

If a code change makes a doc statement stale (a count, a file path, a command, a rule), fix the doc too. Treat "code changed but docs didn't" as an incomplete task.

## ✅ `.js` Shadow Reconciliation Complete

**All 401 `.js` shadow files have been removed.** The JS→TS migration is now complete — there are zero `.ts`/`.js` shadow pairs in `src/`. The `/js-shadow-sync` skill has been removed.

- PR #60 reconciled the first wave; the remaining 401 were reconciled in 4 commits (2026-07-08).
- Bun's `.js`→`.ts` fallback resolved cleanly — all pairs were verified: exported symbols matched (no runtime bugs hidden), and the `.ts` was canonical in every case.
- If you see a `.js` file in `src/`, it is **not** a shadow — it's a genuine JS source module (no `.ts` twin exists).

**Shadow Guard:** A pre-commit hook (`bash scripts/check-shadow-pairs.sh src`) and CI job run automatically to prevent regression. If a `.ts`/`.js` pair is detected, commit/push will fail.

## Commands

```bash
# Development
bun run dev              # Live reload REPL (with feature flags)
bun run dev:channels    # Dev with development channels (server:clew-orc)

# Build & verification
bun run build           # Production build to dist/
bun run start           # Run compiled build from dist/
bun run check:ci        # Biome lint + format check (no autofix)
bun run lint            # Biome lint with autofix
bun run check           # Lint + format with autofix

# Tests (via Vitest)
bun test                # Full suite
bun test --bail         # Stop on first failure
npx vitest run path/to/file.test.ts    # Single file
npx vitest run -t "test name"          # By name

# Full pre-push gate (do before git push)
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

See [AGENT.md § Build / Test / Lint](AGENT.md#build--test--lint-bun-only) for details and feature flags.

## Architecture Overview

See [AGENT.md](AGENT.md) for the full architecture (entry & REPL, query loop & providers, tools, and services).

## Key Patterns

### Before Pushing
- Run `/clew-verify` (includes shadow guard, static gate, smoke test).
- Or manually: `bash scripts/check-shadow-pairs.sh src && bun run check:ci && bun x tsc --noEmit && bun test --bail`
- Do NOT assume green tests = working feature (Ink TUI state not visible to tests).
- Pre-commit hook runs shadow guard automatically (configured in `.husky/pre-commit`).

### Cross-Repo Collaboration
- Use `/workspace link` to pair projects. Links are bidirectional and auto-load on return to either repo.
- Linked dirs show in `/permissions` with a `🔗 linked` badge.

## Performance Notes

- **Model switching**: `/model <name>` mid-session. Provider system normalizes errors/usage across 29 providers.
- **Memory**: Persistent (Dream/Distill), session-scoped, auto-compaction with memory extraction.
- **Context collapse**: Automatic detection via `src/services/contextCollapse/`.

## See Also

- **Full architecture**: [AGENT.md](AGENT.md)
- **Release**: [AGENT.md § Release](AGENT.md#release)
- **Tools inventory**: [AGENT.md § Tools / commands / services](AGENT.md#tools--commands--services)
