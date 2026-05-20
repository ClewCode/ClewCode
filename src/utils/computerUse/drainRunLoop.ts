import { logForDebugging } from '../debug.js';
import { withResolvers } from '../withResolvers.js';

/**
 * Drain run loop — no-op on cross-platform implementation.
 * The original macOS implementation used CFRunLoop pumping for @MainActor
 * Swift methods. Our PlatformAdapter uses CLI tools which don't need pumping.
 */

let pump: ReturnType<typeof setInterval> | undefined;
let pending = 0;

function drainTick(): void {
  // No-op: CLI tools don't need CFRunLoop pumping
}

function retain(): void {
  pending++;
  if (pump === undefined) {
    pump = setInterval(drainTick, 1);
    logForDebugging('[drainRunLoop] pump started', { level: 'verbose' });
  }
}

function release(): void {
  pending--;
  if (pending <= 0 && pump !== undefined) {
    clearInterval(pump);
    pump = undefined;
    logForDebugging('[drainRunLoop] pump stopped', { level: 'verbose' });
    pending = 0;
  }
}

const TIMEOUT_MS = 30_000;

function timeoutReject(reject: (e: Error) => void): void {
  reject(new Error(`computer-use native call exceeded ${TIMEOUT_MS}ms`));
}

/**
 * Hold a pump reference for the lifetime of a long-lived registration
 * (e.g. the CGEventTap Escape handler). Unlike `drainRunLoop(fn)` this has
 * no timeout — the caller is responsible for calling `releasePump()`. Same
 * refcount as drainRunLoop calls, so nesting is safe.
 */
export const retainPump = retain;
export const releasePump = release;

/**
 * Await `fn()` with the shared drain pump running. Safe to nest — multiple
 * concurrent drainRunLoop() calls share one setInterval.
 */
export async function drainRunLoop<T>(fn: () => Promise<T>): Promise<T> {
  retain();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // If the timeout wins the race, fn()'s promise is orphaned — a late
    // rejection from the native layer would become an unhandledRejection.
    // Attaching a no-op catch swallows it; the timeout error is what surfaces.
    // fn() sits inside try so a synchronous throw (e.g. NAPI argument
    // validation) still reaches release() — otherwise the pump leaks.
    const work = fn();
    work.catch(() => {});
    const timeout = withResolvers<never>();
    timer = setTimeout(timeoutReject, TIMEOUT_MS, timeout.reject);
    return await Promise.race([work, timeout.promise]);
  } finally {
    clearTimeout(timer);
    release();
  }
}
