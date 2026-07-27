// SDK Core Types - Common serializable types used by both SDK consumers and SDK builders.
//
// Types are generated from Zod schemas in coreSchemas.ts.
// To modify types:
// 1. Edit Zod schemas in coreSchemas.ts
// 2. Run: bun scripts/generate-sdk-types.ts
//
// Schemas are available in coreSchemas.ts for runtime validation but are not
// part of the public API.

// Re-export sandbox types for SDK consumers
export type {
  SandboxFilesystemConfig,
  SandboxIgnoreViolations,
  SandboxNetworkConfig,
  SandboxSettings,
} from '../sandboxTypes.js';
// Re-export all generated types
export * from './coreTypes.generated.js';

// Re-export utility types that can't be expressed as Zod schemas
export type { NonNullableUsage } from './sdkUtilityTypes.js';

import type { z } from 'zod/v4';
import type {
  AsyncHookJSONOutputSchema,
  ConfigChangeHookInputSchema,
  CwdChangedHookInputSchema,
  ElicitationHookInputSchema,
  ElicitationResultHookInputSchema,
  ExitReasonSchema,
  FileChangedHookInputSchema,
  HookEventSchema,
  HookInputSchema,
  HookJSONOutputSchema,
  InstructionsLoadedHookInputSchema,
  MessageDisplayHookInputSchema,
  NotificationHookInputSchema,
  PermissionDeniedHookInputSchema,
  PermissionRequestHookInputSchema,
  PermissionUpdateSchema,
  PostCompactHookInputSchema,
  PostToolUseFailureHookInputSchema,
  PostToolUseHookInputSchema,
  PreCompactHookInputSchema,
  PreToolUseHookInputSchema,
  SDKAssistantMessageSchema,
  SDKCompactBoundaryMessageSchema,
  SDKMessageSchema,
  SDKPartialAssistantMessageSchema,
  SDKRateLimitInfoSchema,
  SDKResultMessageSchema,
  SDKResultSuccessSchema,
  SDKStatusMessageSchema,
  SDKSystemMessageSchema,
  SDKToolProgressMessageSchema,
  SDKUserMessageSchema,
  SessionEndHookInputSchema,
  SessionStartHookInputSchema,
  SetupHookInputSchema,
  StopFailureHookInputSchema,
  StopHookInputSchema,
  SubagentStartHookInputSchema,
  SubagentStopHookInputSchema,
  SyncHookJSONOutputSchema,
  TaskCompletedHookInputSchema,
  TaskCreatedHookInputSchema,
  TeammateIdleHookInputSchema,
  UserPromptSubmitHookInputSchema,
  WorktreeCreateHookInputSchema,
  WorktreeRemoveHookInputSchema,
} from './coreSchemas.js';

type InferLazy<T extends () => z.ZodType> = z.infer<ReturnType<T>>;

type SchemaTypes = {
  AsyncHookJSONOutput: typeof AsyncHookJSONOutputSchema;
  ConfigChangeHookInput: typeof ConfigChangeHookInputSchema;
  CwdChangedHookInput: typeof CwdChangedHookInputSchema;
  ElicitationHookInput: typeof ElicitationHookInputSchema;
  ElicitationResultHookInput: typeof ElicitationResultHookInputSchema;
  ExitReason: typeof ExitReasonSchema;
  FileChangedHookInput: typeof FileChangedHookInputSchema;
  HookEvent: typeof HookEventSchema;
  HookInput: typeof HookInputSchema;
  HookJSONOutput: typeof HookJSONOutputSchema;
  InstructionsLoadedHookInput: typeof InstructionsLoadedHookInputSchema;
  MessageDisplayHookInput: typeof MessageDisplayHookInputSchema;
  NotificationHookInput: typeof NotificationHookInputSchema;
  PermissionDeniedHookInput: typeof PermissionDeniedHookInputSchema;
  PermissionRequestHookInput: typeof PermissionRequestHookInputSchema;
  PermissionUpdate: typeof PermissionUpdateSchema;
  PostCompactHookInput: typeof PostCompactHookInputSchema;
  PostToolUseFailureHookInput: typeof PostToolUseFailureHookInputSchema;
  PostToolUseHookInput: typeof PostToolUseHookInputSchema;
  PreCompactHookInput: typeof PreCompactHookInputSchema;
  PreToolUseHookInput: typeof PreToolUseHookInputSchema;
  SDKAssistantMessage: typeof SDKAssistantMessageSchema;
  SDKCompactBoundaryMessage: typeof SDKCompactBoundaryMessageSchema;
  SDKMessage: typeof SDKMessageSchema;
  SDKPartialAssistantMessage: typeof SDKPartialAssistantMessageSchema;
  SDKRateLimitInfo: typeof SDKRateLimitInfoSchema;
  SDKResultMessage: typeof SDKResultMessageSchema;
  SDKResultSuccess: typeof SDKResultSuccessSchema;
  SDKStatusMessage: typeof SDKStatusMessageSchema;
  SDKSystemMessage: typeof SDKSystemMessageSchema;
  SDKToolProgressMessage: typeof SDKToolProgressMessageSchema;
  SDKUserMessage: typeof SDKUserMessageSchema;
  SessionEndHookInput: typeof SessionEndHookInputSchema;
  SessionStartHookInput: typeof SessionStartHookInputSchema;
  SetupHookInput: typeof SetupHookInputSchema;
  StopFailureHookInput: typeof StopFailureHookInputSchema;
  StopHookInput: typeof StopHookInputSchema;
  SubagentStartHookInput: typeof SubagentStartHookInputSchema;
  SubagentStopHookInput: typeof SubagentStopHookInputSchema;
  SyncHookJSONOutput: typeof SyncHookJSONOutputSchema;
  TaskCompletedHookInput: typeof TaskCompletedHookInputSchema;
  TaskCreatedHookInput: typeof TaskCreatedHookInputSchema;
  TeammateIdleHookInput: typeof TeammateIdleHookInputSchema;
  UserPromptSubmitHookInput: typeof UserPromptSubmitHookInputSchema;
  WorktreeCreateHookInput: typeof WorktreeCreateHookInputSchema;
  WorktreeRemoveHookInput: typeof WorktreeRemoveHookInputSchema;
};

