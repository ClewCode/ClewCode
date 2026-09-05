/**
 * Resolve a shell snapshot if it becomes ready before the deadline. When the
 * deadline wins, resolve to undefined so callers can continue with login-shell
 * initialization instead of waiting forever on snapshot creation.
 */
export function waitForSnapshotWithTimeout(
  snapshotPromise: Promise<string | undefined>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout();
      } finally {
        resolve(undefined);
      }
    }, timeoutMs);

    void snapshotPromise.then(
      snapshotPath => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(snapshotPath);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
