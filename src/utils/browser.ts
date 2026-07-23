import { execFileNoThrow } from './execFileNoThrow.js';

function validateUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  // Validate URL protocol for security
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Invalid URL protocol: must use http:// or https://, got ${parsedUrl.protocol}`);
  }
}

/**
 * Open a file or folder path using the system's default handler.
 * Uses `open` on macOS, `explorer` on Windows, `xdg-open` on Linux.
 */
export async function openPath(path: string): Promise<boolean> {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      const { code } = await execFileNoThrow('explorer', [path]);
      return code === 0;
    }
    const command = platform === 'darwin' ? 'open' : 'xdg-open';
    const { code } = await execFileNoThrow(command, [path]);
    return code === 0;
  } catch (_) {
    return false;
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    // Parse and validate the URL
    validateUrl(url);

    const browserEnv = process.env.BROWSER;
    const platform = process.platform;

    if (platform === 'win32') {
      // Try multiple methods for Windows
      if (browserEnv) {
        // Use specified browser
        const { code } = await execFileNoThrow(browserEnv, [url]);
        if (code === 0) return true;
      }

      // Use Base64 -EncodedCommand in PowerShell so ampersands (&) in query parameters
      // are passed intact without being interpreted as command separators.
      const script = `[System.Diagnostics.Process]::Start('${url.replace(/'/g, "''")}')`;
      const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
      const { code: psCode } = await execFileNoThrow('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodedScript,
      ]);
      if (psCode === 0) return true;

      // Fallback to rundll32 url.dll,FileProtocolHandler
      const { code: rundllCode } = await execFileNoThrow('rundll32', ['url.dll,FileProtocolHandler', url], {});
      if (rundllCode === 0) return true;

      // Fallback to cmd.exe start command
      const cmdEscapedUrl = url.replace(/[\^&<>|()]/g, m => `^${m}`);
      const { code: startCode } = await execFileNoThrow('cmd', ['/c', 'start', '', cmdEscapedUrl]);
      return startCode === 0;
    } else {
      const command = browserEnv || (platform === 'darwin' ? 'open' : 'xdg-open');
      const { code } = await execFileNoThrow(command, [url]);
      return code === 0;
    }
  } catch (error) {
    console.error('Failed to open browser:', error);
    return false;
  }
}
