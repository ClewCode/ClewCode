/**
 * Tests for teammateMailbox.ts — file-based messaging system.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { getTeamsDir } from './envUtils.js';
import {
  createPermissionRequestMessage,
  createPermissionResponseMessage,
  getInboxPath,
  isIdleNotification,
  isModeSetRequest,
  isPermissionRequest,
  isPermissionResponse,
  isShutdownRequest,
  isStructuredProtocolMessage,
  markMessageAsReadByIndex,
  markMessagesAsRead,
  readMailbox,
  readUnreadMessages,
  writeToMailbox,
} from './teammateMailbox.js';

const TEST_TEAM = 'test-team-mailbox';
const TEST_AGENT_A = 'test-agent-a';
const TEST_AGENT_B = 'test-agent-b';
const TEMP_DIR = join(getTeamsDir(), TEST_TEAM);

describe('teammateMailbox', () => {
  beforeAll(async () => {
    await mkdir(join(TEMP_DIR, 'inboxes'), { recursive: true });
  });

  afterAll(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
  });

  test('getInboxPath returns correct path structure', () => {
    const path = getInboxPath(TEST_AGENT_A, TEST_TEAM);
    expect(path).toContain('teams');
    expect(path).toContain(TEST_TEAM);
    expect(path).toContain('inboxes');
    expect(path).toContain(TEST_AGENT_A);
    expect(path).toEndWith('.json');
  });

  test('readMailbox returns empty array for non-existent inbox', async () => {
    const messages = await readMailbox('nonexistent-agent', TEST_TEAM);
    expect(messages).toEqual([]);
  });

  test('writeToMailbox and readMailbox round-trip', async () => {
    const testAgent = 'roundtrip-agent';
    const inboxPath = join(TEMP_DIR, 'inboxes', `${testAgent}.json`);
    await rm(inboxPath, { force: true });

    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_B,
        text: 'Hello, teammate!',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );

    const messages = await readMailbox(testAgent, TEST_TEAM);
    expect(messages.length).toBe(1);
    expect(messages[0]!.from).toBe(TEST_AGENT_B);
    expect(messages[0]!.text).toBe('Hello, teammate!');
    expect(messages[0]!.read).toBe(false);
  });

  test('writeToMailbox appends to existing inbox', async () => {
    const testAgent = 'append-agent';
    const inboxPath = join(TEMP_DIR, 'inboxes', `${testAgent}.json`);
    await rm(inboxPath, { force: true });

    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_A,
        text: 'Message 1',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );
    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_B,
        text: 'Message 2',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );

    const messages = await readMailbox(testAgent, TEST_TEAM);
    expect(messages.length).toBe(2);
    expect(messages[0]!.text).toBe('Message 1');
    expect(messages[1]!.text).toBe('Message 2');
  });

  test('markMessageAsReadByIndex marks specific message read', async () => {
    const testAgent = 'markread-agent';
    const inboxPath = join(TEMP_DIR, 'inboxes', `${testAgent}.json`);
    await rm(inboxPath, { force: true });

    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_A,
        text: 'Msg 1',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );
    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_B,
        text: 'Msg 2',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );

    await markMessageAsReadByIndex(testAgent, TEST_TEAM, 0);

    const messages = await readMailbox(testAgent, TEST_TEAM);
    expect(messages[0]!.read).toBe(true);
    expect(messages[1]!.read).toBe(false);
  });

  test('markMessagesAsRead marks all messages read', async () => {
    const testAgent = 'markall-agent';
    const inboxPath = join(TEMP_DIR, 'inboxes', `${testAgent}.json`);
    await rm(inboxPath, { force: true });

    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_A,
        text: 'Msg 1',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );
    await writeToMailbox(
      testAgent,
      {
        from: TEST_AGENT_A,
        text: 'Msg 2',
        timestamp: new Date().toISOString(),
      },
      TEST_TEAM,
    );

    await markMessagesAsRead(testAgent, TEST_TEAM);

    const messages = await readMailbox(testAgent, TEST_TEAM);
    expect(messages.every(m => m.read)).toBe(true);
  });

  test('readUnreadMessages returns only unread', async () => {
    const testAgent = 'unread-agent';
    const inboxPath = join(TEMP_DIR, 'inboxes', `${testAgent}.json`);
    await rm(inboxPath, { force: true });

    await writeFile(
      inboxPath,
      JSON.stringify([
        {
          from: TEST_AGENT_A,
          text: 'Read msg',
          timestamp: new Date().toISOString(),
          read: true,
        },
        {
          from: TEST_AGENT_B,
          text: 'Unread msg',
          timestamp: new Date().toISOString(),
          read: false,
        },
      ]),
    );

    const unread = await readUnreadMessages(testAgent, TEST_TEAM);
    expect(unread.length).toBe(1);
    expect(unread[0]!.text).toBe('Unread msg');
  });

  test('isShutdownRequest detects valid shutdown request', () => {
    const valid = isShutdownRequest(
      JSON.stringify({
        type: 'shutdown_request',
        requestId: 'abc123',
        from: 'team-lead',
        reason: 'Done',
        timestamp: new Date().toISOString(),
      }),
    );
    expect(valid).not.toBeNull();
    expect(valid!.type).toBe('shutdown_request');
    expect(valid!.from).toBe('team-lead');
  });

  test('isShutdownRequest returns null for non-shutdown message', () => {
    expect(isShutdownRequest('Hello!')).toBeNull();
    expect(isShutdownRequest(JSON.stringify({ type: 'idle_notification' }))).toBeNull();
  });

  test('isIdleNotification detects idle notification', () => {
    const valid = isIdleNotification(
      JSON.stringify({
        type: 'idle_notification',
        from: 'researcher',
        timestamp: new Date().toISOString(),
        idleReason: 'available',
      }),
    );
    expect(valid).not.toBeNull();
    expect(valid!.type).toBe('idle_notification');
    expect(valid!.idleReason).toBe('available');
  });

  test('isPermissionRequest and isPermissionResponse round-trip', () => {
    const req = createPermissionRequestMessage({
      request_id: 'req-1',
      agent_id: 'worker@team',
      tool_name: 'Edit',
      tool_use_id: 'toolu_001',
      description: 'Edit file at path X',
      input: { file_path: '/x.txt' },
      permission_suggestions: [],
    });

    const parsed = isPermissionRequest(JSON.stringify(req));
    expect(parsed).not.toBeNull();
    expect(parsed!.request_id).toBe('req-1');
    expect(parsed!.tool_name).toBe('Edit');

    const resp = createPermissionResponseMessage({
      request_id: 'req-1',
      subtype: 'success',
      updated_input: { file_path: '/x.txt' },
      permission_updates: [],
    });

    const parsedResp = isPermissionResponse(JSON.stringify(resp));
    expect(parsedResp).not.toBeNull();
    expect(parsedResp!.subtype).toBe('success');
  });

  test('isModeSetRequest detects mode set request', () => {
    const valid = isModeSetRequest(
      JSON.stringify({
        type: 'mode_set_request',
        mode: 'acceptEdits',
        from: 'team-lead',
      }),
    );
    expect(valid).not.toBeNull();
    expect(valid!.mode).toBe('acceptEdits');
  });

  test('isStructuredProtocolMessage identifies structured types', () => {
    expect(isStructuredProtocolMessage('plain text')).toBe(false);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'permission_request' }))).toBe(true);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'shutdown_request' }))).toBe(true);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'mode_set_request' }))).toBe(true);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'plan_approval_request' }))).toBe(true);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'idle_notification' }))).toBe(false);
    expect(isStructuredProtocolMessage(JSON.stringify({ type: 'chat_message' }))).toBe(false);
  });
});
