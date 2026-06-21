import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../utils/frontmatterParser.js';
import { BUILTIN_AGENTS, resolveRuntimePath } from './config.js';
import type { AgentDefinition, AgentPermissions } from './types.js';

export class AgentRegistry {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private getAgentsDir(): string {
    return resolveRuntimePath(this.workspaceRoot, 'agents');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.getAgentsDir(), { recursive: true });
    // Write default agents to .clew/agents/ if they do not exist
    for (const [name, definition] of Object.entries(BUILTIN_AGENTS)) {
      const agentPath = path.join(this.getAgentsDir(), `${name}.md`);
      try {
        await fs.access(agentPath);
      } catch {
        const mdContent = this.serializeAgentToMarkdown(definition);
        await fs.writeFile(agentPath, mdContent, 'utf-8');
      }
    }
  }

  private serializeAgentToMarkdown(agent: AgentDefinition): string {
    const yamlLines = [
      '---',
      `name: ${agent.name}`,
      `description: ${agent.description}`,
      `model: ${agent.model}`,
      `max_steps: ${agent.max_steps}`,
      'tools:',
    ];
    for (const tool of agent.tools) {
      yamlLines.push(`  - ${tool}`);
    }
    yamlLines.push('permissions:');
    yamlLines.push(`  read_files: ${agent.permissions.read_files}`);
    yamlLines.push(`  write_files: ${agent.permissions.write_files}`);
    yamlLines.push(`  shell: ${agent.permissions.shell}`);
    yamlLines.push(`  network: ${agent.permissions.network}`);
    yamlLines.push(`  memory_write: ${agent.permissions.memory_write}`);

    yamlLines.push('handoff_to:');
    for (const handoff of agent.handoff_to) {
      yamlLines.push(`  - ${handoff}`);
    }
    yamlLines.push('---');
    yamlLines.push('');
    yamlLines.push(`# ${agent.name.toUpperCase()} Agent`);
    yamlLines.push('');
    yamlLines.push(agent.systemPrompt || '');
    return yamlLines.join('\n');
  }

  async loadAgent(name: string): Promise<AgentDefinition> {
    const agentPath = path.join(this.getAgentsDir(), `${name}.md`);
    try {
      const rawMarkdown = await fs.readFile(agentPath, 'utf-8');
      const { frontmatter, content } = parseFrontmatter(rawMarkdown, agentPath);

      if (!frontmatter.name) {
        throw new Error(`Agent markdown at ${agentPath} is missing name`);
      }

      // Safe coercions
      const tools = Array.isArray(frontmatter.tools)
        ? frontmatter.tools.map(String)
        : typeof frontmatter.tools === 'string'
          ? (frontmatter.tools as string).split(',').map(s => s.trim())
          : [];

      const handoff_to = Array.isArray(frontmatter.handoff_to)
        ? frontmatter.handoff_to.map(String)
        : typeof frontmatter.handoff_to === 'string'
          ? (frontmatter.handoff_to as string).split(',').map(s => s.trim())
          : [];

      const fp = (frontmatter.permissions || {}) as Record<string, unknown>;

      const permissions: AgentPermissions = {
        read_files: (fp.read_files as AgentPermissions['read_files']) || 'allow',
        write_files: (fp.write_files as AgentPermissions['write_files']) || 'deny',
        shell: (fp.shell as AgentPermissions['shell']) || 'deny',
        network: (fp.network as AgentPermissions['network']) || 'deny',
        memory_write: (fp.memory_write as AgentPermissions['memory_write']) || 'deny',
      };

      return {
        name: String(frontmatter.name),
        description: String(frontmatter.description || ''),
        model: String(frontmatter.model || 'default'),
        max_steps: Number(frontmatter.max_steps) || 20,
        tools,
        permissions,
        handoff_to,
        systemPrompt: content.trim(),
      };
    } catch (err) {
      // Fallback to builtins if not found
      if (BUILTIN_AGENTS[name]) {
        return BUILTIN_AGENTS[name];
      }
      throw new Error(`Agent '${name}' not found: ${(err as Error).message}`);
    }
  }

  async listAgents(): Promise<AgentDefinition[]> {
    await this.init();
    try {
      const files = await fs.readdir(this.getAgentsDir());
      const agents: AgentDefinition[] = [];
      for (const file of files) {
        if (file.endsWith('.md')) {
          const name = file.replace('.md', '');
          try {
            const agent = await this.loadAgent(name);
            agents.push(agent);
          } catch {
            // Ignore corrupted agent definitions
          }
        }
      }
      return agents;
    } catch {
      return Object.values(BUILTIN_AGENTS);
    }
  }
}
