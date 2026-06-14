/**
 * Peer System Types
 *
 * Defines the data structures for LAN swarm discovery and messaging.
 */

/** Status of a discovered swarm */
export type SwarmStatus = 'online' | 'offline';

/** Info about a discovered swarm on the LAN */
export interface MeshInfo {
  /** Unique swarm ID (stable across restarts, derived from hostname) */
  id: string;
  /** Machine hostname */
  hostname: string;
  /** LAN IP address */
  ip: string;
  /** MeshServer TCP port */
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
  /** When this swarm was last seen (epoch ms) */
  lastSeen: number;
  /** Online/offline status */
  status: SwarmStatus;
  /** Whether the swarm is currently executing a task */
  isBusy?: boolean;
  /** Number of tasks waiting in the swarm's queue */
  queueDepth?: number;
  /** Most recent HTTP liveness ping latency in milliseconds */
  latencyMs?: number;
  /** Last liveness failure, if the swarm is unreachable */
  lastConnectionError?: string;
}

/** A chat message exchanged between swarms */
export interface MeshChatMessage {
  /** Unique message ID */
  id: string;
  /** Sender swarm ID */
  from: string;
  /** Sender display name (hostname or custom name) */
  fromName: string;
  /** Message text */
  text: string;
  /** CSS/human color name for this swarm */
  color: MeshColor;
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
  /** Sender's swarm server port */
  senderPort?: number;
}

/** Priority level for queued tasks */
export type MeshTaskPriority = 'low' | 'normal' | 'high';

/** Status of a queued or running task */
export type MeshTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A task queued for execution on a swarm */
export interface SwarmTask {
  /** Unique task ID */
  id: string;
  /** Shell command to execute */
  command: string;
  /** Sender swarm ID */
  from: string;
  /** Sender display name */
  fromName: string;
  /** Current status */
  status: MeshTaskStatus;
  /** Priority level */
  priority: MeshTaskPriority;
  /** When the task was created (epoch ms) */
  createdAt: number;
  /** When execution started (epoch ms) */
  startedAt?: number;
  /** When execution completed (epoch ms) */
  completedAt?: number;
  /** Execution result (on completion) */
  result?: { stdout: string; stderr: string; exitCode: number };
  /** Error message if execution failed before running */
  error?: string;
}

/** A todo item assigned by a swarm */
export interface MeshTodo {
  /** Unique todo ID */
  id: string;
  /** Sender swarm ID */
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
export type MeshColor = 'cyan' | 'green' | 'yellow' | 'magenta' | 'blue' | 'red' | 'white' | 'grey';

/** All available swarm colors */
export const MESH_COLORS: MeshColor[] = ['cyan', 'green', 'yellow', 'magenta', 'blue', 'red', 'white', 'grey'];

/** Discovery protocol message types */
export type DiscoveryMessage =
  | { type: 'clew-swarm-query'; version: 1 }
  | {
      type: 'clew-swarm-info';
      version: 1;
      id: string;
      hostname: string;
      ip: string;
      port: number;
      cwd: string;
      sessionId?: string;
      /** Clew Code version string of the swarm */
      appVersion: string;
      shell?: string;
      platform?: string;
      term?: string;
      status: SwarmStatus;
    };

/** Chat WebSocket message types */
export type ChatMessage =
  | { type: 'chat-open'; meshId: string; meshName: string; color: MeshColor }
  | { type: 'chat-msg'; meshId: string; meshName: string; text: string; color: MeshColor; timestamp: number }
  | { type: 'chat-close'; meshId: string }
  | { type: 'chat-ack'; msgId: string };

/** Default UDP discovery port */
export const MESH_DISCOVERY_PORT = 42069;

/** Default multicast group for swarm discovery */
export const MESH_MULTICAST_GROUP = '239.255.37.37';

/** Heartbeat interval in ms */
export const MESH_HEARTBEAT_INTERVAL = 30_000;

/** Stale timeout in ms -- swarm is marked offline after this */
export const MESH_STALE_TIMEOUT = 90_000;

/** Interval between HTTP liveness pings for joined connections (ms) */
export const MESH_CONNECTION_PING_INTERVAL = 60_000;

/** Timeout per HTTP ping to a swarm (ms) */
export const MESH_PING_TIMEOUT = 5_000;

/**
 * Assign a consistent color to a swarm based on their ID.
 */
export function meshColorFromId(id: string): MeshColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = ((hash % MESH_COLORS.length) + MESH_COLORS.length) % MESH_COLORS.length;
  return MESH_COLORS[idx]!;
}
