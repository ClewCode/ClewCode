import { basename, sep } from 'path';
import type { ReactNode } from 'react';
import { getOriginalCwd } from '../../../bootstrap/state.js';
import { Text } from '../../../ink.js';
import { getShortcutDisplay } from '../../../keybindings/shortcutFormat.js';
import type { ToolPermissionContext } from '../../../Tool.js';
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js';
import { expandPath, getDirectoryForPath } from '../../../utils/path.js';
import { normalizeCaseForComparison, pathInAllowedWorkingPath } from '../../../utils/permissions/filesystem.js';
import type { OptionWithDescription } from '../../CustomSelect/select.js';
/**
 * Check if a path is within the project's .clew/ folder (or legacy .claude/).
 * This is used to determine whether to show the special ".clew folder" permission option.
 */
export function isInClaudeFolder(filePath: string): boolean {
  const absolutePath = expandPath(filePath);
  const clewFolderPath = expandPath(`${getOriginalCwd()}/.clew`);
  const claudeFolderPath = expandPath(`${getOriginalCwd()}/.claude`);

  // Check if the path is within the project's .clew or .claude folder
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedClewFolderPath = normalizeCaseForComparison(clewFolderPath);
  const normalizedClaudeFolderPath = normalizeCaseForComparison(claudeFolderPath);

  // Path must start with the folder path (and be inside it, not just the folder itself)
  return (
    normalizedAbsolutePath.startsWith(normalizedClewFolderPath + sep.toLowerCase()) ||
    normalizedAbsolutePath.startsWith(`${normalizedClewFolderPath}/`) ||
    normalizedAbsolutePath.startsWith(normalizedClaudeFolderPath + sep.toLowerCase()) ||
    normalizedAbsolutePath.startsWith(`${normalizedClaudeFolderPath}/`)
  );
}

/**
 * Check if a path is within the global ~/.clew/ folder.
 * This is used to determine whether to show the special ".clew folder" permission option
 * for files in the user's home directory.
 */
export function isInGlobalClaudeFolder(filePath: string): boolean {
  const absolutePath = expandPath(filePath);
  const globalClaudeFolderPath = getClaudeConfigHomeDir();
  const normalizedAbsolutePath = normalizeCaseForComparison(absolutePath);
  const normalizedGlobalClaudeFolderPath = normalizeCaseForComparison(globalClaudeFolderPath);
  return (
    normalizedAbsolutePath.startsWith(normalizedGlobalClaudeFolderPath + sep.toLowerCase()) ||
    normalizedAbsolutePath.startsWith(`${normalizedGlobalClaudeFolderPath}/`)
  );
}
export type PermissionOption =
  | {
      type: 'accept-once';
    }
  | {
      type: 'accept-session';
      scope?: 'clew-folder' | 'global-clew-folder';
    }
  | {
      type: 'reject';
    };
export type PermissionOptionWithLabel = OptionWithDescription<string> & {
  option: PermissionOption;
};
export type FileOperationType = 'read' | 'write' | 'create';
export function getFilePermissionOptions({
  filePath,
  toolPermissionContext,
  operationType = 'write',
  onRejectFeedbackChange,
  onAcceptFeedbackChange,
  yesInputMode = false,
  noInputMode = false,
}: {
  filePath: string;
  toolPermissionContext: ToolPermissionContext;
  operationType?: FileOperationType;
  onRejectFeedbackChange?: (value: string) => void;
  onAcceptFeedbackChange?: (value: string) => void;
  yesInputMode?: boolean;
  noInputMode?: boolean;
}): PermissionOptionWithLabel[] {
  const options: PermissionOptionWithLabel[] = [];
  const modeCycleShortcut = getShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab');

  // When in input mode, show input field
  if (yesInputMode && onAcceptFeedbackChange) {
    options.push({
      type: 'input',
      label: 'Yes',
      value: 'yes',
      placeholder: 'and tell Claude what to do next',
      onChange: onAcceptFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: 'accept-once',
      },
    });
  } else {
    options.push({
      label: 'Yes',
      value: 'yes',
      option: {
        type: 'accept-once',
      },
    });
  }
  const inAllowedPath = pathInAllowedWorkingPath(filePath, toolPermissionContext);

  // Check if this is a .clew/ folder path (project or global)
  const inClaudeFolder = isInClaudeFolder(filePath);
  const inGlobalClaudeFolder = isInGlobalClaudeFolder(filePath);

  // Option 2: For .clew/ folder, show special option instead of generic session option
  // Note: Session-level options are always shown since they only affect in-memory state,
  // not persisted settings. The allowManagedPermissionRulesOnly setting only restricts
  // persisted permission rules.
  if ((inClaudeFolder || inGlobalClaudeFolder) && operationType !== 'read') {
    options.push({
      label: 'Yes, and allow Clew to edit its own settings for this session',
      value: 'yes-clew-folder',
      option: {
        type: 'accept-session',
        scope: inGlobalClaudeFolder ? 'global-clew-folder' : 'clew-folder',
      },
    });
  } else {
    // Option 2: Allow all changes/reads during session
    let sessionLabel: ReactNode;
    if (inAllowedPath) {
      // Inside working directory
      if (operationType === 'read') {
        sessionLabel = 'Yes, during this session';
      } else {
        sessionLabel = (
          <Text>
            Yes, allow all edits during this session <Text bold>({modeCycleShortcut})</Text>
          </Text>
        );
      }
    } else {
      // Outside working directory - include directory name
      const dirPath = getDirectoryForPath(filePath);
      const dirName = basename(dirPath) || 'this directory';
      if (operationType === 'read') {
        sessionLabel = (
          <Text>
            Yes, allow reading from <Text bold>{dirName}/</Text> during this session
          </Text>
        );
      } else {
        sessionLabel = (
          <Text>
            Yes, allow all edits in <Text bold>{dirName}/</Text> during this session{' '}
            <Text bold>({modeCycleShortcut})</Text>
          </Text>
        );
      }
    }
    options.push({
      label: sessionLabel,
      value: 'yes-session',
      option: {
        type: 'accept-session',
      },
    });
  }

  // When in input mode, show input field for reject
  if (noInputMode && onRejectFeedbackChange) {
    options.push({
      type: 'input',
      label: 'No',
      value: 'no',
      placeholder: 'and tell Claude what to do differently',
      onChange: onRejectFeedbackChange,
      allowEmptySubmitToCancel: true,
      option: {
        type: 'reject',
      },
    });
  } else {
    // Not in input mode - simple option
    options.push({
      label: 'No',
      value: 'no',
      option: {
        type: 'reject',
      },
    });
  }
  return options;
}
