import { describe, expect, it } from 'bun:test';
import { call } from './workflow.js';

describe('/workflow slash command', () => {
  it('shows usage for invalid verbs', async () => {
    let resultMessage = '';
    await call(
      result => {
        resultMessage = result ?? '';
      },
      {} as any,
      'unknown-action',
    );

    expect(resultMessage).toContain('Usage:');
    expect(resultMessage).toContain('/workflow show');
  });

  it('validates missing runId for show, resume, and cancel', async () => {
    let showRes = '';
    await call(
      res => {
        showRes = res ?? '';
      },
      {} as any,
      'show',
    );
    expect(showRes).toBe('Usage: /workflow show <runId>');

    let resumeRes = '';
    await call(
      res => {
        resumeRes = res ?? '';
      },
      {} as any,
      'resume',
    );
    expect(resumeRes).toBe('Usage: /workflow resume <runId>');

    let cancelRes = '';
    await call(
      res => {
        cancelRes = res ?? '';
      },
      {} as any,
      'cancel',
    );
    expect(cancelRes).toBe('Usage: /workflow cancel <runId>');
  });

  it('mounts interactive JSX component for empty args or list', async () => {
    let doneCalled = false;
    const jsxNode = await call(
      () => {
        doneCalled = true;
      },
      {} as any,
      '',
    );

    expect(jsxNode).not.toBeNull();
    expect(doneCalled).toBe(false);
  });
});
