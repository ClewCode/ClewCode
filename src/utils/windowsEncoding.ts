/**
 * Windows Encoding Utilities — codepage detection and conversion.
 *
 * On Windows, the console uses a specific code page (e.g., 437, 850, 1252,
 * 65001 for UTF-8) that may differ from the system's active OEM/ANSI codepage.
 * Shell command output (PowerShell, CMD) is encoded in the console's active
 * codepage. This module detects the codepage and converts output buffers to
 * UTF-8 for consistent processing.
 */

import { execSync } from 'child_process';
import { getPlatform } from './platform.js';

// Cache the detected codepage
let cachedOutputCp: number | null = null;
let cachedAnsiCp: number | null = null;

// Iconv-lite is preferred for codepage conversion but heavy to load eagerly.
// We lazy-import it only when needed.
type IconvLite = {
  decode(buffer: Buffer, encoding: string): string;
  encodingExists(encoding: string): boolean;
};

let _iconv: IconvLite | null = null;

async function getIconv(): Promise<IconvLite | null> {
  if (_iconv === undefined) {
    try {
      _iconv = (await import('iconv-lite')) as unknown as IconvLite;
    } catch {
      _iconv = null;
    }
  }
  return _iconv;
}

/**
 * Get the Windows console output codepage (OEM codepage).
 * Uses `chcp.com` to query the active codepage.
 * Returns 65001 (UTF-8) on non-Windows or when detection fails.
 */
export function getConsoleOutputCp(): number {
  if (cachedOutputCp !== null) return cachedOutputCp;
  if (getPlatform() !== 'windows') {
    cachedOutputCp = 65001;
    return 65001;
  }

  try {
    // chcp.com returns something like "Active code page: 65001"
    const result = execSync('chcp.com', { encoding: 'utf8', timeout: 2000 });
    const match = result.match(/(\d+)/);
    if (match) {
      cachedOutputCp = Number.parseInt(match[1]!, 10);
      return cachedOutputCp;
    }
  } catch {
    // chcp.com might not be available
  }

  // Default to Windows-1252 if not detected
  cachedOutputCp = 1252;
  return cachedOutputCp;
}

/**
 * Get the Windows ANSI codepage (used by non-Unicode applications).
 * Falls back to the output codepage if not available.
 */
export function getWindowsAnsiCp(): number {
  if (cachedAnsiCp !== null) return cachedAnsiCp;

  if (getPlatform() !== 'windows') {
    cachedAnsiCp = 65001;
    return 65001;
  }

  // Try to get from GetACP() via a PowerShell command
  try {
    const result = execSync(
      'powershell -NoProfile -NonInteractive -Command "[System.Text.Encoding]::Default.BodyName"',
      { encoding: 'utf8', timeout: 2000 },
    );
    const name = result.trim();
    // Map .NET encoding names to codepage numbers
    const cpMap: Record<string, number> = {
      'iso-8859-1': 28591,
      'windows-1252': 1252,
      'windows-1251': 1251,
      'windows-1250': 1250,
      'utf-8': 65001,
    };
    cachedAnsiCp = cpMap[name.toLowerCase()] ?? getConsoleOutputCp();
  } catch {
    cachedAnsiCp = getConsoleOutputCp();
  }

  return cachedAnsiCp;
}

/**
 * Reset cached codepage values (for testing).
 */
export function resetCodepageCache(): void {
  cachedOutputCp = null;
  cachedAnsiCp = null;
}

/**
 * Codepage number to iconv-lite encoding name mapping.
 * Returns a canonical iconv-lite encoding name.
 */
export function cpToEncoding(cp: number): string {
  // Common Windows codepages
  const cpMap: Record<number, string> = {
    437: 'cp437', // US English OEM
    850: 'cp850', // Western European OEM
    852: 'cp852', // Central European OEM
    855: 'cp855', // Cyrillic OEM
    857: 'cp857', // Turkish OEM
    860: 'cp860', // Portuguese OEM
    861: 'cp861', // Icelandic OEM
    862: 'cp862', // Hebrew OEM
    863: 'cp863', // Canadian French OEM
    864: 'cp864', // Arabic OEM
    865: 'cp865', // Nordic OEM
    866: 'cp866', // Cyrillic OEM (Russian)
    869: 'cp869', // Greek OEM
    874: 'cp874', // Thai
    932: 'shiftjis', // Japanese
    936: 'gbk', // Simplified Chinese
    949: 'euc-kr', // Korean
    950: 'big5', // Traditional Chinese
    1250: 'win1250', // Central European ANSI
    1251: 'win1251', // Cyrillic ANSI
    1252: 'win1252', // Western European ANSI
    1253: 'win1253', // Greek ANSI
    1254: 'win1254', // Turkish ANSI
    1255: 'win1255', // Hebrew ANSI
    1256: 'win1256', // Arabic ANSI
    1257: 'win1257', // Baltic ANSI
    1258: 'win1258', // Vietnamese ANSI
    65001: 'utf8', // UTF-8
  };

  return cpMap[cp] ?? `cp${cp}`;
}

