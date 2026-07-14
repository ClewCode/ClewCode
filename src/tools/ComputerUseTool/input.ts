/**
 * Computer Use Tool — Input Control (Windows)
 *
 * Mouse and keyboard control using PowerShell + Win32 API.
 * Uses user32.dll via P/Invoke for mouse control and
 * System.Windows.Forms.SendKeys for keyboard input.
 *
 * No external dependencies — uses built-in Windows APIs.
 * Built from scratch by Dek1MillionToken. No @ant/* dependencies.
 */

import { logForDebugging } from '../../utils/debug.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';

// ── PowerShell Helper ────────────────────────────────────────────────────────

/** Run a PowerShell command and throw on failure */
async function runPS(script: string): Promise<string> {
  const { stdout, code, stderr } = await execFileNoThrow(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { useCwd: false },
  );

  if (code !== 0) {
    const errMsg = stderr || stdout || 'Unknown PowerShell error';
    throw new Error(`PowerShell command failed (exit ${code}): ${errMsg}`);
  }

  return stdout.trim();
}

// ── Win32 Type Definition (loaded once) ──────────────────────────────────────

/**
 * PowerShell snippet that loads Win32 mouse/keyboard functions.
 * This is prepended to scripts that need mouse/keyboard control.
 */
const WIN32_TYPES = `
if (-not ([System.Management.Automation.PSTypeName]'Win32Input').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class Win32Input {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    // Mouse event flags
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint MOUSEEVENTF_HWHEEL = 0x1000;

    // Key event flags
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
'@
}
`;

// ── Mouse Control ────────────────────────────────────────────────────────────

/** Move mouse to absolute screen coordinates */
export async function moveMouse(x: number, y: number): Promise<void> {
  logForDebugging(`[ComputerUse] moveMouse(${x}, ${y})`);
  await runPS(`${WIN32_TYPES}
[Win32Input]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
`);
}

/** Click at coordinates with specified button and count */
export async function clickAt(
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' = 'left',
  count: number = 1,
): Promise<void> {
  logForDebugging(`[ComputerUse] clickAt(${x}, ${y}, ${button}, count=${count})`);

  const downFlag =
    button === 'right'
      ? '[Win32Input]::MOUSEEVENTF_RIGHTDOWN'
      : button === 'middle'
        ? '[Win32Input]::MOUSEEVENTF_MIDDLEDOWN'
        : '[Win32Input]::MOUSEEVENTF_LEFTDOWN';

  const upFlag =
    button === 'right'
      ? '[Win32Input]::MOUSEEVENTF_RIGHTUP'
      : button === 'middle'
        ? '[Win32Input]::MOUSEEVENTF_MIDDLEUP'
        : '[Win32Input]::MOUSEEVENTF_LEFTUP';

  let clickScript = '';
  for (let i = 0; i < count; i++) {
    clickScript += `
[Win32Input]::mouse_event(${downFlag}, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 30
[Win32Input]::mouse_event(${upFlag}, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 50
`;
  }

  await runPS(`${WIN32_TYPES}
[Win32Input]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
${clickScript}
`);
}

/** Mouse button down (left) */
export async function mouseDown(): Promise<void> {
  logForDebugging('[ComputerUse] mouseDown()');
  await runPS(`${WIN32_TYPES}
[Win32Input]::mouse_event([Win32Input]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
`);
}

/** Mouse button up (left) */
export async function mouseUp(): Promise<void> {
  logForDebugging('[ComputerUse] mouseUp()');
  await runPS(`${WIN32_TYPES}
[Win32Input]::mouse_event([Win32Input]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [IntPtr]::Zero)
`);
}

/** Drag from one position to another */
export async function drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  logForDebugging(`[ComputerUse] drag(${from.x},${from.y} → ${to.x},${to.y})`);
  await runPS(`${WIN32_TYPES}
# Move to start
[Win32Input]::SetCursorPos(${Math.round(from.x)}, ${Math.round(from.y)})
Start-Sleep -Milliseconds 100

# Press left button
[Win32Input]::mouse_event([Win32Input]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 100

# Move to end (in steps for smooth drag)
$steps = 10
for ($i = 1; $i -le $steps; $i++) {
    $t = $i / $steps
    $cx = [Math]::Round(${from.x} + (${to.x} - ${from.x}) * $t)
    $cy = [Math]::Round(${from.y} + (${to.y} - ${from.y}) * $t)
    [Win32Input]::SetCursorPos($cx, $cy)
    Start-Sleep -Milliseconds 20
}

# Release
Start-Sleep -Milliseconds 50
[Win32Input]::mouse_event([Win32Input]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [IntPtr]::Zero)
`);
}

