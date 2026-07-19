# Learnings

## [LRN-20260719-001] correction

**Logged**: 2026-07-19T16:30:00+07:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
Emitting compact progress events was insufficient because the REPL visibility predicate explicitly hid the spinner while compacting.

### Details
The first fix added the missing session-memory `compact_start` and `compact_end` events, but runtime verification showed no UI. `onCompactProgress` correctly set `isCompacting`, while `showSpinner` ended with `!isCompacting`; the render predicate therefore suppressed the component carrying the compact message and progress bar.

### Suggested Action
When debugging event-driven UI, verify both the state transition and the final render predicate before declaring the behavior fixed.

### Metadata
- Source: user_feedback
- Related Files: src/screens/REPL.tsx, src/commands/compact/compact.ts
- Tags: compact, spinner, render-predicate

### Resolution
- **Resolved**: 2026-07-19T16:30:00+07:00
- **Notes**: Made `isCompacting` enable spinner visibility and override streaming-text suppression.

---
