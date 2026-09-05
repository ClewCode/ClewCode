import { describe, expect, test } from 'bun:test';
import { waitForSnapshotWithTimeout } from './snapshotFallback.js';

describe('waitForSnapshotWithTimeout', () => {
  test('returns a snapshot that resolves before the deadline', async () => {
    let timedOut = false;
    const result = await waitForSnapshotWithTimeout(Promise.resolve('/tmp/snapshot.sh'), 50, () => {
      timedOut = true;
    });

    expect(result).toBe('/tmp/snapshot.sh');
    expect(timedOut).toBe(false);
  });

  test('falls back when snapshot creation never settles', async () => {
    let timedOut = false;
    const never = new Promise<string | undefined>(() => {
      // Intentionally never settles: this models a hung snapshot subprocess.
    });
    const result = await waitForSnapshotWithTimeout(never, 5, () => {
      timedOut = true;
    });

    expect(result).toBeUndefined();
    expect(timedOut).toBe(true);
  });
});
