import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { emitKeypressEvents } from 'node:readline';
import {
  ANSI_BOLD,
  ANSI_CLEAR_SCREEN,
  ANSI_CYAN,
  ANSI_DIM,
  ANSI_GREEN,
  ANSI_HIDE_CURSOR,
  ANSI_RESET,
  ANSI_SHOW_CURSOR,
  ANSI_YELLOW,
} from '../constants/figures.js';
import { isRunningWithBun } from '../utils/bundledMode.js';
import { logForDebugging } from '../utils/debug.js';

export type UpdateChoice = 'update' | 'skip' | 'exit';

type Props = {
  currentVersion: string;
  latestVersion: string;
};

const BAR_WIDTH = 28;
const INPUT_TIMEOUT_MS = 30_000;

/** Render an animated progress bar */
function renderBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const block = '\u2588'; // █
  const dot = '\u2591'; // ░
  return ` ${ANSI_GREEN}${block.repeat(filled)}${dot.repeat(empty)}${ANSI_RESET} ${ANSI_BOLD}${Math.round(percent)}%${ANSI_RESET}`;
}

/** Format install output lines for display: keep last meaningful lines */
function formatOutputLines(lines: string[], maxLines: number = 3): string[] {
  const meaningful = lines.filter(
    l => l.trim() && !l.includes('npm WARN') && !l.startsWith('npm http') && !l.startsWith('npm timing'),
  );
  return meaningful.slice(-maxLines);
}

/**
 * Shows an interactive terminal dialog when an update is available.
 *
 * Layout:
 *
 *   Update Available!
 *   v1.2.3 → v1.3.0
 *
 *   > Update now
 *     Use current version
 *     Exit
 *
 *   ↑↓ navigate · enter confirm · q quit
 */
