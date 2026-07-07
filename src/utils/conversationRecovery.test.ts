import { describe, expect, test } from 'bun:test';
import { randomUUID, type UUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetStateForTests, setOriginalCwd, switchSession } from '../bootstrap/state.js';
import { asSessionId } from '../types/ids.js';
import {
  buildResumeConversationChain,
  getProjectDir,
  getTranscriptPathForSession,
  loadTranscriptFile,
  loadTranscriptFromFile,
} from './sessionStorage.js';

function userMessage({
  uuid = randomUUID() as UUID,
  parentUuid,
  sessionId,
  timestamp,
  text,
}: {
  uuid?: UUID;
  parentUuid: UUID | null;
  sessionId: UUID;
  timestamp: string;
  text: string;
}) {
  return {
    type: 'user',
    uuid,
    parentUuid,
    sessionId,
    timestamp,
    cwd: process.cwd(),
    message: {
      role: 'user',
      content: text,
    },
  };
}

function assistantMessage({
  uuid = randomUUID() as UUID,
  parentUuid,
  sessionId,
  timestamp,
  text,
}: {
  uuid?: UUID;
  parentUuid: UUID | null;
  sessionId: UUID;
  timestamp: string;
  text: string;
}) {
  return {
    type: 'assistant',
    uuid,
    parentUuid,
    sessionId,
    timestamp,
    cwd: process.cwd(),
    message: {
      id: uuid,
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

describe('buildResumeConversationChain', () => {
  test('restores pre-compact history for resume display', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clew-resume-'));
    const file = join(dir, 'session.jsonl');

    try {
      const sessionId = randomUUID() as UUID;
      const beforeUser = userMessage({
        sessionId,
        parentUuid: null,
        timestamp: '2026-06-20T00:00:00.000Z',
        text: 'before compact',
      });
      const beforeAssistant = assistantMessage({
        sessionId,
        parentUuid: beforeUser.uuid,
        timestamp: '2026-06-20T00:00:01.000Z',
        text: `before compact answer ${'x'.repeat(5 * 1024 * 1024)}`,
      });
      const boundary = {
        type: 'system',
        subtype: 'compact_boundary',
        content: 'Conversation compacted',
        isMeta: false,
        level: 'info',
        uuid: randomUUID() as UUID,
        timestamp: '2026-06-20T00:00:02.000Z',
        compactMetadata: {
          trigger: 'manual',
          preTokens: 1,
        },
        logicalParentUuid: beforeAssistant.uuid,
      };
      const afterUser = userMessage({
        sessionId,
        parentUuid: boundary.uuid,
        timestamp: '2026-06-20T00:00:03.000Z',
        text: 'after compact',
      });
      const afterAssistant = assistantMessage({
        sessionId,
        parentUuid: afterUser.uuid,
        timestamp: '2026-06-20T00:00:04.000Z',
        text: 'after compact answer',
      });

      await writeFile(
        file,
        [beforeUser, beforeAssistant, boundary, afterUser, afterAssistant]
          .map(entry => JSON.stringify(entry))
          .join('\n'),
      );

      const { messages, leafUuids } = await loadTranscriptFile(file, { includePreCompactHistory: true });
      const leaf = [...messages.values()].find(
        message => leafUuids.has(message.uuid) && message.uuid === afterAssistant.uuid,
      );

      expect(leaf).toBeDefined();
      expect(buildResumeConversationChain(messages, leaf!).map(message => message.uuid)).toEqual([
        beforeUser.uuid,
        beforeAssistant.uuid,
        boundary.uuid,
        afterUser.uuid,
        afterAssistant.uuid,
      ]);

      const log = await loadTranscriptFromFile(file, { includePreCompactHistory: true });
      expect(log.messages.map(message => message.uuid)).toEqual([
        beforeUser.uuid,
        beforeAssistant.uuid,
        boundary.uuid,
        afterUser.uuid,
        afterAssistant.uuid,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('stitches fragmented null-parent islands so resume recovers every message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clew-resume-frag-'));
    const file = join(dir, 'session.jsonl');

    try {
      const sessionId = randomUUID() as UUID;
      // Simulate the recorder race: the FIRST assistant message of each turn
      // is orphaned (parentUuid=null) instead of chaining to the preceding
      // user/tool_result message. Three turns → three disconnected islands.
      const u1 = userMessage({ sessionId, parentUuid: null, timestamp: '2026-06-20T00:00:00.000Z', text: 'q1' });
      const a1 = assistantMessage({ sessionId, parentUuid: null, timestamp: '2026-06-20T00:00:01.000Z', text: 'a1' });
      const u2 = userMessage({ sessionId, parentUuid: a1.uuid, timestamp: '2026-06-20T00:00:02.000Z', text: 'q2' });
      const a2 = assistantMessage({ sessionId, parentUuid: null, timestamp: '2026-06-20T00:00:03.000Z', text: 'a2' });
      const u3 = userMessage({ sessionId, parentUuid: a2.uuid, timestamp: '2026-06-20T00:00:04.000Z', text: 'q3' });
      const a3 = assistantMessage({ sessionId, parentUuid: null, timestamp: '2026-06-20T00:00:05.000Z', text: 'a3' });

      await writeFile(file, [u1, a1, u2, a2, u3, a3].map(entry => JSON.stringify(entry)).join('\n'));

      const { messages, leafUuids } = await loadTranscriptFile(file, { includePreCompactHistory: true });
      const leaf = [...messages.values()].find(m => leafUuids.has(m.uuid) && m.uuid === a3.uuid);
      expect(leaf).toBeDefined();

      // Without the repair the leaf→root walk would return just [a3].
      expect(buildResumeConversationChain(messages, leaf!).map(m => m.uuid)).toEqual([
        u1.uuid,
        a1.uuid,
        u2.uuid,
        a2.uuid,
        u3.uuid,
        a3.uuid,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('getTranscriptPathForSession', () => {
  test('does not apply the active resumed project dir to other session ids', () => {
    resetStateForTests();

    const originalCwd = join(tmpdir(), `clew-original-${randomUUID()}`);
    const activeSessionId = randomUUID() as UUID;
    const otherSessionId = randomUUID() as UUID;
    const activeProjectDir = join(tmpdir(), `clew-active-project-${randomUUID()}`);

    setOriginalCwd(originalCwd);
    switchSession(asSessionId(activeSessionId), activeProjectDir);

    expect(getTranscriptPathForSession(activeSessionId)).toBe(join(activeProjectDir, `${activeSessionId}.jsonl`));
    expect(getTranscriptPathForSession(otherSessionId)).toBe(
      join(getProjectDir(originalCwd), `${otherSessionId}.jsonl`),
    );

    resetStateForTests();
  });
});
