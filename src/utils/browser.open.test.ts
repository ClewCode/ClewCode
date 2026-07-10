import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const execFileNoThrowMock = mock(async () => ({ stdout: '', stderr: '', code: 0 }));

mock.module('./execFileNoThrow.js', () => ({
  execFileNoThrow: execFileNoThrowMock,
}));

const originalPlatform = process.platform;
const originalBrowserEnv = process.env.BROWSER;

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  delete process.env.BROWSER;
  execFileNoThrowMock.mockClear();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  if (originalBrowserEnv === undefined) {
    delete process.env.BROWSER;
  } else {
    process.env.BROWSER = originalBrowserEnv;
  }
});

describe('openBrowser on Windows', () => {
  test('passes an OAuth URL with ampersands to PowerShell as one quoted argument', async () => {
    const { openBrowser } = await import('./browser.js');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&response_type=code&scope=openid';

    await expect(openBrowser(url)).resolves.toBe(true);
    expect(execFileNoThrowMock.mock.calls[0]?.[0]).toBe('powershell');
    expect(execFileNoThrowMock.mock.calls[0]?.[1]).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process '${url}'`,
    ]);
  });
});