/** Scroll at position */
export async function scrollAt(
  x: number,
  y: number,
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number = 3,
): Promise<void> {
  logForDebugging(`[ComputerUse] scroll(${x}, ${y}, ${direction}, ${amount})`);

  const isVertical = direction === 'up' || direction === 'down';
  const flag = isVertical ? '[Win32Input]::MOUSEEVENTF_WHEEL' : '[Win32Input]::MOUSEEVENTF_HWHEEL';
  // Positive = up/right, negative = down/left. Each "click" = 120 units
  const delta = direction === 'up' || direction === 'right' ? 120 * amount : -120 * amount;

  await runPS(`${WIN32_TYPES}
[Win32Input]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
[Win32Input]::mouse_event(${flag}, 0, 0, ${delta}, [IntPtr]::Zero)
`);
}

/** Get current cursor position */
export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  const result = await runPS(`${WIN32_TYPES}
$pt = New-Object Win32Input+POINT
[Win32Input]::GetCursorPos([ref]$pt) | Out-Null
Write-Output "$($pt.X),$($pt.Y)"
`);

  const [x, y] = result.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

// ── Keyboard Control ─────────────────────────────────────────────────────────

/**
 * Virtual key code mapping.
 * Maps human-readable key names to Windows VK codes.
 */
const VK_MAP: Record<string, number> = {
  // Modifiers
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  menu: 0x12,
  shift: 0x10,
  win: 0x5b,
  super: 0x5b,
  command: 0x5b,
  meta: 0x5b,

  // Navigation
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  escape: 0x1b,
  esc: 0x1b,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  page_up: 0x21,
  pagedown: 0x22,
  page_down: 0x22,

  // Arrow keys
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,

  // Function keys
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,

  // Others
  space: 0x20,
  printscreen: 0x2c,
  print_screen: 0x2c,
  capslock: 0x14,
  caps_lock: 0x14,
  numlock: 0x90,
  num_lock: 0x90,
  scrolllock: 0x91,
  scroll_lock: 0x91,
};

/** Get VK code for a key. Single characters use their ASCII code. */
function getVK(key: string): number {
  const lower = key.toLowerCase();
  if (VK_MAP[lower] !== undefined) return VK_MAP[lower]!;

  // Single character → uppercase ASCII
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    // A-Z: 0x41-0x5A, 0-9: 0x30-0x39
    if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a)) {
      return code;
    }
  }

  throw new Error(`Unknown key: "${key}"`);
}

/**
 * Press a key combination like "ctrl+s", "alt+f4", "enter".
 * Splits on "+" and presses all modifiers, then the final key.
 */
export async function pressKey(keyCombo: string): Promise<void> {
  logForDebugging(`[ComputerUse] pressKey("${keyCombo}")`);

  const parts = keyCombo.split('+').map(k => k.trim().toLowerCase());
  const vkCodes = parts.map(k => getVK(k));

  // Build PowerShell script: press all keys down, then release in reverse
  let script = `${WIN32_TYPES}\n`;

  // Press down
  for (const vk of vkCodes) {
    script += `[Win32Input]::keybd_event(${vk}, 0, 0, [IntPtr]::Zero)\n`;
    script += `Start-Sleep -Milliseconds 30\n`;
  }

  // Release in reverse
  for (let i = vkCodes.length - 1; i >= 0; i--) {
    script += `[Win32Input]::keybd_event(${vkCodes[i]}, 0, [Win32Input]::KEYEVENTF_KEYUP, [IntPtr]::Zero)\n`;
    script += `Start-Sleep -Milliseconds 30\n`;
  }

  await runPS(script);
}

