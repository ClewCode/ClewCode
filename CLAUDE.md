# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**For full architectural details, see [AGENT.md](AGENT.md).**

## 📝 Keep Docs in Sync (always)

**Whenever you fix, add, remove, or change anything, update the relevant docs in the SAME change** — do not defer it. This includes:
- `CLAUDE.md` / `AGENT.md` — architecture, commands, patterns, conventions
- `PLAN.md` — progress/status of ongoing work
- `CHANGELOG.md`, `README.md`, and any skill `SKILL.md` affected

If a code change makes a doc statement stale (a count, a file path, a command, a rule), fix the doc too. Treat "code changed but docs didn't" as an incomplete task.

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

# Tests (via Bun)
bun test                # Full suite
bun test --bail         # Stop on first failure
bun test path/to/file.test.ts          # Single file
bun test -t "test name"                # By name

# Full pre-push gate (do before git push)
bun run check:ci && bun x tsc --noEmit && bun test --bail
```

## Memory System — Semantic Search with sqlite-vec

**Latest:** Memory semantic search now uses persistent SQLite vector indexing (sqlite-vec) for O(log N) retrieval instead of linear file-based scanning.

### Semantic Index (`src/memdir/semanticIndex.ts`)
- Persistent `~/.clew/memory/vectors.db`; vec0 virtual table (KNN via `MATCH`) + `vector_embeddings` metadata table
- Extension loaded via `sqlite-vec` npm package (`sqliteVec.load(db)`); falls back to JS brute-force cosine if it fails
- vec0 returns L2 distance; embeddings are normalized, so cosine = 1 − L2²/2
- Change detection: `needsIndexing()` compares file mtime vs `indexed_at` (no file read); `content_hash` skips re-embedding unchanged content
- `sqlite-vec` is `--external` in the build (native .dll resolved at runtime)

### Memory Search (`src/memdir/semanticSearch.ts`)
- `searchMemories()` runs `syncIndex()` before every query (concurrent with query embedding): new/changed memories get embedded, deleted ones drop out — the index is self-healing, no manual reindex needed
- Automatic recall (`findRelevantMemories.ts`) uses this path first, LLM selection as fallback
- Legacy `.embedding.json` caches are reused during sync (no re-embed) — `migrateLegacyEmbeddings()` syncs then deletes them

### Commands
- `/memory-search "query"` — Find memories by semantic similarity (cross-lingual)
- `/index-admin stats` — View index health and memory stats
- `/index-admin prune 90` — Remove vectors older than N days
- `/index-admin clear --confirm` — Clear all vectors (destructive)

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

- **Model switching**: `/model <name>` mid-session. Provider system normalizes errors/usage across 32 providers.
- **Memory**: Persistent (Dream/Distill), session-scoped, auto-compaction with memory extraction.
- **Context collapse**: Automatic detection via `src/services/contextCollapse/`.

## See Also

- **Full architecture**: [AGENT.md](AGENT.md)
- **Release**: [AGENT.md § Release](AGENT.md#release)
- **Tools inventory**: [AGENT.md § Tools / commands / services](AGENT.md#tools--commands--services)
