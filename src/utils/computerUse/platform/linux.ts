/**
 * Linux PlatformAdapter — uses ImageMagick (import) for screenshot,
 * xdotool for mouse/keyboard, xclip for clipboard.
 */

import { mkdtemp, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileNoThrow } from '../../execFileNoThrow.js';
import { sleep } from '../../sleep.js';
import type {
  ClickCount,
  CursorPosition,
  DisplayGeometry,
  MouseButton,
  PlatformAdapter,
  ScreenshotResult,
} from './adapter.js';
import { sanitizeGeometry, toBase64Jpeg } from './adapter.js';

/**
 * Run a CLI tool and return stdout. Throws on failure.
 */
async function run(cmd: string, args: string[], input?: string): Promise<string> {
  const result = await execFileNoThrow(cmd, args, { useCwd: false, input });
  if (result.code !== 0) {
    throw new Error(`${cmd} failed (exit ${result.code}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export function createLinuxAdapter(): PlatformAdapter {
  return {
    platform: 'linux',

    // ── Display ──────────────────────────────────────────────────────────

    async screenshot(): Promise<ScreenshotResult> {
      const tmpDir = await mkdtemp(join(tmpdir(), 'cu-screenshot-'));
      const tmpPath = join(tmpDir, 'screenshot.png');
      try {
        // Try grim first (wlroots), fall back to import (X11/ImageMagick)
        try {
          await run('grim', [tmpPath]);
        } catch {
          await run('import', ['-window', 'root', tmpPath]);
        }
        const { readFile } = await import('node:fs/promises');
        const buffer = await readFile(tmpPath);
        return toBase64Jpeg(buffer);
      } finally {
        await unlink(tmpPath).catch(() => {});
        await import('node:fs/promises').then(fs => fs.rmdir(tmpDir).catch(() => {}));
      }
    },

    async getDisplaySize(): Promise<DisplayGeometry> {
      try {
        const output = await run('xdotool', ['getdisplaygeometry']);
        const [w, h] = output.trim().split(/\s+/).map(Number);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
          return sanitizeGeometry({ width: w, height: h, scaleFactor: 1 });
        }
      } catch {}
      // Try xrandr as fallback
      try {
        const output = await run('xrandr', ['--current']);
        const match = output.match(/(\d+)x(\d+)\s/);
        if (match) {
          return sanitizeGeometry({ width: Number(match[1]), height: Number(match[2]), scaleFactor: 1 });
        }
      } catch {}
      return sanitizeGeometry({});
    },

    async listDisplays(): Promise<DisplayGeometry[]> {
      try {
        const output = await run('xrandr', ['--current']);
        const displays: DisplayGeometry[] = [];
        for (const line of output.split('\n')) {
          const match = line.match(/^(\S+)\s+connected.*?(\d+)x(\d+)\+.*?(\d+)mm/);
          if (match) {
            displays.push({ width: Number(match[2]), height: Number(match[3]), scaleFactor: 1, name: match[1] });
          }
        }
        return displays.length > 0 ? displays : this.getDisplaySize().then(d => [d]);
      } catch {
        return [await this.getDisplaySize()];
      }
    },

    // ── Mouse ────────────────────────────────────────────────────────────
    async mouseDown(): Promise<void> {
      await run('xdotool', ['mousedown', '1']);
    },

    async mouseUp(): Promise<void> {
      await run('xdotool', ['mouseup', '1']);
    },

    async mouseMove(x: number, y: number): Promise<void> {
      await run('xdotool', ['mousemove', String(x), String(y)]);
    },

    async mouseClick(button: MouseButton, count: ClickCount): Promise<void> {
      const btn = button === 'left' ? '1' : button === 'right' ? '3' : '2';
      await run('xdotool', ['click', '--repeat', String(count), btn]);
    },

    async click(x: number, y: number, button: MouseButton, count: ClickCount): Promise<void> {
      const btn = button === 'left' ? '1' : button === 'right' ? '3' : '2';
      await run('xdotool', ['mousemove', String(x), String(y), 'click', '--repeat', String(count), btn]);
    },

    async scroll(dx: number, dy: number): Promise<void> {
      if (dy !== 0) {
        const direction = dy > 0 ? '4' : '5'; // 4=up, 5=down
        await run('xdotool', ['click', '--repeat', String(Math.abs(Math.round(dy / 3))), direction]);
        await sleep(50);
      }
      if (dx !== 0) {
        const direction = dx > 0 ? '7' : '6'; // 6=left, 7=right
        await run('xdotool', ['click', '--repeat', String(Math.abs(Math.round(dx / 3))), direction]);
      }
    },

    async getCursorPosition(): Promise<CursorPosition> {
      const output = await run('xdotool', ['getmouselocation', '--shell']);
      const x = Number(output.match(/X=(\d+)/)?.[1] ?? 0);
      const y = Number(output.match(/Y=(\d+)/)?.[1] ?? 0);
      return { x, y };
    },

    async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
      await run('xdotool', ['mousemove', String(from.x), String(from.y), 'mousedown', '1']);
      await sleep(50);
      await run('xdotool', ['mousemove', String(to.x), String(to.y), 'mouseup', '1']);
    },

    // ── Keyboard ─────────────────────────────────────────────────────────

    async keyPress(sequence: string): Promise<void> {
      await run('xdotool', ['key', sequence]);
    },

    async typeText(text: string): Promise<void> {
      // Use clipboard paste for reliability
      const saved = await this.clipboardRead().catch(() => '');
      try {
        await this.clipboardWrite(text);
        if ((await this.clipboardRead()) === text) {
          await run('xdotool', ['key', 'ctrl+v']);
          await sleep(100);
        } else {
          // Fallback: type directly
          await run('xdotool', ['type', '--delay', '8', text]);
        }
      } finally {
        if (saved) {
          await this.clipboardWrite(saved).catch(() => {});
        }
      }
    },

    async holdKey(sequence: string, durationMs: number): Promise<void> {
      await run('xdotool', ['keydown', sequence]);
      await sleep(durationMs);
      await run('xdotool', ['keyup', sequence]);
    },

    // ── Clipboard ────────────────────────────────────────────────────────

    async clipboardRead(): Promise<string> {
      try {
        // Try wl-clipboard first (Wayland)
        return await run('wl-paste', []);
      } catch {
        // Fall back to xclip (X11)
        return await run('xclip', ['-o', '-selection', 'clipboard']);
      }
    },

    async clipboardWrite(text: string): Promise<void> {
      try {
        // Try wl-clipboard first (Wayland)
        await run('wl-copy', [], text);
      } catch {
        // Fall back to xclip (X11)
        await run('xclip', ['-selection', 'clipboard'], text);
      }
    },

    // ── Window Management ──────────────────────────────────────────────────
    async listWindows(): Promise<Array<{ title: string; x: number; y: number; w: number; h: number }>> {
      try {
        const output = await run('wmctrl', ['-l', '-G']);
        return output
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 7) {
              const x = Number(parts[2]);
              const y = Number(parts[3]);
              const w = Number(parts[4]);
              const h = Number(parts[5]);
              const title = parts.slice(7).join(' ');
              return { title, x, y, w, h };
            }
            return null;
          })
          .filter((w): w is { title: string; x: number; y: number; w: number; h: number } => w !== null);
      } catch {
        return [];
      }
    },

    async focusWindow(query: string): Promise<boolean> {
      try {
        await run('wmctrl', ['-a', query]);
        return true;
      } catch {
        try {
          const winId = (await run('xdotool', ['search', '--name', query])).trim().split('\n')[0];
          if (winId) {
            await run('xdotool', ['windowactivate', winId]);
            return true;
          }
        } catch {}
        return false;
      }
    },
  };
}
