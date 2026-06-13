/**
 * Agent Communication Protocol (ACP) — Message/MessagePart converter.
 *
 * Converts between ACP message format (used in REST API communication)
 * and Clew Code's internal provider-agnostic content format.
 */

import type { Message, MessagePart } from 'acp-sdk';

/**
 * Convert a simple text string into an ACP Message.
 */
export function textToACPMessage(role: string, text: string): Message {
  return {
    role,
    parts: [
      {
        content: text,
        content_type: 'text/plain',
      },
    ],
  };
}

/**
 * Convert ACP messages to a plain text prompt for the agent.
 */
export function acpMessagesToPrompt(messages: Message[]): string {
  return messages
    .map(msg => {
      const parts = msg.parts
        .map(part => {
          if (part.content_type === 'text/plain' || part.content_type === 'text/markdown') {
            return String(part.content);
          }
          return `[${part.content_type} content]`;
        })
        .join('\n');
      return parts;
    })
    .join('\n\n');
}

/**
 * Convert a result string into an ACP output message.
 */
export function resultToACPMessage(text: string): Message {
  return {
    role: 'agent',
    parts: [
      {
        content: text,
        content_type: 'text/plain',
      },
    ],
  };
}

/**
 * Check if a message is a text message.
 */
export function isTextMessage(message: Message): boolean {
  return message.parts?.some(p => p.content_type === 'text/plain' || p.content_type === 'text/markdown');
}

/**
 * Extract text content from an ACP message.
 */
export function extractTextFromMessage(message: Message): string {
  return (message.parts ?? [])
    .filter(p => p.content_type === 'text/plain' || p.content_type === 'text/markdown')
    .map(p => String(p.content))
    .join('\n');
}
