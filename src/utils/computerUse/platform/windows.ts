/**
 * Windows PlatformAdapter — uses PowerShell for screenshot, mouse, keyboard.
 * No native addon dependencies required.
 */

import { logForDebugging } from '../../debug.js';
import { errorMessage } from '../../errors.js';
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
import { toBase64Jpeg } from './adapter.js';

// PowerShell snippet: capture screen as JPEG base64
const SCREENSHOT_SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$ms = New-Object IO.MemoryStream
$bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
$ms.Close()
$g.Dispose()
$bmp.Dispose()
[Convert]::ToBase64String($ms.ToArray())
`;

// PowerShell snippet: get cursor position
const CURSOR_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$p = [Windows.Forms.Cursor]::Position
Write-Output "$($p.X),$($p.Y)"
`;

// PowerShell snippet: move mouse
function mouseMoveScript(x: number, y: number): string {
  return `
Add-Type -AssemblyName System.Windows.Forms
[Windows.Forms.Cursor]::Position = New-Object Drawing.Point(${x}, ${y})
`;
}

// PowerShell C# user32 for mouse click + keyboard + scroll
const USER32_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class User32 {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern short VkKeyScan(char ch);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint MOUSEEVENTF_HWHEEL = 0x1000;

  public const uint KEYEVENTF_KEYDOWN = 0x0000;
  public const uint KEYEVENTF_KEYUP = 0x0002;
}
"@
`;

function clickScript(button: MouseButton, count: ClickCount): string {
  const [down, up] =
    button === 'left'
      ? ['MOUSEEVENTF_LEFTDOWN', 'MOUSEEVENTF_LEFTUP']
      : button === 'right'
        ? ['MOUSEEVENTF_RIGHTDOWN', 'MOUSEEVENTF_RIGHTUP']
        : ['MOUSEEVENTF_MIDDLEDOWN', 'MOUSEEVENTF_MIDDLEUP'];

  const clicks: string[] = [];
  for (let i = 0; i < count; i++) {
    clicks.push(`[User32]::mouse_event([User32]::${down}, 0, 0, 0, 0)`);
    clicks.push(`[User32]::mouse_event([User32]::${up}, 0, 0, 0, 0)`);
  }
  return `${USER32_SCRIPT}\n${clicks.join('\n')}`;
}

const SCROLL_SCRIPT = `
${USER32_SCRIPT}
$dy = [int]$args[0]
[User32]::mouse_event([User32]::MOUSEEVENTF_WHEEL, 0, 0, $dy, 0)
`;

// Simple VK mapping for common special keys
const SPECIAL_KEYS: Record<string, string> = {
  enter: '0x0D',
  return: '0x0D',
  tab: '0x09',
  escape: '0x1B',
  esc: '0x1B',
  backspace: '0x08',
  delete: '0x2E',
  space: '0x20',
  up: '0x26',
  down: '0x28',
  left: '0x25',
  right: '0x27',
  home: '0x24',
  end: '0x23',
  pageup: '0x21',
  pagedown: '0x22',
  shift: '0x10',
  ctrl: '0x11',
  control: '0x11',
  alt: '0x12',
  command: '0x11', // mapped to Ctrl on Windows
  meta: '0x5B', // Windows key
  capslock: '0x14',
  f1: '0x70',
  f2: '0x71',
  f3: '0x72',
  f4: '0x73',
  f5: '0x74',
  f6: '0x75',
  f7: '0x76',
  f8: '0x77',
  f9: '0x78',
  f10: '0x79',
  f11: '0x7A',
  f12: '0x7B',
};

function toVk(key: string): string {
  const lower = key.toLowerCase();
  if (SPECIAL_KEYS[lower]) return SPECIAL_KEYS[lower];
  if (lower.length === 1) {
    const c = lower.charCodeAt(0);
    // Letters A-Z → 0x41-0x5A, digits 0-9 → 0x30-0x39
    if (c >= 97 && c <= 122) return `0x${(c - 32).toString(16)}`; // uppercase
    if (c >= 48 && c <= 57) return `0x${c.toString(16)}`; // digit
    return `[User32]::VkKeyScan('${key}')`;
  }
  return `0x${lower.charCodeAt(0).toString(16)}`;
}

function keyScript(sequence: string): string {
  const parts = sequence.split('+').filter(p => p.length > 0);
  if (parts.length === 0) return '';

  // Modifier keys (pressed in order, released in reverse)
  const modifierKeys = ['ctrl', 'control', 'shift', 'alt', 'command', 'meta'];
  const mods = parts.slice(0, -1).filter(p => modifierKeys.includes(p.toLowerCase()));
  const mainKey = parts[parts.length - 1];

  const lines: string[] = [USER32_SCRIPT];

  // Press modifiers
  for (const mod of mods) {
    lines.push(`[User32]::keybd_event(${toVk(mod)}, 0, [User32]::KEYEVENTF_KEYDOWN, 0)`);
  }

  // Press + release main key
  const vk = toVk(mainKey);
  lines.push(`[User32]::keybd_event(${vk}, 0, [User32]::KEYEVENTF_KEYDOWN, 0)`);
  lines.push(`[User32]::keybd_event(${vk}, 0, [User32]::KEYEVENTF_KEYUP, 0)`);

  // Release modifiers in reverse
  for (let i = mods.length - 1; i >= 0; i--) {
    lines.push(`[User32]::keybd_event(${toVk(mods[i]!)}, 0, [User32]::KEYEVENTF_KEYUP, 0)`);
  }

  return lines.join('\n');
}

/**
 * Run a PowerShell command and return stdout.
 */
async function ps(script: string): Promise<string> {
  const result = await execFileNoThrow('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    useCwd: false,
  });
  if (result.code !== 0) {
    throw new Error(`PowerShell failed (exit ${result.code}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export function createWindowsAdapter(): PlatformAdapter {
  return {
    platform: 'win32',

    // ── Display ──────────────────────────────────────────────────────────

    async screenshot(): Promise<ScreenshotResult> {
      const base64 = await ps(SCREENSHOT_SCRIPT);
      const buffer = Buffer.from(base64.trim(), 'base64');
      return toBase64Jpeg(buffer);
    },

    async getDisplaySize(): Promise<DisplayGeometry> {
      const output = await ps(`
Add-Type -AssemblyName System.Windows.Forms
$b = [Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output "$($b.Width),$($b.Height)"
`);
      const [w, h] = output.trim().split(',').map(Number);
      return { width: w, height: h, scaleFactor: 1 };
    },

    async listDisplays(): Promise<DisplayGeometry[]> {
      const output = await ps(`
Add-Type -AssemblyName System.Windows.Forms
[Windows.Forms.Screen]::AllScreens | ForEach-Object {
  Write-Output "$($_.Bounds.Width),$($_.Bounds.Height),$($_.DeviceName)"
}
`);
      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [w, h, name] = line.split(',');
          return { width: Number(w), height: Number(h), scaleFactor: 1, name };
        });
    },

    // ── Mouse ────────────────────────────────────────────────────────────

    async mouseMove(x: number, y: number): Promise<void> {
      await ps(mouseMoveScript(x, y));
    },

    async mouseClick(button: MouseButton, count: ClickCount): Promise<void> {
      await ps(clickScript(button, count));
    },

    async click(x: number, y: number, button: MouseButton, count: ClickCount): Promise<void> {
      await ps(mouseMoveScript(x, y));
      await sleep(50);
      await ps(clickScript(button, count));
    },

    async scroll(dx: number, dy: number): Promise<void> {
      // dy > 0 = scroll up, dy < 0 = scroll down
      // Each wheel tick is 120 units
      if (dy !== 0) {
        await ps(`${SCROLL_SCRIPT}\n${dy > 0 ? 120 : -120}`);
        await sleep(50);
      }
      if (dx !== 0) {
        await ps(
          `${USER32_SCRIPT}\n[User32]::mouse_event([User32]::MOUSEEVENTF_HWHEEL, 0, 0, ${dx > 0 ? 120 : -120}, 0)`,
        );
      }
    },

    async getCursorPosition(): Promise<CursorPosition> {
      const output = await ps(CURSOR_SCRIPT);
      const [x, y] = output.trim().split(',').map(Number);
      return { x, y };
    },

    async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
      await ps(mouseMoveScript(from.x, from.y));
      await sleep(50);
      await ps(clickScript('left', 1));
      await sleep(50);
      await ps(mouseMoveScript(to.x, to.y));
    },

    // ── Keyboard ─────────────────────────────────────────────────────────

    async keyPress(sequence: string): Promise<void> {
      await ps(keyScript(sequence));
    },

    async typeText(text: string): Promise<void> {
      // Use clipboard paste for reliability
      const saved = await this.clipboardRead().catch(() => '');
      try {
        await this.clipboardWrite(text);
        if ((await this.clipboardRead()) === text) {
          await this.keyPress('ctrl+v');
          await sleep(100);
        } else {
          // Fallback: type via VkKeyScan for each character
          for (const char of text) {
            const code = char.charCodeAt(0);
            // Direct keybd_event for printable chars
            if (code >= 0x20 && code <= 0x7e) {
              const shift = /[A-Z!@#$%^&*()_+{}|:"<>?~]/.test(char);
              const script = [USER32_SCRIPT];
              if (shift) script.push(`[User32]::keybd_event(0x10, 0, 0, 0)`); // Shift down
              script.push(`[User32]::keybd_event(0x${code.toString(16)}, 0, 0, 0)`);
              script.push(`[User32]::keybd_event(0x${code.toString(16)}, 0, 2, 0)`);
              if (shift) script.push(`[User32]::keybd_event(0x10, 0, 2, 0)`); // Shift up
              await ps(script.join('\n'));
              await sleep(8);
            }
          }
        }
      } finally {
        if (saved) {
          await this.clipboardWrite(saved).catch(() => {});
        }
      }
    },

    // ── Clipboard ────────────────────────────────────────────────────────

    async clipboardRead(): Promise<string> {
      const output = await ps('Get-Clipboard');
      return output.trim().replace(/\r\n?/g, '\n');
    },

    async clipboardWrite(text: string): Promise<void> {
      // Escape for PowerShell
      const escaped = text.replace(/'/g, "''");
      await ps(`Set-Clipboard -Value '${escaped}'`);
    },
  };
}
