/**
 * Peer Permission Surface
 *
 * Bridges a permission request forwarded by a spawned peer (worker) into the
 * parent session's normal permission dialog. The worker holds its tool use
 * blocked over HTTP (see PeerServer `/peer-permission`) while the parent's
 * user approves or rejects here; the decision is sent back via
 * `resolvePeerPermission`.
 *
 * This mirrors the swarm leader flow in useInboxPoller.ts, but the transport
 * is HTTP (PeerServer) rather than the file-based teammate mailbox, so it
 * works for peers spawned as independent processes (and across the LAN).
 */

import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js';
import { findToolByName } from '../Tool.js';
import { getAllBaseTools } from '../tools.js';
import type { PermissionUpdate } from '../types/permissions.js';
import { logForDebugging } from '../utils/debug.js';
import { createAssistantMessage } from '../utils/messages.js';
import { getLeaderToolUseConfirmQueue } from '../utils/swarm/leaderPermissionBridge.js';
import { getGlobalPeerServer } from './PeerServer.js';
import type { PeerPermissionRequest } from './types.js';

/**
 * Surface a forwarded peer permission request in the parent's permission UI.
 * Resolves the worker's pending request via the PeerServer when the user acts.
 */
export function surfacePeerPermissionRequest(req: PeerPermissionRequest): void {
  const server = getGlobalPeerServer();
  const setQueue = getLeaderToolUseConfirmQueue();

  // No interactive REPL queue available — reject so the worker doesn't hang.
  if (!setQueue) {
    logForDebugging(`[PeerPermission] No UI queue available, rejecting request ${req.requestId}`);
    server.resolvePeerPermission(req.requestId, {
      decision: 'rejected',
      feedback: 'Parent session has no interactive UI available to approve this.',
    });
    return;
  }

  const tool = findToolByName(getAllBaseTools(), req.toolName);
  if (!tool) {
    logForDebugging(`[PeerPermission] Unknown tool ${req.toolName}, rejecting request ${req.requestId}`);
    server.resolvePeerPermission(req.requestId, {
      decision: 'rejected',
      feedback: `Parent does not recognize tool "${req.toolName}".`,
    });
    return;
  }

  const entry: ToolUseConfirm = {
    assistantMessage: createAssistantMessage({ content: '' }),
    tool,
    description: req.description,
    input: req.input,
    // The dialog only reads toolUseContext for a few optional fields; an empty
    // object is what the swarm-leader path uses for out-of-process workers too.
    toolUseContext: {} as ToolUseConfirm['toolUseContext'],
    toolUseID: req.toolUseId,
    permissionResult: { behavior: 'ask', message: req.description },
    permissionPromptStartTimeMs: Date.now(),
    workerBadge: { name: req.fromName, color: 'cyan' },
    onUserInteraction() {
      // No classifier auto-approval race on the parent side for forwarded requests.
    },
    onAbort() {
      server.resolvePeerPermission(req.requestId, { decision: 'rejected' });
    },
    onAllow(updatedInput: Record<string, unknown>, _permissionUpdates: PermissionUpdate[]) {
      // "Always allow" rules apply to the parent's context only; the worker
      // receives a one-time allow with any edited input.
      server.resolvePeerPermission(req.requestId, { decision: 'approved', updatedInput });
    },
    onReject(feedback?: string) {
      server.resolvePeerPermission(req.requestId, { decision: 'rejected', feedback });
    },
    async recheckPermission() {
      // Permission state lives on the worker side; nothing to recheck here.
    },
  };

  // Deduplicate: a re-polling worker can briefly cause a duplicate surface.
  setQueue(queue => (queue.some(q => q.toolUseID === req.toolUseId) ? queue : [...queue, entry]));
  logForDebugging(`[PeerPermission] Surfaced request ${req.requestId} (${req.toolName}) from ${req.fromName}`);
}
