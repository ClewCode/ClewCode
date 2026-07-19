# Feature Requests

## [FEAT-20260719-001] session_memory_compaction_progress

**Logged**: 2026-07-19T16:00:00+07:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Requested Capability
Show the standard `Compacting conversation…` spinner, elapsed time, and progress bar during manual session-memory compaction.

### User Context
The `/compact` command otherwise appears idle because the line below the command is blank while this path runs.

### Complexity Estimate
simple

### Suggested Implementation
Emit the existing compact progress lifecycle around `trySessionMemoryCompaction()` and clear it in a `finally` block.

### Metadata
- Frequency: first_time
- Related Features: manual_compaction

### Resolution
- **Resolved**: 2026-07-19T16:00:00+07:00
- **Notes**: Reused the REPL's existing compact progress events for the session-memory path.

---
