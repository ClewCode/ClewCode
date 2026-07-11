# Semantic Index Enhancement: sqlite-vec Integration

**Date:** 2026-07-12  
**Status:** ✅ Complete and tested

## Summary

Migrated memory semantic search from file-based `.embedding.json` caching to a persistent SQLite database with sqlite-vec vector indexing. This enables O(log N) approximate nearest neighbor (ANN) search instead of O(N) linear scan.

## What Changed

### New Files
- `src/memdir/semanticIndex.ts` — Core vector index with sqlite-vec extension
  - Database schema: `vector_embeddings` table with 768-dim embedding vectors
  - Operations: `indexMemory()`, `searchVectors()`, `pruneOldVectors()`, `clearAllVectors()`
  - Fallback: JavaScript cosine similarity if sqlite-vec unavailable

### Modified Files
- `src/memdir/semanticSearch.ts` — Updated to use indexed vectors
  - Fast path: `searchVectors()` for O(log N) retrieval
  - Fallback: `_legacyLinearSearch()` for recovery if index fails
  - Migration: `migrateLegacyEmbeddings()` converts file cache to DB
  - Deprecated: `.embedding.json` files still supported but replaced on next index

- `src/commands/memory/index.ts` — Registered indexAdmin command
  - Export `indexAdmin` command for index management

- `src/commands/memory/indexAdmin.tsx` — New admin UI component
  - `/index-admin stats` — Show index statistics
  - `/index-admin prune 90` — Remove vectors older than N days
  - `/index-admin clear --confirm` — Clear all vectors

- `src/commands.ts` — Added indexAdmin to command registry
  - Import and add to COMMANDS array

- `src/memdir/semanticSearch.test.ts` — Enhanced test coverage
  - Tests for embedding serialization/deserialization
  - Tests for normalized vector similarity

- `CLAUDE.md` — Documented the enhancement
  - Memory system overview
  - Command references

### Dependencies
- `sqlite-vec@0.1.9` — Vector extension for SQLite (already in Bun)

## Technical Details

### Storage
- Location: `~/.clew/memory/vectors.db`
- Schema: Single `vector_embeddings` table with indexed columns
- Embedding size: 768 dimensions (Granite multilingual model)
- Storage format: BLOB (Float32Array serialized)

### Performance
- **Before:** Linear scan, re-compute cosine similarity for every search (slow on large corpora)
- **After:** O(log N) vector search via sqlite-vec ANN index, reuse cached embeddings

### Robustness
- Content hash tracking: Automatic invalidation when files change
- Fallback mode: Graceful degradation to JS-based similarity if extension unavailable
- Migration: Existing `.embedding.json` files consumed on first index operation
- Backward compatible: `.embedding.json` cache still supported during transition

## Testing

✅ **Unit tests** (`src/memdir/semanticSearch.test.ts`)
- Cosine similarity calculations
- Embedding serialization/deserialization
- Normalized vector operations

✅ **Integration**
- Build: `bun run build` → 5207 modules (no errors)
- Command registration: `indexAdmin` added to COMMANDS array
- Type checking: Full TypeScript compilation passes

## Usage

### Semantic Search (unchanged for end-users)
```
/memory-search "your query"
```
Returns top-K most similar memories by embedding distance. Works cross-linguistically.

### Index Administration (new)
```
/index-admin stats              # View index health
/index-admin prune 90           # Clean up old vectors (>90 days)
/index-admin clear --confirm    # Reset index (dangerous!)
```

## Migration Path

1. **On first run after deploy:** Existing `.embedding.json` files are consumed and migrated to DB automatically
2. **Backward compat:** Legacy files still work but are replaced on next index update
3. **Cleanup:** Optional: `bun run` → `/index-admin` → `migrateLegacyEmbeddings()` to force migration

## Known Limitations

1. **sqlite-vec availability:** If the extension fails to load (rare on Bun), system falls back to JavaScript similarity. Performance is degraded but functional.
2. **Content hash staleness:** If a memory file is modified externally (not via the CLI), the index won't detect it until next search or manual prune.

## Future Improvements

- Batch indexing for bulk memory imports
- Adaptive chunk size based on corpus size
- Quantized embeddings for further size reduction
- Support for multiple embedding models (configurable)

## References

- [SQLite-vec documentation](https://github.com/asg017/sqlite-vec)
- [Granite embedding model](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2)
- Memory system: `src/memdir/`
- Commands: `src/commands/memory/`