/** Hold a key down for a specified duration */
export async function holdKey(keyCombo: string, durationMs: number): Promise<void> {
  logForDebugging(`[ComputerUse] holdKey("${keyCombo}", ${durationMs}ms)`);

  const parts = keyCombo.split('+').map(k => k.trim().toLowerCase());
  const vkCodes = parts.map(k => getVK(k));

  let script = `${WIN32_TYPES}\n`;

  // Press down
  for (const vk of vkCodes) {
    script += `[Win32Input]::keybd_event(${vk}, 0, 0, [IntPtr]::Zero)\n`;
  }

  script += `Start-Sleep -Milliseconds ${durationMs}\n`;

  // Release
  for (let i = vkCodes.length - 1; i >= 0; i--) {
    script += `[Win32Input]::keybd_event(${vkCodes[i]}, 0, [Win32Input]::KEYEVENTF_KEYUP, [IntPtr]::Zero)\n`;
  }

  await runPS(script);
}

/**
 * Type text string.
 * Uses System.Windows.Forms.SendKeys for reliable text input.
 * Special characters are escaped per SendKeys syntax.
 */
export async function typeText(text: string): Promise<void> {
  logForDebugging(`[ComputerUse] typeText("${text.substring(0, 50)}${text.length > 50 ? '...' : ''}")`);

  // For long text, use clipboard paste (faster and more reliable)
  if (text.length > 20) {
    const saved = await readClipboard().catch(() => '');
    try {
      await writeClipboard(text);
      if ((await readClipboard()) === text) {
        await pressKey('ctrl+v');
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Fallback: type character by character
        const escaped = text.replace(/([+^%~{}()])/g, '{$1}');
        await runPS(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
`);
      }
    } finally {
      if (saved) {
        await writeClipboard(saved).catch(() => {
          /* noop */
        });
      }
    }
    return;
  }

  // For short text, use SendKeys with proper escaping
  // SendKeys special chars: +, ^, %, ~, {, }, (, )
  const escaped = text.replace(/([+^%~{}()])/g, '{$1}');

  await runPS(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
`);
}

// ── Clipboard ────────────────────────────────────────────────────────────────

/** Read text from clipboard */
export async function readClipboard(): Promise<string> {
  return runPS('Get-Clipboard');
}

/** Write text to clipboard */
export async function writeClipboard(text: string): Promise<void> {
  await runPS(`Set-Clipboard -Value '${text.replace(/'/g, "''")}'`);
}

// ── Window Management ────────────────────────────────────────────────────────

/** List all visible windows with titles and coordinates */
export async function listWindows(): Promise<Array<{ title: string; x: number; y: number; w: number; h: number }>> {
  logForDebugging('[ComputerUse] listWindows()');
  const script = `${WIN32_TYPES}
$windows = New-Object System.Collections.Generic.List[Object]
$enumProc = [Win32Input+EnumWindowsProc] {
    param($hWnd, $lParam)
    if ([Win32Input]::IsWindowVisible($hWnd)) {
        $sb = New-Object System.Text.StringBuilder 256
        [Win32Input]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
        $title = $sb.ToString()
        if (-not [string]::IsNullOrWhiteSpace($title)) {
            $rect = New-Object Win32Input+RECT
            if ([Win32Input]::GetWindowRect($hWnd, [ref]$rect)) {
                $windows.Add(@{
                    title = $title
                    x = $rect.Left
                    y = $rect.Top
                    w = $rect.Right - $rect.Left
                    h = $rect.Bottom - $rect.Top
                })
            }
        }
    }
    return $true
}
[Win32Input]::EnumWindows($enumProc, [IntPtr]::Zero) | Out-Null
$windows | ConvertTo-Json -Compress
`;
  const result = await runPS(script);
  if (!result) return [];
  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Focus a window by title query */
export async function focusWindow(query: string): Promise<boolean> {
  logForDebugging(`[ComputerUse] focusWindow("${query}")`);
  const script = `${WIN32_TYPES}
$enumProc = [Win32Input+EnumWindowsProc] {
    param($hWnd, $lParam)
    $sb = New-Object System.Text.StringBuilder 256
    [Win32Input]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
    $title = $sb.ToString()
    if ($title -like "*${query.replace(/\*/g, '').replace(/'/g, "''")}*") {
        [Win32Input]::ShowWindow($hWnd, 9) | Out-Null # SW_RESTORE
        [Win32Input]::SetForegroundWindow($hWnd) | Out-Null
        return $false # Stop enumeration
    }
    return $true
}
[Win32Input]::EnumWindows($enumProc, [IntPtr]::Zero) | Out-Null
`;
  await runPS(script);
  return true;
}
