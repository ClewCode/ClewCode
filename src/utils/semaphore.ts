/**
 * Counting semaphore with abort support.
 *
 * A real bound *queues* the overflow — it never truncates the work list. Code
 * that caps parallelism by slicing (`items.slice(0, max)`) silently drops the
 * tail; this runs every item, at most `permits` at a time.
 *
 * Keep the critical section tight: hold a permit only across the contended
 * step (a process spawn, a connect), not across the unbounded work that
 * follows. A wedged long-running task holding a permit starves everyone else.
 */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.available = Math.max(1, Math.floor(permits));
  }

  /** Permits not currently held. */
  get free(): number {
    return this.available;
  }

  /** Tasks parked waiting for a permit. */
  get queued(): number {
    return this.waiters.length;
  }

  /**
   * Run `task` once a permit is free, releasing it however `task` settles.
   *
   * When `signal` aborts before the permit is acquired, the task never runs and
   * the returned promise rejects — an aborted caller must not consume a slot.
   */
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        const index = this.waiters.indexOf(grant);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(abortError());
      };
      const grant = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      this.waiters.push(grant);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the permit straight to the next waiter rather than returning it to
      // the pool, so a fresh caller can't jump the queue.
      next();
      return;
    }
    this.available++;
  }
}

function abortError(): Error {
  return new Error('Aborted while waiting for a semaphore permit');
}

/**
 * Run every item through `task`, at most `permits` concurrently, preserving
 * input order in the result array.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  permits: number,
  task: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const semaphore = new Semaphore(permits);
  return Promise.all(items.map((item, index) => semaphore.run(() => task(item, index), signal)));
}
