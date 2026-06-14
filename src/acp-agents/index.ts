/**
 * Agent Communication Protocol (i-am-bee / Linux Foundation Mesh).
 *
 * ACP enables communication between AI agents across different frameworks.
 * This module provides both server and client capabilities:
 *
 * - Server: Clew Code acts as an ACP agent (REST API)
 * - Client: Clew Code connects to external ACP agents
 *
 * Spec: https://agentcommunicationprotocol.dev
 * SDK: acp-sdk
 */

export { createClewCodeManifest, peerInfoToManifest } from './ACPAgentManifest.js';
export type { ACPAgentManifest } from './ACPAgentManifest.js';
export { createRun, getRun, listRuns, completeRun, failRun, cancelRun, clearRuns } from './ACPRunManager.js';
export type { ACPRun, ACPRunStatus } from './ACPRunManager.js';
export {
  textToACPMessage,
  acpMessagesToPrompt,
  resultToACPMessage,
  extractTextFromMessage,
} from './ACPMessageConverter.js';
export { ACPAgentClient } from './ACPAgentClient.js';
export type { ACPAgentClientConfig } from './ACPAgentClient.js';
export { startACPRestServer, stopACPRestServer } from './ACPRestServer.js';
export { resolveACPRestConfig } from './ACPRestConfig.js';
export type { ACPRestConfig } from './ACPRestConfig.js';
