import type { LocalCommandCall } from '../../types/command.js';
import {
  EXECUTION_MODES,
  EXECUTION_MODE_LABELS,
  EXECUTION_MODE_TO_PERMISSION,
  type ExecutionMode,
} from '../../types/permissions.js';
import { transitionPermissionMode } from '../../utils/permissions/permissionSetup.js';
import { setExecutionMode } from '../../utils/executionMode.js';

export const call: LocalCommandCall = async (args, context) => {
  const input = args?.trim().toLowerCase() || '';
  const valid = EXECUTION_MODES as readonly string[];

  if (!valid.includes(input)) {
    const list = valid
      .map(m => `  ${m} — ${EXECUTION_MODE_LABELS[m as ExecutionMode]}`)
      .join('\n');
    return {
      type: 'text',
      value: `Usage: /mode <name>\n\nModes:\n${list}`,
    };
  }

  const mode = input as ExecutionMode;
  const targetPerm = EXECUTION_MODE_TO_PERMISSION[mode];
  const current = context.toolPermissionContext.mode;

  if (targetPerm !== current) {
    transitionPermissionMode(current, targetPerm, context.toolPermissionContext);
  }

  setExecutionMode(mode);

  return {
    type: 'text',
    value: `Switched to ${EXECUTION_MODE_LABELS[mode]} mode.`,
  };
};
