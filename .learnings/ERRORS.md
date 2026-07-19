## [ERR-20260712-001] agenttalk_reply_to_message

**Logged**: 2026-07-12T00:00:00+07:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
AgentTalk reply call rejected `message_id`; the tool requires `target_id`.

### Error
```
failed to deserialize parameters: missing field `target_id`
```

### Context
- Attempted to reply to AgentTalk message `20260711-192100-342319-l1JK`.
- Used `reply_to_message({ message_id: ... })`.

### Suggested Fix
Use `target_id` for the message being replied to.

### Metadata
- Reproducible: yes
- Related Files: .agenttalk/

### Resolution
- **Resolved**: 2026-07-12T00:00:00+07:00
- **Notes**: Retrying with the documented target parameter.

---

## [ERR-20260719-001] windows_sandbox_helper_launch

**Logged**: 2026-07-19T16:00:00+07:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
Windows sandbox helper failed to launch while inspecting the repository.

### Error
```
windows sandbox: orchestrator_helper_launch_failed: setup refresh failed to launch helper: Access is denied. (os error 5)
```

### Context
- Read-only PowerShell commands failed before execution in `D:\Projects\Github\clew-code`.
- Retrying after filesystem restrictions were disabled succeeded.

### Suggested Fix
Inspect permissions for `codex-windows-sandbox-setup.exe` if restricted sandbox mode is re-enabled.

### Metadata
- Reproducible: yes
- Related Files: C:\Users\Admin\.codex\.sandbox\sandbox.2026-07-19.log

---

## [ERR-20260719-002] spinner_component_path_lookup

**Logged**: 2026-07-19T16:45:00+07:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Attempted to read a guessed spinner component filename that does not exist.

### Error
```
Cannot find path 'src/components/SpinnerWithVerb.tsx' because it does not exist.
```

### Context
- `SpinnerWithVerb` is exported from `src/components/Spinner.tsx`.
- Repository search identified the correct file immediately.

### Suggested Fix
Resolve component definitions with `rg` before reading a guessed filename.

### Metadata
- Reproducible: yes
- Related Files: src/components/Spinner.tsx

### Resolution
- **Resolved**: 2026-07-19T16:45:00+07:00
- **Notes**: Continued inspection using the path returned by `rg`.

---

## [ERR-20260719-003] biome_compact_progress_import_order

**Logged**: 2026-07-19T16:50:00+07:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
Targeted Biome check rejected an out-of-order utility import.

### Error
```
assist/source/organizeImports: Sort these imports.
```

### Context
- Added `estimateCompactProgressPercent` below component-local imports.

### Suggested Fix
Keep parent-directory utility imports before component-local imports.

### Metadata
- Reproducible: yes
- Related Files: src/components/Spinner/SpinnerAnimationRow.tsx

### Resolution
- **Resolved**: 2026-07-19T16:50:00+07:00
- **Notes**: Moved the import into Biome's expected group and order.

---

## [ERR-20260712-003] agenttalk_wait_for_message_stale_results

**Logged**: 2026-07-12T00:00:00+07:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
AgentTalk `wait_for_message` repeatedly returns already-read messages after cursor advancement and inbox sync.

### Error
```
wait_for_message returned message IDs 20260711-192100-342319-l1JK and 20260711-192317-687200-AiWb after sync_messages(auto_advance=true) returned no unread messages.
```

### Context
- Registered agent: codex.
- Cursor advanced to a later outgoing message, then inbox was synced with auto-advance.

### Suggested Fix
Inspect AgentTalk unread/cursor filtering so wait only returns messages newer than the persisted cursor.

### Metadata
- Reproducible: yes
- Related Files: .agenttalk/

---

## [ERR-20260712-002] powershell_command_chaining

**Logged**: 2026-07-12T00:00:00+07:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
The default Windows PowerShell host does not support `&&` command chaining.

### Error
```
The token '&&' is not a valid statement separator in this version.
```

### Context
- Attempted pre-push command: `bun run check:ci && bun x tsc --noEmit && bun test --bail`.

### Suggested Fix
Use sequential PowerShell statements guarded by `$LASTEXITCODE`.

### Metadata
- Reproducible: yes
- Related Files: none

### Resolution
- **Resolved**: 2026-07-12T00:00:00+07:00
- **Notes**: Retrying with PowerShell-compatible failure guards.

---