export async function showUpdateDialog({ currentVersion, latestVersion }: Props): Promise<UpdateChoice> {
  return new Promise<UpdateChoice>(resolve => {
    let selectedIndex = 0;
    let phase: 'menu' | 'installing' | 'done' | 'error' = 'menu';
    let barPercent = 0;
    let installOutput: string[] = [];
    let installError: string | null = null;
    let autoTimeout: ReturnType<typeof setTimeout> | null = null;
    let inputActive = true;

    // ── Terminal setup with error recovery ──────────────────────────────
    function setupInput(): boolean {
      try {
        if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
        emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdout.write(ANSI_HIDE_CURSOR);
        return true;
      } catch (err) {
        logForDebugging(`UpdateDialog: input setup failed: ${err}`);
        return false;
      }
    }

    function cleanup() {
      inputActive = false;
      if (autoTimeout) clearTimeout(autoTimeout);
      try {
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      } catch {
        // ignore cleanup errors
      }
      process.stdout.write(ANSI_SHOW_CURSOR);
      process.stdout.write(ANSI_CLEAR_SCREEN);
    }

    // ── Timeout: auto-skip if user doesn't respond within 30s ──────────
    function startInputTimeout() {
      autoTimeout = setTimeout(() => {
        if (inputActive && phase === 'menu') {
          cleanup();
          resolve('skip');
        }
      }, INPUT_TIMEOUT_MS);
    }

    // ── Draw ──────────────────────────────────────────────────────────────
    function draw() {
      const lines: string[] = [];

      // Title
      const title =
        phase === 'menu'
          ? `${ANSI_BOLD}${ANSI_YELLOW}Update Available!${ANSI_RESET}`
          : phase === 'error'
            ? `${ANSI_BOLD}${ANSI_YELLOW}Update Failed${ANSI_RESET}`
            : `${ANSI_BOLD}${ANSI_CYAN}Updating Clew...${ANSI_RESET}`;
      lines.push(`  ${title}`);

      // Version line
      const versionLine = `${ANSI_DIM}v${currentVersion}${ANSI_RESET} ${ANSI_DIM}→${ANSI_RESET} ${ANSI_GREEN}v${latestVersion}${ANSI_RESET}`;
      lines.push(`  ${versionLine}`);
      lines.push('');

      if (phase === 'menu') {
        const options = ['Update now', 'Use current version', 'Exit'];
        for (let i = 0; i < options.length; i++) {
          const prefix = i === selectedIndex ? `${ANSI_CYAN}>${ANSI_RESET}` : ' ';
          const style = i === selectedIndex ? `${ANSI_BOLD}${options[i]}${ANSI_RESET}` : `${options[i]}`;
          lines.push(`  ${prefix} ${style}`);
        }
        lines.push('');
        lines.push(`  ${ANSI_DIM}↑↓ navigate · enter confirm · q quit${ANSI_RESET}`);
      } else {
        // Show live npm output
        const displayLines = formatOutputLines(installOutput);
        for (const line of displayLines) {
          lines.push(`  ${ANSI_DIM}${line}${ANSI_RESET}`);
        }
        lines.push('');

        // Progress bar
        lines.push(`  ${renderBar(barPercent)}`);

        if (phase === 'done') {
          lines.push('');
          lines.push(`  ${ANSI_GREEN}✓ Update complete! Run "clew" to use v${latestVersion}${ANSI_RESET}`);
        } else if (phase === 'error') {
          lines.push('');
          lines.push(`  ${ANSI_YELLOW}✗ Install failed${ANSI_RESET}`);
          if (installError) {
            // Show a compact error message (first line or truncated)
            const errMsg = installError.split('\n')[0].slice(0, 60);
            lines.push(`  ${ANSI_DIM}${errMsg}${ANSI_RESET}`);
          }
          lines.push('');
          lines.push(`  ${ANSI_DIM}Tip: run "npm install -g ${MACRO.PACKAGE_URL}" manually${ANSI_RESET}`);
        }
      }

      process.stdout.write(ANSI_CLEAR_SCREEN);
      process.stdout.write(lines.join('\n'));
      process.stdout.write('\n');
    }

    // ── Keypress ─────────────────────────────────────────────────────────
    function onKeypress(_str: string, key?: { name?: string; ctrl?: boolean }) {
      if (!key || !inputActive) return;
      if (phase !== 'menu') return;

      if (key.name === 'up' || key.name === 'k') {
        selectedIndex = (selectedIndex - 1 + 3) % 3;
        if (autoTimeout) {
          clearTimeout(autoTimeout);
          startInputTimeout();
        }
        draw();
      } else if (key.name === 'down' || key.name === 'j') {
        selectedIndex = (selectedIndex + 1) % 3;
        if (autoTimeout) {
          clearTimeout(autoTimeout);
          startInputTimeout();
        }
        draw();
      } else if (key.name === 'return' || key.name === 'enter') {
        if (autoTimeout) clearTimeout(autoTimeout);
        if (selectedIndex === 0) {
          startInstall();
        } else if (selectedIndex === 1) {
          cleanup();
          resolve('skip');
        } else {
          cleanup();
          resolve('exit');
        }
      } else if (key.name === 'q' || (key.name === 'c' && key.ctrl)) {
        if (autoTimeout) clearTimeout(autoTimeout);
        cleanup();
        resolve('exit');
      }
    }

    // ── Install with real npm progress ───────────────────────────────
    function startInstall() {
      phase = 'installing';
      barPercent = 0;
      installOutput = [];
      draw();

      const pm = isRunningWithBun() ? 'bun' : 'npm';
      const args = ['install', '-g', MACRO.PACKAGE_URL];
      const child = spawn(pm, args, {
        cwd: homedir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        installOutput = installOutput.concat(text.split('\n').filter(Boolean));
        // Fake progress ramping based on output volume
        barPercent = Math.min(Math.round((installOutput.length / 15) * 90), 90);
        if (barPercent < 5) barPercent = 5;
        draw();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        installOutput = installOutput.concat(text.split('\n').filter(Boolean));
        draw();
      });

      child.on('close', code => {
        const success = code === 0;
        barPercent = success ? 100 : 0;
        if (!success) {
          installError = stderr || 'npm install failed';
          phase = 'error';
          draw();
          setTimeout(() => {
            cleanup();
            resolve('skip');
          }, 3000);
          return;
        }

        // Install succeeded — auto-relaunch immediately
        phase = 'done';
        barPercent = 100;
        draw();

        // Brief pause so the user sees the completion message
        setTimeout(() => {
          cleanup();

          // Spawn new child before exiting so user lands on the new version
          try {
            const child = spawn(process.execPath, process.argv.slice(1), {
              stdio: 'inherit',
              detached: true,
            });
            child.unref();
          } catch {
            // relaunch spawn failed — user just re-runs manually
          }

          resolve('update');
        }, 800);
      });

      child.on('error', err => {
        installError = err.message;
        phase = 'error';
        barPercent = 0;
        draw();
        setTimeout(() => {
          cleanup();
          resolve('skip');
        }, 3000);
      });
    }

    // ── Bootstrap ────────────────────────────────────────────────────
    if (!setupInput()) {
      // Fallback: no TTY — just log and skip
      resolve('skip');
      return;
    }

    process.stdin.on('keypress', onKeypress);
    startInputTimeout();
    draw();
  });
}
