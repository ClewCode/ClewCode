/**
 * macOS PlatformAdapter — uses screencapture CLI + cliclick for input.
 * Clipboard uses pbcopy/pbpaste (same as the original executor).
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

async function readClipboard(): Promise<string> {
  const { stdout, code } = await execFileNoThrow('pbpaste', [], { useCwd: false });
  if (code !== 0) throw new Error(`pbpaste exited with code ${code}`);
  return stdout;
}

async function writeClipboard(text: string): Promise<void> {
  const { code } = await execFileNoThrow('pbcopy', [], { input: text, useCwd: false });
  if (code !== 0) throw new Error(`pbcopy exited with code ${code}`);
}

export function createDarwinAdapter(): PlatformAdapter {
  return {
    platform: 'darwin',

    // ── Display ──────────────────────────────────────────────────────────

    async screenshot(): Promise<ScreenshotResult> {
      const tmpDir = await mkdtemp(join(tmpdir(), 'cu-screenshot-'));
      const tmpPath = join(tmpDir, 'screenshot.png');
      try {
        await run('screencapture', ['-x', '-C', tmpPath]);
        const { readFile } = await import('node:fs/promises');
        const buffer = await readFile(tmpPath);
        return toBase64Jpeg(buffer);
      } finally {
        await unlink(tmpPath).catch(() => {
          /* noop */
        });
        await import('node:fs/promises').then(fs =>
          fs.rmdir(tmpDir).catch(() => {
            /* noop */
          }),
        );
      }
    },

    async getDisplaySize(): Promise<DisplayGeometry> {
      // screencapture doesn't give display info; use system_profiler
      const output = await run('system_profiler', ['SPDisplaysDataType', '-json']);
      try {
        const info = JSON.parse(output);
        const display = info.SPDisplaysDataType?.[0]?.spdisplays_ndrvs?.[0];
        if (display?._spdisplay_pixels) {
          const [w, h] = display._spdisplay_pixels.split('x').map(Number);
          const scale = display._spdisplay_scale_factor ?? 1;
          return sanitizeGeometry({ width: w, height: h, scaleFactor: Number(scale) });
        }
      } catch {
        /* ignore */
      }
      return sanitizeGeometry({});
    },

    async listDisplays(): Promise<DisplayGeometry[]> {
      // Use CoreGraphics via Swift or fallback to single display
      try {
        const output = await run('system_profiler', ['SPDisplaysDataType', '-json']);
        const info = JSON.parse(output);
        const displays = info.SPDisplaysDataType?.[0]?.spdisplays_ndrvs ?? [];
        return displays.map((d: any, i: number) => {
          const [w, h] = (d._spdisplay_pixels ?? '1920x1080').split('x').map(Number);
          return { width: w, height: h, scaleFactor: Number(d._spdisplay_scale_factor ?? 1), name: d._name, id: i };
        });
      } catch {
        return [{ width: 1920, height: 1080, scaleFactor: 1 }];
      }
    },

    // ── Mouse ────────────────────────────────────────────────────────────

    async mouseDown(): Promise<void> {
      await run('cliclick', ['dd:.']);
    },

    async mouseUp(): Promise<void> {
      await run('cliclick', ['du:.']);
    },

    async mouseMove(x: number, y: number): Promise<void> {
      await run('cliclick', [`m:${x},${y}`]);
    },

    async mouseClick(button: MouseButton, count: ClickCount): Promise<void> {
      const btn = button === 'left' ? 'c' : button === 'right' ? 'rc' : 'dc';
      for (let i = 0; i < count; i++) {
        await run('cliclick', [`${btn}:.`]);
        if (i < count - 1) await sleep(100);
      }
    },

    async click(x: number, y: number, button: MouseButton, count: ClickCount): Promise<void> {
      // cliclick supports click-at: "c:x,y"
      const btn = button === 'left' ? 'c' : button === 'right' ? 'rc' : 'dc';
      for (let i = 0; i < count; i++) {
        await run('cliclick', [`${btn}:${x},${y}`]);
        if (i < count - 1) await sleep(100);
      }
    },

    async scroll(dx: number, dy: number): Promise<void> {
      // cliclick: "w:amount" for vertical scroll
      if (dy !== 0) {
        await run('cliclick', [`w:${Math.round(dy * 3)}`]); // *3 for reasonable scroll amount
        await sleep(50);
      }
      if (dx !== 0) {
        // Horizontal scroll via shift+scroll or multiple calls
        await run('cliclick', [`w:${Math.round(dx * 3)}`]);
      }
    },

    async getCursorPosition(): Promise<CursorPosition> {
      const output = await run('cliclick', ['p']);
      // cliclick returns "x,y"
      const [x, y] = output.trim().split(',').map(Number);
      return { x, y };
    },

    async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
      await run('cliclick', [`dd:${from.x},${from.y}`, `du:${to.x},${to.y}`]);
    },

    // ── Keyboard ─────────────────────────────────────────────────────────

    async keyPress(sequence: string): Promise<void> {
      // cliclick uses "k:key" for key press
      // Convert "ctrl+shift+a" → cliclick "k:ctrl+shift+a"
      await run('cliclick', [`k:${sequence}`]);
    },

    async typeText(text: string): Promise<void> {
      // Use clipboard paste for efficiency (same as original executor)
      const saved = await readClipboard().catch(() => '');
      try {
        await writeClipboard(text);
        if ((await readClipboard()) === text) {
          await run('cliclick', ['k:cmd+v']);
          await sleep(100);
        } else {
          // Fallback: type via cliclick t: (handles special chars poorly)
          // Escape for cliclick: wrap in double quotes, escape inner quotes
          const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
          await run('cliclick', [`t:${escaped}`]);
        }
      } finally {
        if (saved) {
          await writeClipboard(saved).catch(() => {
            /* noop */
          });
        }
      }
    },

    async holdKey(sequence: string, durationMs: number): Promise<void> {
      await run('cliclick', [`kd:${sequence}`]);
      await sleep(durationMs);
      await run('cliclick', [`ku:${sequence}`]);
    },

    // ── Clipboard ────────────────────────────────────────────────────────

    async clipboardRead(): Promise<string> {
      return readClipboard();
    },

    async clipboardWrite(text: string): Promise<void> {
      return writeClipboard(text);
    },

    // ── Window Management ──────────────────────────────────────────────────
    async listWindows(): Promise<Array<{ title: string; x: number; y: number; w: number; h: number }>> {
      const appleScript = `
        tell application "System Events"
          set result to ""
          repeat with p in (every process whose background only is false)
            repeat with w in (every window of p)
              try
                set pos to position of w
                set sz to size of w
                set result to result & (name of p) & " - " & (name of w) & ":::" & (item 1 of pos) & "," & (item 2 of pos) & "," & (item 1 of sz) & "," & (item 2 of sz) & "\\n"
              end try
            end repeat
          end repeat
          return result
        end tell
      `;
      try {
        const output = await run('osascript', ['-e', appleScript]);
        return output
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const [title, coords] = line.split(':::');
            if (!title || !coords) return null;
            const [x, y, w, h] = coords.split(',').map(Number);
            return { title, x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 };
          })
          .filter((w): w is { title: string; x: number; y: number; w: number; h: number } => w !== null);
      } catch {
        return [];
      }
    },

    async focusWindow(query: string): Promise<boolean> {
      const escaped = query.replace(/"/g, '\\"');
      const appleScript = `
        tell application "System Events"
          repeat with p in (every process whose background only is false)
            repeat with w in (every window of p)
              if (name of w contains "${escaped}") or (name of p contains "${escaped}") then
                set frontmost of p to true
                perform action "AXRaise" of w
                return true
              end if
            end repeat
          end repeat
        end tell
      `;
      try {
        await run('osascript', ['-e', appleScript]);
        return true;
      } catch {
        return false;
      }
    },
  };
}
