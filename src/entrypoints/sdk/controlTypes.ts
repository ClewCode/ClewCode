/**
 * SDK Control Types — TypeScript types for the control protocol.
 *
 * These are the concrete types exported from the control protocol.
 * The schemas live in controlSchemas.ts for runtime validation.
 *
 * Used by SDK builders (e.g., Python SDK) to communicate with the CLI process.
 * SDK consumers should use coreTypes.ts instead.
 */

import type { z } from 'zod/v4';

export type { SDKPartialAssistantMessage } from './coreTypes.js';

import type {
  SDKControlCancelRequestSchema,
  SDKControlInitializeRequestSchema,
  SDKControlInitializeResponseSchema,
  SDKControlMcpSetServersResponseSchema,
  SDKControlPermissionRequestSchema,
  SDKControlReloadPluginsResponseSchema,
  SDKControlRequestInnerSchema,
  SDKControlRequestSchema,
  SDKControlResponseSchema,
  StdinMessageSchema,
  StdoutMessageSchema,
} from './controlSchemas.js';

type InferLazy<T extends () => z.ZodType> = z.infer<ReturnType<T>>;

export type SDKControlRequest = InferLazy<typeof SDKControlRequestSchema>;
export type SDKControlResponse = InferLazy<typeof SDKControlResponseSchema>;
export type SDKControlCancelRequest = InferLazy<typeof SDKControlCancelRequestSchema>;
export type SDKControlInitializeRequest = InferLazy<typeof SDKControlInitializeRequestSchema>;
export type SDKControlInitializeResponse = InferLazy<typeof SDKControlInitializeResponseSchema>;
export type SDKControlMcpSetServersResponse = InferLazy<typeof SDKControlMcpSetServersResponseSchema>;
export type SDKControlPermissionRequest = InferLazy<typeof SDKControlPermissionRequestSchema>;
export type SDKControlReloadPluginsResponse = InferLazy<typeof SDKControlReloadPluginsResponseSchema>;
export type SDKControlRequestInner = InferLazy<typeof SDKControlRequestInnerSchema>;
export type StdinMessage = InferLazy<typeof StdinMessageSchema>;
export type StdoutMessage = InferLazy<typeof StdoutMessageSchema>;
