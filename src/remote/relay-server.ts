#!/usr/bin/env bun
/**
 * Clew Relay Server — WebSocket relay for cross-network remote control.
 *
 * Protocol (JSON over WebSocket):
 *   → { type: "register", role: "listener"|"connector", token: "..." }
 *   ← { type: "paired" }
 *   → { type: "data", payload: "..." }
 *   ← { type: "data", payload: "..." }
 *
 * Usage:
 *   bun run src/remote/relay-server.ts             # Port 8080, auto token
 *   bun run src/remote/relay-server.ts --port 9090 # Custom port
 *   bun run src/remote/relay-server.ts --token xxx # Static auth token
 *
 * Client:
 *   /remote listen --relay ws://host:8080
 *   /remote connect ws://host:8080 --token mysecret
 */

const PORT = parseInt(
  process.argv.find(a => a.startsWith('--port='))?.split('=')[1] ??
    process.argv[process.argv.indexOf('--port') + 1] ??
    '8080',
  10,
);

const STATIC_TOKEN =
  process.argv.find(a => a.startsWith('--token='))?.split('=')[1] ??
  process.argv[process.argv.indexOf('--token') + 1] ??
  `clew-relay-${crypto.randomUUID().slice(0, 8)}`;

const pairs = new Map<string, { listener?: WebSocket; connector?: WebSocket }>();
let pairIdCounter = 0;

console.log(`\n  ◈ Clew Relay Server`);
console.log(`  Port:     ${PORT}`);
console.log(`  Token:    ${STATIC_TOKEN}`);
console.log(`  Connect:  /remote connect ws://<host>:${PORT} --token ${STATIC_TOKEN}\n`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, sessions: pairs.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Clew Relay', { status: 200 });
  },
  websocket: {
    open(ws) {
      // Wait for register message
    },
    message(ws, raw) {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));

        switch (msg.type) {
          case 'register': {
            // Validate token
            if (STATIC_TOKEN && msg.token !== STATIC_TOKEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
              ws.close();
              return;
            }

            const role = msg.role; // 'listener' or 'connector'

            // Try to find or create a pair
            let pair: { listener?: WebSocket; connector?: WebSocket };
            if (role === 'listener') {
              pair = { listener: ws };
              pairs.set(`pair_${++pairIdCounter}`, pair);
            } else {
              // Find a pair waiting for a connector
              const existing = Array.from(pairs.values()).find(p => p.listener && !p.connector);
              if (existing) {
                pair = existing;
                pair.connector = ws;
              } else {
                pair = { connector: ws };
                pairs.set(`pair_${++pairIdCounter}`, pair);
              }
            }

            // Notify both when paired
            if (pair.listener && pair.connector) {
              pair.listener.send(JSON.stringify({ type: 'paired' }));
              pair.connector.send(JSON.stringify({ type: 'paired' }));
              console.log(`  ✓ Pair active (${pairs.size} session${pairs.size === 1 ? '' : 's'})`);
            } else {
              ws.send(JSON.stringify({ type: 'registered', role }));
              console.log(`  ◇ ${role} waiting for peer...`);
            }
            break;
          }

          case 'data': {
            // Forward to the paired peer
            for (const pair of pairs.values()) {
              if (pair.listener === ws && pair.connector) {
                pair.connector.send(JSON.stringify({ type: 'data', payload: msg.payload }));
                return;
              }
              if (pair.connector === ws && pair.listener) {
                pair.listener.send(JSON.stringify({ type: 'data', payload: msg.payload }));
                return;
              }
            }
            break;
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    },
    close(ws) {
      // Clean up pair
      for (const [id, pair] of pairs) {
        if (pair.listener === ws) {
          pair.connector?.send(JSON.stringify({ type: 'peer_disconnected' }));
          pair.connector?.close();
          pairs.delete(id);
        } else if (pair.connector === ws) {
          pair.listener?.send(JSON.stringify({ type: 'peer_disconnected' }));
          pair.listener?.close();
          pairs.delete(id);
        }
      }
    },
  },
});

console.log(`  ✓ Relay server ready\n`);