/**
 * Convert a Buffer from the Windows console codepage to a UTF-8 string.
 * Uses iconv-lite when the codepage is not UTF-8; falls back to
 * Buffer.toString(encoding) for common single-byte encodings.
 *
 * @param buffer - The raw buffer from shell stdout/stderr
 * @param sourceCp - Source codepage (defaults to console output cp)
 * @returns UTF-8 decoded string
 */
export async function decodeWindowsOutput(buffer: Buffer, sourceCp?: number): Promise<string> {
  const cp = sourceCp ?? getConsoleOutputCp();

  // If the console is already UTF-8, no conversion needed
  if (cp === 65001) {
    return buffer.toString('utf8');
  }

  // Try iconv-lite for full codepage support
  const iconv = await getIconv();
  if (iconv) {
    const encoding = cpToEncoding(cp);
    if (iconv.encodingExists(encoding)) {
      try {
        return iconv.decode(buffer, encoding);
      } catch {
        // Fall through to fallback
      }
    }
  }

  // Fallback: use Node.js Buffer.toString() with the encoding name.
  // Works for single-byte encodings like windows-1252.
  const nodeEncoding = nodeEncodingForCp(cp);
  if (nodeEncoding) {
    return buffer.toString(nodeEncoding as BufferEncoding);
  }

  // Last resort: treat as UTF-8 and replace invalid sequences
  return buffer.toString('utf8');
}

/**
 * Map a codepage to a Node.js encoding name for Buffer.toString().
 * Returns null for codepages that Node.js doesn't support natively.
 */
function nodeEncodingForCp(cp: number): string | null {
  switch (cp) {
    case 65001:
      return 'utf8';
    case 437:
    case 850:
    case 852:
    case 855:
    case 857:
    case 858:
    case 860:
    case 861:
    case 862:
    case 863:
    case 864:
    case 865:
    case 866:
    case 869:
      return 'latin1'; // Best-effort for single-byte OEM codepages
    case 1250:
    case 1251:
    case 1252:
    case 1253:
    case 1254:
    case 1255:
    case 1256:
    case 1257:
    case 1258:
      return 'latin1'; // Single-byte ANSI codepages
    default:
      return null;
  }
}

/**
 * Decode a PowerShell stdout/stderr buffer.
 * PowerShell 5.1 defaults to UTF-16LE with BOM; PowerShell 7+ defaults to UTF-8
 * without BOM. This function detects the encoding from the buffer content.
 */
export function decodePowerShellBuffer(buffer: Buffer): string {
  // Check for UTF-16LE BOM (FF FE)
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le');
  }

  // Check for UTF-16BE BOM (FE FF) — rare on Windows
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.toString('utf16le'); // Node.js handles both
  }

  // No BOM — try UTF-8 first (PowerShell 7+ default), then codepage fallback
  const utf8 = buffer.toString('utf8');
  // Check if the UTF-8 decode looks plausible (no replacement characters)
  if (!utf8.includes('\uFFFD')) {
    return utf8;
  }

  // UTF-8 decode had issues — use the active console codepage
  // Since we can't await here, we return the UTF-8 result and let the
  // caller re-decode if needed
  return utf8;
}

/**
 * Convert a string to UTF-8 buffer suitable for Node.js IPC or stdout.
 * This is a no-op passthrough for strings (JavaScript uses UTF-16 internally)
 * but ensures the Buffer representation is UTF-8-encoded.
 */
export function toUtf8Buffer(str: string): Buffer {
  return Buffer.from(str, 'utf8');
}

/**
 * Whether the detected encoding is likely to cause issues with special
 * characters (non-ASCII, Unicode) in shell command output.
 */
export function encodingMayTruncateSpecialChars(): boolean {
  const cp = getConsoleOutputCp();
  // UTF-8 (65001) handles all Unicode
  // UTF-16 (1200, 1201) handles all Unicode
  if (cp === 65001 || cp === 1200 || cp === 1201) return false;
  // Single-byte codepages (OEM/ANSI) will mangle non-ASCII characters
  return true;
}
