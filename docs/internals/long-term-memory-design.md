# Long-Term Memory System Implementation

## Architecture

```
~/.clew/projects/<project-root>/
├── session-memory.db       ← SQLite (bun:sqlite)
│   ├── sessions            ← session records + consolidation level
│   ├── topic_index         ← tag → session mapping
│   └── digests             ← weekly/monthly summaries
├── memory/                 ← Auto-memory directory (MEMORY.md + topic files)
│   ├── MEMORY.md           ← Entrypoint, loaded into system prompt
│   └── ...                 ← Other markdown memory files
└── sessions/
    └── <sessionId>/
        └── checkpoints/    ← Structured checkpoint files
            ├── index.json  ← Lightweight index
            ├── cycle.txt   ← Current rebuild cycle number
            ├── notes.md    ← Main agent's append-only scratchpad
            ├── 20-<id>.json ← 20% progress checkpoint
            ├── 45-<id>.json ← 45% progress checkpoint
            └── 70-<id>.json ← 70% progress checkpoint (triggers MEMORY.md promotion)
```

### Database Schema

```sql
-- Each session
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  start_time INTEGER, end_time INTEGER,
  model TEXT, provider TEXT,
  summary TEXT,
  key_decisions TEXT,    -- JSON array
  active_files TEXT,     -- JSON array
  tags TEXT,             -- JSON array
  consolidated INTEGER DEFAULT 0  -- 0=raw, 1=weekly, 2=monthly
);

-- Topic → session index
CREATE TABLE topic_index (
  topic TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY(topic, session_id)
);

-- Weekly/monthly digests
CREATE TABLE digests (
  period TEXT NOT NULL,   -- '2026-W24' or '2026-06'
  type TEXT NOT NULL,     -- 'weekly' or 'monthly'
  summary TEXT,
  patterns TEXT,          -- recurring patterns detected
  session_count INTEGER,
  created_at INTEGER,
  PRIMARY KEY(period, type)
);
```

## Consolidation Flow

```
saveSessionSummary()
  → INSERT session (consolidated=0)
  → UPDATE topic_index
  → consolidateIfNeeded()
      → SELECT sessions WHERE consolidated=0 AND end_time < 7d ago
      → GROUP BY ISO week, then by month
      → Generate weekly digest (patterns from tags + decisions)
      → Mark sessions consolidated=1
      → Generate monthly digest from weekly digests
      → Mark sessions consolidated=2
```

## Layered Memory

Inspired by MiMo Code's 4-layer memory design. Each layer has a different lifecycle and persistence:

| Layer | Storage | Lifecycle | Written by |
|-------|---------|-----------|------------|
| Session | `checkpoints/<id>.json` | Per-session, cleared on session end | Checkpoint Writer (inline) |
| Notes | `checkpoints/notes.md` | Per-session, read + cleared at each checkpoint | Main agent (append-only) |
| Project | `memory/MEMORY.md` | Cross-session, persists indefinitely | Checkpoint Promoter (70%), autoDream, manual |
| Global | `MEMORY.md` at config root | Cross-project, persists indefinitely | autoDream, manual |
| History | SQLite (`session-memory.db`) | Permanent, append-only | Session Logger |

### Session Checkpoint

Triggered at 20%/45%/70% of goal's `maxTurns` budget. Written as fire-and-forget (`.catch(noop)`) so it never blocks the main loop.

Fields: goalText, turnCount, elapsedMs, filesModified, commandsRun, decisions, currentBlockers, nextSteps, summary, cycle, notes.

### Notes Scratchpad

`notes.md` is the main agent's **only** persistent write channel. The agent is told about it via system prompt when a goal is active. At each checkpoint, the writer reads notes and routes them into the structured checkpoint fields, then clears the scratchpad.

### Project Memory (MEMORY.md)

At the 70% checkpoint, the Checkpoint Promoter promotes stable information into `MEMORY.md`:
- Repeatedly modified files → "active files"
- Persistent decisions → "architecture decisions"
- Notes → "session notes"

Promotion is fire-and-forget (non-blocking).

### Goal Verifier

When the agent attempts to terminate with an active goal, an independent forked agent reviews the conversation against the goal text. If the goal isn't met, the gap is attached as `goalGap` in the result metadata. The verifier:
- Does **not** participate in actual work (no alignment bias)
- Receives the same context as the agent (actual tool outputs)
- Returns `{ isComplete, gap?, isImpossible? }`
- Failure is non-fatal — normal termination proceeds

## Files

| File | Purpose |
|------|---------|
| `src/services/longTermMemory/crossSession.ts` | Core: save, load, consolidate, topic index |
| `src/services/longTermMemory/timeline.ts` | Timeline queries, density stats, digest format |
| `src/services/longTermMemory/consolidate.ts` | Preview/save consolidation candidates |
| `src/services/longTermMemory/index.ts` | Barrel exports |
| `src/services/checkpoint/checkpointWriter.ts` | Structured checkpoint system + notes scratchpad + cycle tracking |
| `src/services/checkpoint/checkpointPromoter.ts` | Checkpoint → MEMORY.md promotion |
| `src/services/goal/goalVerifier.ts` | Independent goal completion verification |
| `src/services/maxMode/candidateRunner.ts` | Max Mode: parallel candidate selection with LLM judge |
| `src/commands/maxMode/maxMode.tsx` | `/maxmode` command (on/off/candidates N) |

## Checkpoint Flow

```
User turn → query() loop
  ↓
Turn count crosses threshold (20/45/70%)?
  ↓ yes
Extract decisions, commands, files from recent messages
  ↓
Read notes.md + current cycle
  ↓
Fire-and-forget writeCheckpoint() + clearNotes()
  ↓
If threshold === 70%: promoteCheckpoints() → append to MEMORY.md
  ↓
Continue query() loop
```

## Rebuild Cycle

When context window fills, compact runs `tryRebuildFromCheckpoint()`. If a checkpoint exists, it builds a **layered context prompt** instead of a flat summary:

```
Goal + Progress Metadata
  ↓
Key Decisions + Files Modified + Commands Executed
  ↓
Accumulated Notes (from scratchpad)
  ↓
Phase Summary (if any)
  ↓
Current Blockers + Next Steps
```

Each rebuild increments `cycle`, so the model can see it's in a continued session window.

## Commands

| Command | Action |
|---------|--------|
| `/memory save [summary]` | Save session + auto-consolidate old data |
| `/memory timeline` | Show chronological session history |
| `/memory stats` | Activity density chart |
| `/memory digest` | Show weekly/monthly digests |
| `/memory preview` | Preview sessions ready for consolidation |
| `/memory consolidate` | Mark old sessions as consolidated |
| `/maxmode on\|off\|candidates N` | Toggle parallel candidate selection |
