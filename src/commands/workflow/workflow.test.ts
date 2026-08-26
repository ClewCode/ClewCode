import { describe, expect, it } from 'bun:test';
import { call } from './workflow.js';

describe('/workflow slash command', () => {
  it('shows usage for invalid verbs', async () => {
    const res = await call('unknown-action', {} as any);
    expect(res.type).toBe('text');
    if (res.type === 'text') {
      expect(res.value).toContain('Usage:');
      expect(res.value).toContain('/workflow show');
    }
  });

  it('validates missing runId for show, resume, and cancel', async () => {
    const showRes = await call('show', {} as any);
    expect(showRes.type === 'text' && showRes.value).toBe('Usage: /workflow show <runId>');

    const resumeRes = await call('resume', {} as any);
    expect(resumeRes.type === 'text' && resumeRes.value).toBe('Usage: /workflow resume <runId>');

    const cancelRes = await call('cancel', {} as any);
    expect(cancelRes.type === 'text' && cancelRes.value).toBe('Usage: /workflow cancel <runId>');
  });

  it('lists workflow runs without crashing', async () => {
    const res = await call('list', {} as any);
    expect(res.type).toBe('text');
    if (res.type === 'text') {
      expect(res.value).toBeDefined();
    }
  });
});
