/**
 * Voice input server — serves the SpeechRecognition HTML page via localhost
 * and returns the transcript through the page title mechanism.
 *
 * The browser page sets document.title to the transcript when done,
 * and the server reads it via a simple polling approach.
 */
import { createServer } from 'http';
import { speechPageHtml } from './speechPage.js';

const POLL_MAX_RETRIES = 300; // 5 minutes at 1s intervals
const POLL_INTERVAL_MS = 1000;

type VoiceInputResult = {
  text: string;
  cancelled: boolean;
};

/**
 * Start a local HTTP server that serves the speech recognition page,
 * open it in the user's default browser, and wait for the result.
 *
 * The page communicates back by updating its document.title.
 */
export async function captureVoiceInput(lang = 'en-US'): Promise<VoiceInputResult> {
  return new Promise((resolve, reject) => {
    let transcript = '';
    let pollCount = 0;
    let serverCleanup = false;

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Serve the speech page
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(speechPageHtml(lang));
        return;
      }

      // API endpoint: receive transcript
      if (pathname === '/result' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            transcript = data.text ?? '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            // Don't resolve yet — wait for window close
          } catch {
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
        return;
      }

      // API endpoint: check result
      if (pathname === '/check') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: transcript, done: transcript.length > 0 }));
        return;
      }

      // API endpoint: closed (user closed the window)
      if (pathname === '/closed') {
        serverCleanup = true;
        server.close();
        resolve({ text: transcript, cancelled: transcript.length === 0 });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    // Find an available port
    server.listen(0, '127.0.0.1', async () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;

      // Open in browser — try multiple methods
      process.stderr.write(`\n  ◈ Voice input ready\n  Open this URL in Chrome:\n  ${url}\n\n`);
      try {
        const { default: open } = await import('open');
        await open(url, { app: { name: 'chrome' } });
      } catch {
        try {
          const { default: open } = await import('open');
          await open(url);
        } catch {
          process.stderr.write(`  → Paste the URL above into Chrome to start voice input\n\n`);
        }
      }

      // Poll for result
      const poll = setInterval(async () => {
        if (serverCleanup) {
          clearInterval(poll);
          return;
        }

        pollCount++;
        if (pollCount > POLL_MAX_RETRIES) {
          clearInterval(poll);
          serverCleanup = true;
          server.close();
          resolve({ text: transcript, cancelled: true });
          return;
        }

        try {
          const res = await fetch(`${url}/check`);
          const data = await res.json() as { text: string; done: boolean };
          if (data.done && data.text) {
            transcript = data.text;
          }
        } catch {
          // Server might be closed
        }
      }, POLL_INTERVAL_MS);
    });
  });
}
