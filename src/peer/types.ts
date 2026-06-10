/**
 * Peer System Types
 *
 * Defines the data structures for LAN peer discovery and messaging.
 */

/** Status of a discovered peer */
export type PeerStatus = 'online' | 'offline';

/** Info about a discovered peer on the LAN */
export interface PeerInfo {
  /** Unique peer ID (stable across restarts, derived from hostname) */
  id: string;
  /** Machine hostname */
  hostname: string;
  /** LAN IP address */
  ip: string;
  /** PeerServer TCP port */
  port: number;
  /** Current working directory */
  cwd: string;
  /** Active session ID (if any) */
  sessionId?: string;
  /** Clew Code version string */
  version: string;
  /** Shell name (bash, zsh, powershell, cmd, etc.) */
  shell?: string;
  /** Platform name (win32, darwin, linux) */
  platform?: string;
  /** Terminal emulator */
  term?: string;
  /** When this peer was last seen (epoch ms) */
  lastSeen: number;
  /** Online/offline status */
  status: PeerStatus;
}

/** A chat message exchanged between peers */
export interface PeerChatMessage {
  /** Unique message ID */
  id: string;
  /** Sender peer ID */
  from: string;
  /** Sender display name (hostname or custom name) */
  fromName: string;
  /** Message text */
  text: string;
  /** CSS/human color name for this peer */
  color: PeerColor;
  /** Timestamp (epoch ms) */
  timestamp: number;
  /** If this message is part of a chunked group, the shared group ID */
  chunkGroup?: string;
  /** Index of this chunk within the group (0-based) */
  chunkIndex?: number;
  /** Total number of chunks in the group */
  chunkTotal?: number;
  /** Sender's role (e.g. "builder", "researcher") */
  senderRole?: string;
  /** Sender's peer server port */
  senderPort?: number;
}

/** A todo item assigned by a peer */
export interface PeerTodo {
  /** Unique todo ID */
  id: string;
  /** Sender peer ID */
  from: string;
  /** Sender display name */
  fromName: string;
  /** Todo description */
  message: string;
  /** When it was created (epoch ms) */
  createdAt: number;
  /** Current status */
  status: 'pending' | 'done' | 'rejected';
}

/** Peer colors -- distinct terminal-friendly palette */
export type PeerColor = 'cyan' | 'green' | 'yellow' | 'magenta' | 'blue' | 'red' | 'white' | 'grey';

/** All available peer colors */
export const PEER_COLORS: PeerColor[] = ['cyan', 'green', 'yellow', 'magenta', 'blue', 'red', 'white', 'grey'];

/** Discovery protocol message types */
export type DiscoveryMessage =
  | { type: 'clew-peer-query'; version: 1 }
  | {
      type: 'clew-peer-info';
      version: 1;
      id: string;
      hostname: string;
      ip: string;
      port: number;
      cwd: string;
      sessionId?: string;
      /** Clew Code version string of the peer */
      appVersion: string;
      shell?: string;
      platform?: string;
      term?: string;
      status: PeerStatus;
    };

/** Chat WebSocket message types */
export type ChatMessage =
  | { type: 'chat-open'; peerId: string; peerName: string; color: PeerColor }
  | { type: 'chat-msg'; peerId: string; peerName: string; text: string; color: PeerColor; timestamp: number }
  | { type: 'chat-close'; peerId: string }
  | { type: 'chat-ack'; msgId: string };

/** Default UDP discovery port */
export const PEER_DISCOVERY_PORT = 42069;

/** Default multicast group for peer discovery */
export const PEER_MULTICAST_GROUP = '239.255.37.37';

/** Heartbeat interval in ms */
export const PEER_HEARTBEAT_INTERVAL = 30_000;

/** Stale timeout in ms -- peer is marked offline after this */
export const PEER_STALE_TIMEOUT = 90_000;

/**
 * Assign a consistent color to a peer based on their ID.
 */
export function peerColorFromId(id: string): PeerColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = ((hash % PEER_COLORS.length) + PEER_COLORS.length) % PEER_COLORS.length;
  return PEER_COLORS[idx]!;
}
