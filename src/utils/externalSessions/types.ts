/**
 * Cross-tool session resume — shared types.
 *
 * clew can import and continue conversations produced by other coding-agent
 * CLIs (Claude Code, Codex, OpenCode, Gemini CLI). Each tool stores sessions
 * in its own on-disk format; an adapter per tool normalizes them into a plain
 * message list, which is then written out as a clew transcript so the existing
 * /resume machinery can pick it up unchanged.
 */

export type ExternalTool = 'claude' | 'codex' | 'opencode' | 'gemini';

export type NormalizedRole = 'user' | 'assistant';

/** A single turn, reduced to plain text (tool calls are summarized inline). */
export type NormalizedMessage = {
  role: NormalizedRole;
  text: string;
  /** Epoch ms, if the source recorded one. */
  timestamp?: number;
};

/** Lightweight session descriptor for the picker — no message bodies loaded. */
export type ExternalSessionMeta = {
  tool: ExternalTool;
  /** The source tool's own session id (or file stem). */
  externalId: string;
  title: string;
  /** Working directory the session ran in, if known. */
  cwd?: string;
  /** Last-modified time, epoch ms. */
  modified: number;
  messageCount: number;
  /** Absolute path to the source file/dir — used to load messages lazily. */
  sourcePath: string;
};

export type ExternalSessionAdapter = {
  tool: ExternalTool;
  /** True when the tool's storage directory exists on this machine. */
  isAvailable: () => boolean;
  /** List sessions, optionally scoped to a working directory. */
  listSessions: (opts?: { cwd?: string }) => Promise<ExternalSessionMeta[]>;
  /** Load and normalize the full message list for one session. */
  loadMessages: (meta: ExternalSessionMeta) => Promise<NormalizedMessage[]>;
};
