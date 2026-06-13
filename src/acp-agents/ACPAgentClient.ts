/**
 * Agent Communication Protocol (ACP) — Client for external ACP agents.
 *
 * Wraps the `acp-sdk` Client to communicate with external ACP/A2A-compatible
 * agents. This enables Clew Code to discover and delegate tasks to other
 * agents that implement the ACP protocol.
 *
 * Usage:
 * ```typescript
 * const client = new ACPAgentClient({ baseUrl: 'http://localhost:8000' });
 * const agents = await client.discoverAgents();
 * const result = await client.runAgent('echo', 'Hello!');
 * ```
 */

import { Client as ACPClient } from 'acp-sdk';
import type { AgentManifest, Run } from 'acp-sdk';
import { createClewCodeManifest } from './ACPAgentManifest.js';

export interface ACPAgentClientConfig {
  /** Base URL of the ACP agent server */
  baseUrl: string;
  /** Optional timeout in ms for requests */
  timeout?: number;
}

/**
 * Client for communicating with external ACP-compatible agents.
 */
export class ACPAgentClient {
  private client: ACPClient;
  private config: ACPAgentClientConfig;

  constructor(config: ACPAgentClientConfig) {
    this.config = config;
    this.client = new ACPClient({
      baseUrl: config.baseUrl.replace(/\/$/, ''),
    });
  }

  /**
   * Ping the ACP server to check connectivity.
   */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Discover all available agents on the ACP server.
   */
  async discoverAgents(): Promise<AgentManifest[]> {
    return this.client.agents();
  }

  /**
   * Get metadata for a specific agent.
   */
  async getAgent(name: string): Promise<AgentManifest> {
    return this.client.agent(name);
  }

  /**
   * Run an agent synchronously and wait for the result.
   */
  async runAgentSync(agentName: string, input: string): Promise<Run> {
    return this.client.runSync(agentName, input);
  }

  /**
   * Run an agent asynchronously (returns immediately with run ID).
   */
  async runAgentAsync(agentName: string, input: string): Promise<Run> {
    return this.client.runAsync(agentName, input);
  }

  /**
   * Stream results from an agent run.
   */
  async *runAgentStream(
    agentName: string,
    input: string,
    signal?: AbortSignal,
  ): AsyncGenerator<unknown, void, unknown> {
    for await (const event of this.client.runStream(agentName, input, signal)) {
      yield event;
    }
  }

  /**
   * Check the status of a run.
   */
  async getRunStatus(runId: string): Promise<Run> {
    return this.client.runStatus(runId);
  }

  /**
   * Cancel a run.
   */
  async cancelRun(runId: string): Promise<Run> {
    return this.client.runCancel(runId);
  }

  /**
   * Get this agent's own manifest (for advertising).
   */
  static getOwnManifest(): AgentManifest {
    return createClewCodeManifest() as unknown as AgentManifest;
  }
}
