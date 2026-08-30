/**
 * A promise-chain mutex used by the pane backends to serialize pane creation.
 *
 * Spawning teammates in parallel races on terminal state (which pane is
 * "active", which split just appeared), so each backend funnels its creation
 * calls through one of these. It is a factory rather than a shared singleton
 * on purpose: iTerm and tmux must hold independent locks, so one backend's
 * pane creation never waits on the other's.
 */

/**
 * Create an independent sequential lock. `acquire()` resolves once the
 * previous holder has released, and yields the release function for this
 * holder — which must be called (typically in a `finally`) or the lock is
 * held forever.
 */
export function createSequentialLock(): { acquire: () => Promise<() => void> } {
  let tail: Promise<void> = Promise.resolve();

  return {
    acquire(): Promise<() => void> {
      let release: () => void;
      const next = new Promise<void>(resolve => {
        release = resolve;
      });

      const previous = tail;
      tail = next;

      return previous.then(() => release!);
    },
  };
}
