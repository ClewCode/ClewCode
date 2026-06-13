/**
 * ACP (Agent Client Protocol) — Editor <-> Agent communication.
 *
 * ACP standardizes communication between code editors (Zed, etc.) and
 * AI-powered coding agents (Clew Code). This module implements the Agent
 * side of the protocol.
 *
 * Protocol spec: https://agentclientprotocol.com
 * TypeScript SDK: @agentclientprotocol/sdk
 */

export { startACPStdioServer } from './ACPServer.js';
export { resolveACPConfig } from './ACPConfig.js';
export type { ACPConfig } from './ACPConfig.js';
export { createSession, getSession, listSessions, removeSession, clearSessions } from './ACPSessionManager.js';
export type { ACPSession } from './ACPSessionManager.js';
export { ACPStatusManager } from './ACPStatusManager.js';
export type { ACPStatus } from './ACPStatusManager.js';