type InferredSchemaTypes = {
  [Name in keyof SchemaTypes]: InferLazy<SchemaTypes[Name]>;
};

export type { InferredSchemaTypes as SchemaDerivedTypes };
export type AsyncHookJSONOutput = InferredSchemaTypes['AsyncHookJSONOutput'];
export type ConfigChangeHookInput = InferredSchemaTypes['ConfigChangeHookInput'];
export type CwdChangedHookInput = InferredSchemaTypes['CwdChangedHookInput'];
export type ElicitationHookInput = InferredSchemaTypes['ElicitationHookInput'];
export type ElicitationResultHookInput = InferredSchemaTypes['ElicitationResultHookInput'];
export type ExitReason = InferredSchemaTypes['ExitReason'];
export type FileChangedHookInput = InferredSchemaTypes['FileChangedHookInput'];
export type HookEvent = InferredSchemaTypes['HookEvent'];
export type HookInput = InferredSchemaTypes['HookInput'];
export type HookJSONOutput = InferredSchemaTypes['HookJSONOutput'];
export type InstructionsLoadedHookInput = InferredSchemaTypes['InstructionsLoadedHookInput'];
export type MessageDisplayHookInput = InferredSchemaTypes['MessageDisplayHookInput'];
export type NotificationHookInput = InferredSchemaTypes['NotificationHookInput'];
export type PermissionDeniedHookInput = InferredSchemaTypes['PermissionDeniedHookInput'];
export type PermissionRequestHookInput = InferredSchemaTypes['PermissionRequestHookInput'];
export type PermissionUpdate = InferredSchemaTypes['PermissionUpdate'];
export type PostCompactHookInput = InferredSchemaTypes['PostCompactHookInput'];
export type PostToolUseFailureHookInput = InferredSchemaTypes['PostToolUseFailureHookInput'];
export type PostToolUseHookInput = InferredSchemaTypes['PostToolUseHookInput'];
export type PreCompactHookInput = InferredSchemaTypes['PreCompactHookInput'];
export type PreToolUseHookInput = InferredSchemaTypes['PreToolUseHookInput'];
export type SDKAssistantMessage = InferredSchemaTypes['SDKAssistantMessage'];
export type SDKCompactBoundaryMessage = InferredSchemaTypes['SDKCompactBoundaryMessage'];
export type SDKMessage = InferredSchemaTypes['SDKMessage'];
export type SDKPartialAssistantMessage = InferredSchemaTypes['SDKPartialAssistantMessage'];
export type SDKRateLimitInfo = InferredSchemaTypes['SDKRateLimitInfo'];
export type SDKResultMessage = InferredSchemaTypes['SDKResultMessage'];
export type SDKResultSuccess = InferredSchemaTypes['SDKResultSuccess'];
export type SDKStatusMessage = InferredSchemaTypes['SDKStatusMessage'];
export type SDKSystemMessage = InferredSchemaTypes['SDKSystemMessage'];
export type SDKToolProgressMessage = InferredSchemaTypes['SDKToolProgressMessage'];
export type SDKUserMessage = InferredSchemaTypes['SDKUserMessage'];
export type SessionEndHookInput = InferredSchemaTypes['SessionEndHookInput'];
export type SessionStartHookInput = InferredSchemaTypes['SessionStartHookInput'];
export type SetupHookInput = InferredSchemaTypes['SetupHookInput'];
export type StopFailureHookInput = InferredSchemaTypes['StopFailureHookInput'];
export type StopHookInput = InferredSchemaTypes['StopHookInput'];
export type SubagentStartHookInput = InferredSchemaTypes['SubagentStartHookInput'];
export type SubagentStopHookInput = InferredSchemaTypes['SubagentStopHookInput'];
export type SyncHookJSONOutput = InferredSchemaTypes['SyncHookJSONOutput'];
export type TaskCompletedHookInput = InferredSchemaTypes['TaskCompletedHookInput'];
export type TaskCreatedHookInput = InferredSchemaTypes['TaskCreatedHookInput'];
export type TeammateIdleHookInput = InferredSchemaTypes['TeammateIdleHookInput'];
export type UserPromptSubmitHookInput = InferredSchemaTypes['UserPromptSubmitHookInput'];
export type WorktreeCreateHookInput = InferredSchemaTypes['WorktreeCreateHookInput'];
export type WorktreeRemoveHookInput = InferredSchemaTypes['WorktreeRemoveHookInput'];

// Const arrays for runtime usage
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
  'MessageDisplay',
] as const;

export const EXIT_REASONS = [
  'clear',
  'resume',
  'logout',
  'prompt_input_exit',
  'other',
  'bypass_permissions_disabled',
] as const;
