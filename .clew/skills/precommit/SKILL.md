---
name: precommit
description: Pre-commit review — run full verification and show a git diff summary. Use before committing changes.
---

# Precommit

Run the full verification pipeline and show what's about to be committed:

```bash
bun x tsc --noEmit && biome ci src/ && bun test && echo "---" && git status && echo "---" && git diff --stat
```

Review the output carefully:
- Typecheck errors must be fixed before committing.
- Lint issues must be resolved.
- Test failures are blockers.
- Inspect the diff stat to confirm only intended files changed.
