import { describe, expect, test } from 'bun:test';
import { randomUUID, type UUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetStateForTests, setOriginalCwd, switchSession } from '../bootstrap/state.js';
import { asSessionId } from '../types/ids.js';
import { sanitizePath } from './path.js';
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

  test('falls back to .codex, .opencode, .claude, and .gemini directories when file exists in fallback but not primary', async () => {
    resetStateForTests();

    const tempCodexDir = join(tmpdir(), `clew-test-codex-${randomUUID()}`);
    const tempOpencodeDir = join(tmpdir(), `clew-test-opencode-${randomUUID()}`);
    const tempClaudeDir = join(tmpdir(), `clew-test-claude-${randomUUID()}`);
    const tempGeminiDir = join(tmpdir(), `clew-test-gemini-${randomUUID()}`);
    const tempClewDir = join(tmpdir(), `clew-test-clew-${randomUUID()}`);

    // Set config dirs
    const oldCodexEnv = process.env.CODEX_CONFIG_DIR;
    const oldOpencodeEnv = process.env.OPENCODE_CONFIG_DIR;
    const oldClaudeEnv = process.env.CLAUDE_CONFIG_DIR;
    const oldGeminiEnv = process.env.GEMINI_CONFIG_DIR;
    const oldClewEnv = process.env.CLEW_CONFIG_DIR;

    process.env.CODEX_CONFIG_DIR = tempCodexDir;
    process.env.OPENCODE_CONFIG_DIR = tempOpencodeDir;
    process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    process.env.GEMINI_CONFIG_DIR = tempGeminiDir;
    process.env.CLEW_CONFIG_DIR = tempClewDir;

    const originalCwd = join(tmpdir(), `clew-original-${randomUUID()}`);
    setOriginalCwd(originalCwd);

    const sessionId1 = randomUUID() as UUID;
    const sessionId2 = randomUUID() as UUID;
    const sessionId3 = randomUUID() as UUID;
    const sessionId4 = randomUUID() as UUID;

    // Create the fallback folders and files
    const fallbackCodexProjectDir = join(tempCodexDir, 'projects', sanitizePath(originalCwd));
    await mkdir(fallbackCodexProjectDir, { recursive: true });
    const file1 = join(fallbackCodexProjectDir, `${sessionId1}.jsonl`);
    await writeFile(file1, 'test');

    const fallbackOpencodeProjectDir = join(tempOpencodeDir, 'projects', sanitizePath(originalCwd));
    await mkdir(fallbackOpencodeProjectDir, { recursive: true });
    const file2 = join(fallbackOpencodeProjectDir, `${sessionId2}.jsonl`);
    await writeFile(file2, 'test');

    const fallbackClaudeProjectDir = join(tempClaudeDir, 'projects', sanitizePath(originalCwd));
    await mkdir(fallbackClaudeProjectDir, { recursive: true });
    const file3 = join(fallbackClaudeProjectDir, `${sessionId3}.jsonl`);
    await writeFile(file3, 'test');

    const fallbackGeminiProjectDir = join(tempGeminiDir, 'projects', sanitizePath(originalCwd));
    await mkdir(fallbackGeminiProjectDir, { recursive: true });
    const file4 = join(fallbackGeminiProjectDir, `${sessionId4}.jsonl`);
    await writeFile(file4, 'test');

    try {
      expect(getTranscriptPathForSession(sessionId1)).toBe(file1);
      expect(getTranscriptPathForSession(sessionId2)).toBe(file2);
      expect(getTranscriptPathForSession(sessionId3)).toBe(file3);
      expect(getTranscriptPathForSession(sessionId4)).toBe(file4);
    } finally {
      // Clean up directories
      await rm(tempCodexDir, { recursive: true, force: true });
      await rm(tempOpencodeDir, { recursive: true, force: true });
      await rm(tempClaudeDir, { recursive: true, force: true });
      await rm(tempGeminiDir, { recursive: true, force: true });
      await rm(tempClewDir, { recursive: true, force: true });

      // Restore env vars
      const envRestorers = [
        { name: 'CODEX_CONFIG_DIR', val: oldCodexEnv },
        { name: 'OPENCODE_CONFIG_DIR', val: oldOpencodeEnv },
        { name: 'CLAUDE_CONFIG_DIR', val: oldClaudeEnv },
        { name: 'GEMINI_CONFIG_DIR', val: oldGeminiEnv },
        { name: 'CLEW_CONFIG_DIR', val: oldClewEnv },
      ];
      for (const r of envRestorers) {
        if (r.val !== undefined) {
          process.env[r.name] = r.val;
        } else {
          delete process.env[r.name];
        }
      }
      resetStateForTests();
    }
  });
});
