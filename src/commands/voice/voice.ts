import { createServer } from 'http';
import { speechPageHtml } from '../../services/voiceInput/speechPage.js';

let activeServer: { server: ReturnType<typeof createServer>; url: string; transcript: string } | null = null;

/**
 * `/voice` command — captures speech via browser Web Speech API.
 *
 *   /voice            — start server, show URL (non-blocking)
 *   /voice check      — get transcript (auto-submits if ready)
 *   /voice stop       — stop the server
 */
export const call: import('../../types/command.js').LocalCommandCall = async args => {
  const cmd = args?.toLowerCase().trim() ?? '';

  if (cmd === 'stop' || cmd === 'off') {
    activeServer?.server.close();
    activeServer = null;
    return { type: 'text' as const, value: 'Voice server stopped.' };
  }

  if (cmd === 'check') {
    if (!activeServer) return { type: 'text' as const, value: 'No voice server. Run /voice first.' };
    if (activeServer.transcript) {
      const t = activeServer.transcript;
      activeServer.server.close();
      activeServer = null;
      return { type: 'text' as const, value: t };
    }
    return { type: 'text' as const, value: 'No transcript yet — speak in the browser and click "ส่ง"' };
  }

  // Start or reuse server
  if (activeServer) {
    return {
      type: 'text' as const,
      value: `Voice server already running.\nOpen ${activeServer.url} in Chrome\nThen run /voice check`,
    };
  }

  return new Promise(resolve => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const p = u.pathname;

      if (p === '/' || p === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(speechPageHtml('th-TH'));
        return;
      }

      if (p === '/result' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.text && activeServer) activeServer.transcript = data.text;
          } catch {
            /* ignore */
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }

      if (p === '/check') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ text: activeServer?.transcript ?? '', done: (activeServer?.transcript?.length ?? 0) > 0 }),
        );
        return;
      }

      if (p === '/closed') {
        res.writeHead(200);
        res.end('ok');
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        resolve({ type: 'text' as const, value: 'Voice server failed.' });
        return;
      }
      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;
      activeServer = { server, url, transcript: '' };

      import('open')
        .then(({ default: open }) =>
          open(url).catch(() => {
            /* noop */
          }),
        )
        .catch(() => {
          /* noop */
        });

      resolve({
        type: 'text' as const,
        value: `Voice ready!\n\nOpen this URL in Chrome:\n${url}\n\nSpeak and click "ส่ง"\nThen run /voice check to submit`,
      });
    });
  });
};
