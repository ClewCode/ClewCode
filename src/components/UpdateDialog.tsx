import { emitKeypressEvents } from 'node:readline';
import { LOADING_BAR_BODY, LOADING_BAR_EMPTY, LOADING_BAR_FILLED } from '../constants/figures.js';
import { installGlobalPackage } from '../utils/autoUpdater.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_SCREEN = '\x1b[2J\x1b[1;1H';

const BAR_WIDTH = 28;

export type UpdateChoice = 'update' | 'skip' | 'exit';

type Props = {
  currentVersion: string;
  latestVersion: string;
};

/** Render an animated progress bar */
function renderBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const bar =
    LOADING_BAR_FILLED.repeat(filled) +
    (filled < BAR_WIDTH ? LOADING_BAR_BODY : '') +
    LOADING_BAR_EMPTY.repeat(Math.max(0, BAR_WIDTH - filled - 1));
  return ` ${GREEN}${bar}${RESET} ${BOLD}${Math.round(percent)}%${RESET}`;
}

function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: standard regex to strip ANSI codes
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=<>]/g, '');
}

function getVisibleLength(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0x2580 && codePoint <= 0x259f) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
function padLineLeft(content: string, width: number, leftMargin: number): string {
  const visibleLen = getVisibleLength(content);
  const padding = Math.max(0, width - visibleLen - leftMargin);
  return ' '.repeat(leftMargin) + content + ' '.repeat(padding);
}

function centerLine(content: string, width: number): string {
  const visibleLen = getVisibleLength(content);
  const totalPadding = Math.max(0, width - visibleLen);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return ' '.repeat(leftPadding) + content + ' '.repeat(rightPadding);
}

/**
 * Shows an interactive terminal dialog when an update is available.
 *
 * Layout optimized for 80-col terminals:
 *
 *   ╔═══════════════════════════════════════════════╗
 *   ║                                               ║
 *   ║               Update Available!               ║
 *   ║                v1.2.3 → v1.3.0                ║
 *   ║                                               ║
 *   ║      > Update now                             ║
 *   ║        Use current version                    ║
 *   ║        Exit                                   ║
 *   ║                                               ║
 *   ║      ↑↓ navigate · enter confirm · q quit     ║
 *   ╚═══════════════════════════════════════════════╝
 */
export async function showUpdateDialog({ currentVersion, latestVersion }: Props): Promise<UpdateChoice> {
  return new Promise<UpdateChoice>(resolve => {
    let selectedIndex = 0;
    let phase: 'menu' | 'installing' = 'menu';
    let barPercent = 0;
    let installTimer: ReturnType<typeof setInterval> | null = null;

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve('skip');
      return;
    }

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(HIDE_CURSOR);

    function cleanup() {
      if (installTimer) clearInterval(installTimer);
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
      process.stdout.write(CLEAR_SCREEN);
    }

    function draw() {
      const lines: string[] = [];
      const contentWidth = 46;

      // Top border (46 ═ chars)
      lines.push(`  ╔${'═'.repeat(contentWidth)}╗`);
      lines.push(`  ║${' '.repeat(contentWidth)}║`);

      // Title line
      const title =
        phase === 'menu' ? `${BOLD}${YELLOW}Update Available!${RESET}` : `${BOLD}${CYAN}Updating Clew...${RESET}`;
      lines.push(`  ║${centerLine(title, contentWidth)}║`);

      // Version line
      const versionLine = `${DIM}v${currentVersion}${RESET} ${DIM}→${RESET} ${GREEN}v${latestVersion}${RESET}`;
      lines.push(`  ║${centerLine(versionLine, contentWidth)}║`);

      lines.push(`  ║${' '.repeat(contentWidth)}║`);

      if (phase === 'menu') {
        const options = ['Update now', 'Use current version', 'Exit'];
        for (let i = 0; i < options.length; i++) {
          const prefix = i === selectedIndex ? `${CYAN}>${RESET}` : ' ';
          const style = i === selectedIndex ? `${BOLD}${options[i]}${RESET}` : `${options[i]}`;
          lines.push(`  ║${padLineLeft(`${prefix} ${style}`, contentWidth, 6)}║`);
        }
        lines.push(`  ║${' '.repeat(contentWidth)}║`);
        lines.push(`  ║${centerLine(`${DIM}↑↓ navigate · enter confirm · q quit${RESET}`, contentWidth)}║`);
      } else {
        lines.push(`  ║${centerLine(`${DIM}npm install -g ${MACRO.PACKAGE_URL}${RESET}`, contentWidth)}║`);
        lines.push(`  ║${' '.repeat(contentWidth)}║`);
        lines.push(`  ║${centerLine(renderBar(barPercent), contentWidth)}║`);
        lines.push(`  ║${' '.repeat(contentWidth)}║`);

        if (barPercent >= 100) {
          lines.push(`  ║${centerLine(`${GREEN}✓ Update complete!${RESET}`, contentWidth)}║`);
        } else {
          lines.push(`  ║${centerLine(`${DIM}Please wait...${RESET}`, contentWidth)}║`);
        }
      }

      lines.push(`  ║${' '.repeat(contentWidth)}║`);
      lines.push(`  ╚${'═'.repeat(contentWidth)}╝`);

      process.stdout.write(CLEAR_SCREEN);
      process.stdout.write(lines.join('\n'));
      process.stdout.write('\n');
    }

    // Keypress handler
    function onKeypress(_str: string, key?: { name?: string; ctrl?: boolean }) {
      if (!key) return;
      if (phase === 'installing') return;

      if (key.name === 'up' || key.name === 'k') {
        selectedIndex = (selectedIndex - 1 + 3) % 3;
        draw();
      } else if (key.name === 'down' || key.name === 'j') {
        selectedIndex = (selectedIndex + 1) % 3;
        draw();
      } else if (key.name === 'return' || key.name === 'enter') {
        if (selectedIndex === 0) {
          // Update
          phase = 'installing';
          barPercent = 3;
          draw();

          // Animate fake progress 0→90% while install runs
          installTimer = setInterval(() => {
            barPercent = Math.min(barPercent + Math.random() * 7, 90);
            draw();
          }, 350);

          installGlobalPackage(latestVersion)
            .then(status => {
              if (installTimer) clearInterval(installTimer);
              barPercent = 100;
              draw();
              setTimeout(() => {
                cleanup();
                resolve(status === 'success' ? 'update' : 'skip');
              }, 1200);
            })
            .catch(() => {
              if (installTimer) clearInterval(installTimer);
              barPercent = 100;
              draw();
              setTimeout(() => {
                cleanup();
                resolve('skip');
              }, 1200);
            });
        } else if (selectedIndex === 1) {
          cleanup();
          resolve('skip');
        } else {
          cleanup();
          resolve('exit');
        }
      } else if (key.name === 'q' || (key.name === 'c' && key.ctrl)) {
        cleanup();
        resolve('exit');
      }
    }

    process.stdin.on('keypress', onKeypress);
    draw();
  });
}
