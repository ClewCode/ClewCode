# PLAN.md — Implementation Progress

> Last updated: 2026-05-27

## ✅ Completed (17 items)

| # | Item | Files |
|---|------|-------|
| 1 | Clawd unified rendering | `Clawd.tsx` |
| 2 | Context hearts removed | `StatusLine.tsx`|
| 3 | /reload-skills command | `reload-skills/index.tsx`, `commands.ts` |
| 4 | SessionStart reloadSkills | `hooks.ts`, `sessionStart.ts` |
| 5 | SessionStart sessionTitle | `hooks.ts`, `sessionStart.ts` |
| 6 | /code-review --fix | `code-review.md` |
| 7 | /simplify → fix | `simplify.ts` |
| 8 | /insights crash fix | `insights.ts` |
| 9 | cache_creation fallback | `claude.ts` |
| 10 | Sandbox warning condensed | `LogoV2.tsx` |
| 11 | Jump-to-bottom pill | `FullscreenLayout.tsx` |
| 12 | otelHeadersHelper spaces | `auth.ts` |
| 13 | OTEL entrypoint attr | `instrumentation.ts` |
| 14 | Plugin MCP dedup | `config.ts` |
| 15 | Focus mode hidden count | `Messages.tsx` |
| 16 | disallowed-tools frontmatter | `loadSkillsDir.ts`, `bundledSkills.ts`, `command.ts`, `builtinPlugins.ts` |
| 17 | --fallback-model | Already in codebase (QueryEngine.ts) |

## ✅ Already in Codebase
- Markdown GFM checkboxes
- /diff keyboard scrolling
- Auto mode opt-in
- PowerShell cd detection & compound guards
- Pipeline arg security

## ❌ Anthropic Internal
- cloud MCP, managed settings, marketplace --scope
- egress proxy, push notification, thinking blocks
- mobile session rename, stale permission prompts

## 🔲 Remaining (needs implementation)
- MessageDisplay hook event
- Spinner fixes (amber, wrong text)
- Status bar effort from frontmatter
- Collapsed Bash line count
- Ctrl+O transcript live-tailing
- Link in tool result collapsing
- Markdown table borders/code colors
- Argument-hint fixes
- /config exit phantom changes
- /doctor stale entries
- /ultraplan "no changes"
- Bash macOS find exhaustion
- Sandbox worktree allowlist
