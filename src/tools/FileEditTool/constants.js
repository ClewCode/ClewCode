import { CLAUDE_FOLDER_PERMISSION_PATTERN as CLAUDE_FOLDER_PATTERN, CLEW_FOLDER_PERMISSION_PATTERN, GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN as GLOBAL_CLAUDE_FOLDER_PATTERN, GLOBAL_CLEW_FOLDER_PERMISSION_PATTERN, } from '../../utils/clewPaths.js';
// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit';
// Permission pattern for granting session-level access to the project's .clew/ folder
export { CLEW_FOLDER_PERMISSION_PATTERN as CLAUDE_FOLDER_PERMISSION_PATTERN, GLOBAL_CLEW_FOLDER_PERMISSION_PATTERN as GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN, };
// Legacy patterns (deprecated — use CLEW_ variants)
export const LEGACY_CLAUDE_FOLDER_PERMISSION_PATTERN = CLAUDE_FOLDER_PATTERN;
export const LEGACY_GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = GLOBAL_CLAUDE_FOLDER_PATTERN;
export const FILE_UNEXPECTEDLY_MODIFIED_ERROR = 'File has been unexpectedly modified. Read it again before attempting to write it.';
