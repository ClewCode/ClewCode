#!/usr/bin/env bash
# Claude Code - mark1 fork wrapper
cd "D:/Projects/Github/claudecode" || exit 1
exec bun run src/main.tsx "$@"