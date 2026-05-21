import fs from 'node:fs/promises';
import path from 'node:path';
import { parseYaml } from '../utils/yaml.js';
import { BUILTIN_WORKFLOWS, resolveRuntimePath } from './config.js';
import type { WorkflowDefinition } from './types.js';

export class WorkflowRegistry {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private getWorkflowsDir(): string {
    return resolveRuntimePath(this.workspaceRoot, 'workflows');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.getWorkflowsDir(), { recursive: true });
    // Write built-in workflows if they do not exist
    for (const [name, definition] of Object.entries(BUILTIN_WORKFLOWS)) {
      const workflowPath = path.join(this.getWorkflowsDir(), `${name}.yaml`);
      try {
        await fs.access(workflowPath);
      } catch {
        const yamlContent = this.serializeWorkflowToYaml(definition);
        await fs.writeFile(workflowPath, yamlContent, 'utf-8');
      }
    }
  }

  private serializeWorkflowToYaml(workflow: WorkflowDefinition): string {
    const lines = [
      `name: ${workflow.name}`,
      `description: ${workflow.description}`,
      `entry: ${workflow.entry}`,
      'agents:',
    ];

    for (const [agent, spec] of Object.entries(workflow.agents)) {
      lines.push(`  ${agent}:`);
      lines.push('    next:');
      for (const nextAgent of spec.next) {
        lines.push(`      - ${nextAgent}`);
      }
    }

    if (workflow.budgets) {
      lines.push('budgets:');
      for (const [k, v] of Object.entries(workflow.budgets)) {
        if (v !== undefined) {
          lines.push(`  ${k}: ${v}`);
        }
      }
    }

    if (workflow.approval?.required_for) {
      lines.push('approval:');
      lines.push('  required_for:');
      for (const req of workflow.approval.required_for) {
        lines.push(`    - ${req}`);
      }
    }

    if (workflow.verification?.required) {
      lines.push('verification:');
      lines.push('  required:');
      for (const req of workflow.verification.required) {
        lines.push(`    - ${req}`);
      }
    }

    return lines.join('\n');
  }

  async loadWorkflow(name: string): Promise<WorkflowDefinition> {
    const workflowPath = path.join(this.getWorkflowsDir(), `${name}.yaml`);
    try {
      const rawYaml = await fs.readFile(workflowPath, 'utf-8');
      const parsed = parseYaml(rawYaml) as WorkflowDefinition;

      if (!parsed.name || !parsed.entry || !parsed.agents) {
        throw new Error(`Workflow definition in ${workflowPath} is missing required fields (name, entry, agents)`);
      }

      // Check graph topology validity
      const agentNames = Object.keys(parsed.agents);
      if (!agentNames.includes(parsed.entry)) {
        throw new Error(`Workflow entry agent '${parsed.entry}' is not defined under 'agents'`);
      }

      for (const [agent, spec] of Object.entries(parsed.agents)) {
        for (const next of spec.next) {
          if (next !== 'done' && !agentNames.includes(next)) {
            throw new Error(`Workflow transition path leads from '${agent}' to undefined agent '${next}'`);
          }
        }
      }

      return parsed;
    } catch (err) {
      if (BUILTIN_WORKFLOWS[name]) {
        return BUILTIN_WORKFLOWS[name];
      }
      throw new Error(`Workflow '${name}' not found or invalid: ${(err as Error).message}`);
    }
  }

  async listWorkflows(): Promise<WorkflowDefinition[]> {
    await this.init();
    try {
      const files = await fs.readdir(this.getWorkflowsDir());
      const workflows: WorkflowDefinition[] = [];
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = file.replace(/\.ya?ml$/, '');
          try {
            const workflow = await this.loadWorkflow(name);
            workflows.push(workflow);
          } catch {
            // Ignore broken yaml formats
          }
        }
      }
      return workflows;
    } catch {
      return Object.values(BUILTIN_WORKFLOWS);
    }
  }
}
