/**
 * Hook that subscribes to SwarmStore events and injects them as system messages
 * into the agent conversation. This eliminates polling-based tools like
 * swarm_list_messages — peer events arrive in the conversation automatically.
 */
import { useEffect, useRef } from 'react';
import { getGlobalSwarmStore } from '../swarm/SwarmStore.js';
import type { PeerChatMessage, SwarmInfo } from '../swarm/types.js';
import type { Message } from '../types/message.js';
import { createAssistantMessage } from '../utils/messages.js';

type SetMessagesFn = (updater: (prev: Message[]) => Message[]) => void;

/**
 * Inject peer events (new messages, peer online/offline) as system messages
 * into the agent conversation. Works in both standalone and team/swarm modes.
 */
export function useSwarmAutoInject(setMessages: SetMessagesFn, options?: { enabled?: boolean }): void {
  const enabled = options?.enabled ?? true;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  useEffect(() => {
    if (!enabled) return;

    const store = getGlobalSwarmStore();

    store.setCallbacks({
      onMessageReceived(msg: PeerChatMessage) {
        // Skip own messages (from === 'local')
        if (msg.from === 'local') return;

        const ts = new Date(msg.timestamp).toLocaleTimeString();
        const prefix = msg.senderRole ? `[${msg.senderRole}] ` : '';
        const text = `📨 **${prefix}${msg.fromName}** (${ts}): ${msg.text}`;

        setMessagesRef.current(prev => [...prev, createSystemMessage(text)]);
      },

      onPeerAdded(peer: SwarmInfo) {
        const text = `🔗 Peer online: **${peer.hostname}** (${peer.ip}:${peer.port})`;
        setMessagesRef.current(prev => [...prev, createSystemMessage(text)]);
      },

      onPeerRemoved(swarmId: string) {
        const peer = store.getPeer(swarmId);
        const name = peer?.hostname ?? swarmId;
        const text = `🔌 Peer offline: **${name}**`;
        setMessagesRef.current(prev => [...prev, createSystemMessage(text)]);
      },
    });

    // No cleanup needed — callbacks live as long as the store
    // (we don't want to remove them on unmount since peer events
    // should flow even when component remounts)
  }, [enabled]);
}

function createSystemMessage(text: string): Message {
  return createAssistantMessage({
    content: `<system-reminder>\n${text}\n</system-reminder>`,
  }) as unknown as Message;
}
