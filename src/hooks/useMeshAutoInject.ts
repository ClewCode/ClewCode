/**
 * Hook that subscribes to MeshStore events and injects them as system messages
 * into the agent conversation. This eliminates polling-based tools like
 * swarm_list_messages — peer events arrive in the conversation automatically.
 */
import { useEffect, useRef } from 'react';
import { getGlobalMeshStore } from '../mesh/MeshStore.js';
import type { PeerChatMessage, MeshInfo } from '../mesh/types.js';
import type { Message } from '../types/message.js';
import { createAssistantMessage } from '../utils/messages.js';

type SetMessagesFn = (updater: (prev: Message[]) => Message[]) => void;

/**
 * Inject peer events (new messages, peer online/offline) as system messages
 * into the agent conversation. Works in both standalone and team/mesh modes.
 */
export function useMeshAutoInject(setMessages: SetMessagesFn, options?: { enabled?: boolean }): void {
  const enabled = options?.enabled ?? true;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  useEffect(() => {
    if (!enabled) return;

    const store = getGlobalMeshStore();

    store.setCallbacks({
      onMessageReceived(msg: PeerChatMessage) {
        // Skip own messages (from === 'local')
        if (msg.from === 'local') return;

        const ts = new Date(msg.timestamp).toLocaleTimeString();
        const prefix = msg.senderRole ? `[${msg.senderRole}] ` : '';
        const text = `📨 **${prefix}${msg.fromName}** (${ts}): ${msg.text}`;

        setMessagesRef.current(prev => [...prev, createSystemMessage(text)]);
      },

      onPeerAdded(peer: MeshInfo) {
        const text = `🔗 Peer online: **${peer.hostname}** (${peer.ip}:${peer.port})`;
        setMessagesRef.current(prev => [...prev, createSystemMessage(text)]);
      },

      onPeerRemoved(meshId: string) {
        const peer = store.getPeer(meshId);
        const name = peer?.hostname ?? meshId;
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
