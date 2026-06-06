/**
 * useRemoteBridge — Hook that bridges the RemoteServer v2 with the REPL session.
 *
 * When a RemoteServer is active (started via `/remote listen`):
 * 1. Incoming WebSocket messages from remote clients → injected as user prompts
 * 2. New session messages → forwarded to all connected remote clients
 *
 * No claude.ai dependencies. Works with any provider.
 */

import { randomUUID } from 'node:crypto';
import { useCallback, useEffect, useRef } from 'react';
import type { RemoteServer } from '../remote/RemoteServer.js';
import type { RemoteMessage } from '../remote/types.js';
import type { Message } from '../types/message.js';
import { enqueue } from '../utils/messageQueueManager.js';

/**
 * Hook to bridge a running RemoteServer into the REPL session.
 *
 * @param messages - Current session messages (from REPL state)
 * @param setMessages - Setter for session messages
 */
export function useRemoteBridge(
  messages: Message[],
  setMessages: (action: React.SetStateAction<Message[]>) => void,
): void {
  const lastWrittenIndexRef = useRef(0);
  // Track the last server instance we wired up
  const wiredServerRef = useRef<RemoteServer | null>(null);
  // Unsubscribe function for the message callback
  const unsubRef = useRef<(() => void) | null>(null);

  // Watch for RemoteServer to appear/disappear on globalThis
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const server = (globalThis as any).__remoteServer as RemoteServer | undefined;
      if (!server) {
        wiredServerRef.current = null;
        return;
      }
      if (server === wiredServerRef.current) return;

      // New server detected — wire up the bridge
      wiredServerRef.current = server;

      // Add a remoteMessage handler that injects inbound text as user prompts.
      // We monkey-patch the server's existing callbacks since RemoteServer
      // doesn't have a typed "addListener" API.
      const origOnMessage = (server as any)._bridge_onMessage;
      if (!origOnMessage) {
        (server as any)._bridge_onMessage = (sessionId: string, msg: RemoteMessage) => {
          if (msg.type === 'user' && msg.message) {
            const text =
              typeof msg.message === 'string'
                ? msg.message
                : ((msg.message as any)?.content?.[0]?.text ?? JSON.stringify(msg.message));
            // Wait a tick before enqueueing — the original message handler
            // in RemoteServer may still be processing.
            setTimeout(() => {
              enqueue({
                value: text,
                mode: 'prompt',
                uuid: randomUUID(),
                bridgeOrigin: true,
              });
            }, 0);
          }
        };
      }

      // Send a welcome message to all connected clients
      server.broadcast(
        JSON.stringify({
          type: 'system',
          text: 'Session bridged. You can now send prompts.',
          session_id: '',
        }),
      );
    }, 1_000);

    return () => {
      clearInterval(checkInterval);
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  // Forward new session messages to connected remote clients
  useEffect(() => {
    const server = (globalThis as any).__remoteServer as RemoteServer | undefined;
    if (!server || !wiredServerRef.current) return;

    // Clamp index in case messages were compacted
    if (lastWrittenIndexRef.current > messages.length) {
      lastWrittenIndexRef.current = messages.length;
    }

    const startIndex = Math.min(lastWrittenIndexRef.current, messages.length);
    const newMessages = messages.slice(startIndex);

    if (newMessages.length === 0) return;

    lastWrittenIndexRef.current = messages.length;

    // Forward user and assistant messages to remote
    for (const msg of newMessages) {
      if (msg.type !== 'user' && msg.type !== 'assistant') continue;

      const content = msg.message.content;
      const text = Array.isArray(content)
        ? content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('\n')
        : typeof content === 'string'
          ? content
          : '';

      if (!text) continue;

      server.broadcast({
        type: msg.type === 'user' ? 'user' : 'assistant',
        uuid: msg.uuid,
        session_id: '',
        message: {
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: [{ type: 'text', text }],
        },
      } as RemoteMessage);
    }
  }, [messages]);
}
