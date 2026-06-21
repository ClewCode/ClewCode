import {
  CLEW_FOLDER_PERMISSION_PATTERN,
  GLOBAL_CLEW_FOLDER_PERMISSION_PATTERN,
} from '../../utils/clewPaths.js';

// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit';

// Permission patterns for granting session-level access to project .clew/ and global ~/.clew/ folders
export { CLEW_FOLDER_PERMISSION_PATTERN, GLOBAL_CLEW_FOLDER_PERMISSION_PATTERN };

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.';
