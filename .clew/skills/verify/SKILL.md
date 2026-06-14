---
name: verify
description: Run full verification — typecheck, lint (CI mode), and tests. Use before committing or when you need to confirm nothing is broken.
---

# Verify

Run the full verification pipeline:

```bash
bun x tsc --noEmit && biome ci src/ && bun test
```

If any step fails, fix the issues and re-run. Do not proceed with commits or PRs until all three pass.
