/**
 * Pure permission type definitions extracted to break import cycles.
 *
 * This file contains only type definitions and constants with no runtime dependencies.
 * Implementation files remain in src/utils/permissions/ but can now import from here
 * to avoid circular dependencies.
 */
// ============================================================================
// Permission Modes
// ============================================================================
export const EXTERNAL_PERMISSION_MODES = ['acceptEdits', 'ask', 'bypassPermissions', 'default', 'dontAsk', 'plan'];
// Runtime validation set: modes that are user-addressable (settings.json
// defaultMode, --permission-mode CLI flag, conversation recovery).
export const INTERNAL_PERMISSION_MODES = [...EXTERNAL_PERMISSION_MODES, 'auto', 'guardian'];
export const PERMISSION_MODES = INTERNAL_PERMISSION_MODES;
