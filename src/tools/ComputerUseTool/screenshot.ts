/**
 * Computer Use Tool — Screenshot Capture (Windows)
 *
 * Captures the screen using PowerShell + .NET System.Drawing.
 * No external dependencies — uses built-in Windows APIs.
 *
 * Built from scratch by Dek1MillionToken. No @ant/* dependencies.
 */

import { logForDebugging } from '../../utils/debug.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';

// ── Screenshot ───────────────────────────────────────────────────────────────

/**
 * Capture a screenshot of a specific region or the full primary display.
 * Uses PowerShell + System.Drawing (built into Windows).
 *
 * @param region - Optional [x1, y1, x2, y2] region to capture. If omitted, captures full screen.
 */
export async function captureScreenshot(region?: [number, number, number, number]): Promise<{
  base64: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}> {
  const isRegion = !!region;
  const [rx1, ry1, rx2, ry2] = region || [0, 0, 0, 0];

  // PowerShell script that captures, resizes, and base64-encodes the screen
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Capture area
if ($${isRegion}) {
    $sw = ${rx2} - ${rx1}
    $sh = ${ry2} - ${ry1}
    $sx = ${rx1}
    $sy = ${ry1}
} else {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $sw = $screen.Width
    $sh = $screen.Height
    $sx = $screen.X
    $sy = $screen.Y
}

# Calculate scale factor (max 1568px long edge, ~1.15MP)
$longEdge = [Math]::Max($sw, $sh)
$totalPx = $sw * $sh
$leScale = 1568.0 / $longEdge
$tpScale = [Math]::Sqrt(1150000.0 / $totalPx)
$scale = [Math]::Min(1.0, [Math]::Min($leScale, $tpScale))
$tw = [Math]::Round($sw * $scale)
$th = [Math]::Round($sh * $scale)

# Capture screen
$bmp = New-Object System.Drawing.Bitmap($sw, $sh)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($sx, $sy, 0, 0, New-Object System.Drawing.Size($sw, $sh))
$gfx.Dispose()

# Resize for API
$resized = New-Object System.Drawing.Bitmap($tw, $th)
$gfx2 = [System.Drawing.Graphics]::FromImage($resized)
$gfx2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfx2.DrawImage($bmp, 0, 0, $tw, $th)
$gfx2.Dispose()
$bmp.Dispose()

# Encode as JPEG (quality 75)
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 75L)

$ms = New-Object System.IO.MemoryStream
$resized.Save($ms, $encoder, $encoderParams)
$resized.Dispose()

# Output as JSON: { "b64": "...", "w": N, "h": N, "ow": N, "oh": N }
$b64 = [Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()

Write-Output "{\\"w\\":$tw,\\"h\\":$th,\\"ow\\":$sw,\\"oh\\":$sh}"
Write-Output "---BASE64START---"
Write-Output $b64
Write-Output "---BASE64END---"
`;

  const { stdout, code } = await execFileNoThrow(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psScript],
    { useCwd: false },
  );

  if (code !== 0) {
    throw new Error(`Screenshot capture failed (exit code ${code})`);
  }

  // Parse output
  const lines = stdout.split('\n').map((l: string) => l.trim());
  const metaLine = lines.find((l: string) => l.startsWith('{'));
  const b64Start = lines.indexOf('---BASE64START---');
  const b64End = lines.indexOf('---BASE64END---');

  if (!metaLine || b64Start === -1 || b64End === -1) {
    throw new Error('Failed to parse screenshot output');
  }

  const meta = JSON.parse(metaLine);
  const base64 = lines.slice(b64Start + 1, b64End).join('');

  logForDebugging(`[ComputerUse] Screenshot captured: ${meta.ow}x${meta.oh} → ${meta.w}x${meta.h}`);

  return {
    base64,
    width: meta.w,
    height: meta.h,
    originalWidth: meta.ow,
    originalHeight: meta.oh,
  };
}

// ── Display Info ─────────────────────────────────────────────────────────────

/**
 * Get primary display dimensions.
 * Returns raw screen size (before scaling).
 */
export async function getScreenDimensions(): Promise<{
  width: number;
  height: number;
}> {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output "$($s.Width)x$($s.Height)"
`;

  const { stdout, code } = await execFileNoThrow(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psScript],
    { useCwd: false },
  );

  if (code !== 0) {
    // Fallback to common resolution
    return { width: 1920, height: 1080 };
  }

  const match = stdout.trim().match(/(\d+)x(\d+)/);
  if (!match) {
    return { width: 1920, height: 1080 };
  }

  return {
    width: parseInt(match[1]!, 10),
    height: parseInt(match[2]!, 10),
  };
}
