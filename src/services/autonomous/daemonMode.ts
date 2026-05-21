/**
 * Daemon Mode — Entry point for 24/7 autonomous agent.
 *
 * This is the script that the Supervisor daemon spawns as a background process.
 * It starts the autonomous agent loop and manages lifecycle with graceful shutdown.
 *
 * Usage:
 *   bun run src/services/autonomous/daemonMode.ts
 *
 * Graceful shutdown sequence (SIGTERM):
 *   1. Stop accepting new tasks
 *   2. Release leases on active tasks (so another daemon can pick them up)
 *   3. Kill worker sessions
 *   4. Flush queue to disk
 *   5. Close file watcher
 *   6. Save final status
 *   7. Exit
 */

import { startLoop, stopLoop } from './agentLoop.js';
import { loadQueue } from './taskQueue.js';

// ─── Signal Handling ──────────────────────────────────────────

let shuttingDown = false;

process.on('SIGTERM', async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[DaemonMode] Received SIGTERM, graceful shutdown...');

  try {
    // Stop the loop — this releases leases, stops workers, closes watcher
    await stopLoop();
    console.log('[DaemonMode] Loop stopped, all workers notified, leases released');
  } catch (err) {
    console.error('[DaemonMode] Error during shutdown:', err);
  }

  process.exit(0);
});

process.on('SIGINT', () => {
  // Ignore Ctrl+C at daemon level — supervisor manages lifecycle
  // This prevents accidental Ctrl+C in parent terminal from killing daemon
});

process.on('SIGQUIT', () => {
  // Force immediate shutdown without graceful sequence
  console.log('[DaemonMode] Received SIGQUIT, immediate exit');
  process.exit(0);
});

// ─── Startup ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[DaemonMode] Starting 24/7 autonomous agent...');
  console.log(`[DaemonMode] PID: ${process.pid}`);
  console.log(`[DaemonMode] CWD: ${process.cwd()}`);
  console.log(`[DaemonMode] Platform: ${process.platform}`);

  // Load task queue on startup — will expire stale leases
  await loadQueue();
  console.log('[DaemonMode] Task queue loaded, stale leases will be expired on loop start');

  // Start the autonomous loop
  await startLoop();
}

main().catch(err => {
  console.error('[DaemonMode] Fatal error:', err);
  process.exit(1);
});
