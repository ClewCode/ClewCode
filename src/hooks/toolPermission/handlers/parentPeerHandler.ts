import { feature } from 'bun:bundle';
import { randomUUID } from 'node:crypto';
import type { PendingClassifierCheck } from '../../../types/permissions.js';
import { logForDebugging } from '../../../utils/debug.js';
import { toError } from '../../../utils/errors.js';
import { logError } from '../../../utils/log.js';
import type { PermissionDecision } from '../../../utils/permissions/PermissionResult.js';
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js';
import type { PermissionContext } from '../PermissionContext.js';

type ParentPeerPermissionParams = {
  ctx: PermissionContext;
  description: string;
  pendingClassifierCheck?: PendingClassifierCheck | undefined;
  updatedInput: Record<string, unknown> | undefined;
  suggestions: PermissionUpdate[] | undefined;
};

type PermissionPollResponse = {
  status?: 'pending' | 'resolved';
  decision?: 'approved' | 'rejected';
  updatedInput?: Record<string, unknown>;
  feedback?: string;
};

/**
 * Handles the spawned-peer permission flow.
 *
 * When this session was spawned by a parent (CLEW_PEER_PARENT_URL is set), tool
 * uses that need approval are forwarded to the parent's PeerServer over HTTP.
 * The parent surfaces the request in its own permission dialog; this worker
 * blocks (long-polling) until the parent approves or rejects.
 *
 * 1. Tries classifier auto-approval for safe bash commands (no round-trip).
 * 2. Forwards the request to the parent and long-polls for the decision.
 * 3. Returns the parent's decision, or null to fall through to a LOCAL dialog
 *    when no parent is configured or the parent is unreachable.
 */
export async function handleParentPeerPermission(
  params: ParentPeerPermissionParams,
): Promise<PermissionDecision | null> {
  const parentUrl = process.env.CLEW_PEER_PARENT_URL;
  const parentToken = process.env.CLEW_PEER_PARENT_TOKEN;
  if (!parentUrl || !parentToken) {
    return null;
  }

  const { ctx, description, updatedInput } = params;

  // For bash commands, try classifier auto-approval before bothering the parent.
  const classifierResult = feature('BASH_CLASSIFIER')
    ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput)
    : null;
  if (classifierResult) {
    return classifierResult;
  }

  const selfName = process.env.CLEW_PEER_SELF_NAME || 'peer';
  const requestId = randomUUID();
  const signal = ctx.toolUseContext.abortController.signal;

  const body = JSON.stringify({
    token: parentToken,
    requestId,
    fromName: selfName,
    toolName: ctx.tool.name,
    toolUseId: ctx.toolUseID,
    description,
    input: ctx.input,
  });

  // Show "waiting for parent approval" indicator (reuses the swarm-worker field).
  const setPending = (toolName: string | null): void =>
    ctx.toolUseContext.setAppState(prev => ({
      ...prev,
      pendingWorkerRequest: toolName ? { toolName, toolUseId: ctx.toolUseID, description } : null,
    }));
  setPending(ctx.tool.name);

  try {
    // Long-poll loop: the parent holds each request open, replying "pending"
    // periodically so we re-poll until a decision (or abort) arrives.
    for (;;) {
      if (signal.aborted) {
        setPending(null);
        return ctx.cancelAndAbort(undefined, true);
      }

      let resp: Response;
      try {
        resp = await fetch(`${parentUrl}/peer-permission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal,
        });
      } catch (err) {
        if (signal.aborted) {
          setPending(null);
          return ctx.cancelAndAbort(undefined, true);
        }
        // Parent unreachable — fall back to a local dialog so we don't hang.
        logForDebugging(`[ParentPeerPermission] Parent unreachable, falling back to local dialog: ${toError(err)}`);
        setPending(null);
        return null;
      }

      if (!resp.ok) {
        logForDebugging(`[ParentPeerPermission] Parent replied HTTP ${resp.status}, falling back to local dialog`);
        setPending(null);
        return null;
      }

      const data = (await resp.json()) as PermissionPollResponse;
      if (data.status === 'pending') {
        continue; // re-poll
      }

      setPending(null);
      if (data.decision === 'approved') {
        const finalInput =
          data.updatedInput && Object.keys(data.updatedInput).length > 0 ? data.updatedInput : ctx.input;
        return await ctx.handleUserAllow(finalInput, [], data.feedback);
      }
      return ctx.cancelAndAbort(data.feedback);
    }
  } catch (error) {
    // Unexpected failure — fall back to local handling rather than hang.
    logError(toError(error));
    setPending(null);
    return null;
  }
}
