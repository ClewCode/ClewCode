import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, getSession, listSessions, removeSession, clearSessions } from '../ACPSessionManager.js';

describe('ACPSessionManager', () => {
  beforeEach(() => {
    clearSessions();
  });

  it('should create and retrieve a session', () => {
    const session = createSession('test-session-1');
    expect(session.acpSessionId).toBe('test-session-1');
    expect(session.internalSessionId).toContain('acp_test-session-1');

    const retrieved = getSession('test-session-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.acpSessionId).toBe('test-session-1');
  });

  it('should return the same session for duplicate createSession calls', () => {
    const s1 = createSession('dup-session');
    const s2 = createSession('dup-session');
    expect(s1.acpSessionId).toBe(s2.acpSessionId);
    expect(s1.internalSessionId).toBe(s2.internalSessionId);
  });

  it('should list only active sessions', () => {
    createSession('list-test-1');
    createSession('list-test-2');
    const sessions = listSessions();
    expect(sessions.length).toBe(2);
    const ids = sessions.map(s => s.acpSessionId);
    expect(ids).toContain('list-test-1');
    expect(ids).toContain('list-test-2');
  });

  it('should remove a session', () => {
    createSession('remove-test');
    expect(getSession('remove-test')).toBeDefined();
    removeSession('remove-test');
    expect(getSession('remove-test')).toBeUndefined();
  });
});
