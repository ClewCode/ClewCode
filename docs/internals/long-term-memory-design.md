# Long-Term Memory System Implementation

## Architecture

```
~/.clew/projects/<project-root>/
└── session-memory.db    ← SQLite (bun:sqlite)
    ├── sessions         ← session records + consolidation level
    ├── topic_index      ← tag → session mapping
    └── digests          ← weekly/monthly summaries
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

## Like Human Memory

| Age | Level | Detail |
|-----|-------|--------|
| < 7 days | Raw | Full session detail (consolidated=0) |
| 1-4 weeks | Weekly digest | Summary + patterns (consolidated=1) |
| > 1 month | Monthly digest | High-level trends (consolidated=2) |
| Ancient | Patterns only | Recurring topics preserved |

## Files

| File | Purpose |
|------|---------|
| `src/services/longTermMemory/crossSession.ts` | Core: save, load, consolidate, topic index |
| `src/services/longTermMemory/timeline.ts` | Timeline queries, density stats, digest format |
| `src/services/longTermMemory/consolidate.ts` | Preview/save consolidation candidates |
| `src/services/longTermMemory/index.ts` | Barrel exports |

## Commands

| Command | Action |
|---------|--------|
| `/memory save [summary]` | Save session + auto-consolidate old data |
| `/memory timeline` | Show chronological session history |
| `/memory stats` | Activity density chart |
| `/memory digest` | Show weekly/monthly digests |
| `/memory preview` | Preview sessions ready for consolidation |
| `/memory consolidate` | Mark old sessions as consolidated |
