import { describe, expect, it } from 'bun:test';
import {
  type BuiltInAgentDefinition,
  type CustomAgentDefinition,
  getActiveAgentsFromList,
  isBuiltInAgent,
  isCustomAgent,
  isPluginAgent,
  type PluginAgentDefinition,
} from './loadAgentsDir.js';

describe('loadAgentsDir type guards', () => {
  const builtIn: BuiltInAgentDefinition = {
    agentType: 'Explore',
    whenToUse: 'Fast codebase exploration',
    source: 'built-in',
    baseDir: 'built-in',
    getSystemPrompt: () => 'explore prompt',
  };

  const custom: CustomAgentDefinition = {
    agentType: 'custom-reviewer',
    whenToUse: 'Review code style',
    source: 'projectSettings',
    getSystemPrompt: () => 'review prompt',
  };

  const plugin: PluginAgentDefinition = {
    agentType: 'plugin-linter',
    whenToUse: 'Run linter',
    source: 'plugin',
    plugin: 'my-linter-plugin',
    getSystemPrompt: () => 'lint prompt',
  };

  it('identifies built-in agents', () => {
    expect(isBuiltInAgent(builtIn)).toBe(true);
    expect(isBuiltInAgent(custom)).toBe(false);
    expect(isBuiltInAgent(plugin)).toBe(false);
  });

  it('identifies custom agents', () => {
    expect(isCustomAgent(custom)).toBe(true);
    expect(isCustomAgent(builtIn)).toBe(false);
    expect(isCustomAgent(plugin)).toBe(false);
  });

  it('identifies plugin agents', () => {
    expect(isPluginAgent(plugin)).toBe(true);
    expect(isPluginAgent(builtIn)).toBe(false);
    expect(isPluginAgent(custom)).toBe(false);
  });
});

describe('getActiveAgentsFromList override precedence', () => {
  it('correctly overrides agents according to setting hierarchy', () => {
    const builtInExplore: BuiltInAgentDefinition = {
      agentType: 'Explore',
      whenToUse: 'Built-in explore',
      source: 'built-in',
      baseDir: 'built-in',
      getSystemPrompt: () => 'builtin prompt',
    };

    const userExplore: CustomAgentDefinition = {
      agentType: 'Explore',
      whenToUse: 'User explore override',
      source: 'userSettings',
      getSystemPrompt: () => 'user prompt',
    };

    const projectExplore: CustomAgentDefinition = {
      agentType: 'Explore',
      whenToUse: 'Project explore override',
      source: 'projectSettings',
      getSystemPrompt: () => 'project prompt',
    };

    const otherAgent: CustomAgentDefinition = {
      agentType: 'OtherAgent',
      whenToUse: 'Other task',
      source: 'userSettings',
      getSystemPrompt: () => 'other prompt',
    };

    const activeList = getActiveAgentsFromList([builtInExplore, userExplore, projectExplore, otherAgent]);

    expect(activeList.length).toBe(2);

    const activeExplore = activeList.find(a => a.agentType === 'Explore');
    expect(activeExplore).toBeDefined();
    expect(activeExplore?.whenToUse).toBe('Project explore override');
    expect(activeExplore?.source).toBe('projectSettings');

    const activeOther = activeList.find(a => a.agentType === 'OtherAgent');
    expect(activeOther).toBeDefined();
    expect(activeOther?.source).toBe('userSettings');
  });

  it('policySettings takes highest precedence over projectSettings and userSettings', () => {
    const projectAgent: CustomAgentDefinition = {
      agentType: 'SecurityReview',
      whenToUse: 'Project security review',
      source: 'projectSettings',
      getSystemPrompt: () => 'project security',
    };

    const policyAgent: CustomAgentDefinition = {
      agentType: 'SecurityReview',
      whenToUse: 'Managed policy security review',
      source: 'policySettings',
      getSystemPrompt: () => 'policy security',
    };

    const activeList = getActiveAgentsFromList([projectAgent, policyAgent]);
    expect(activeList.length).toBe(1);
    expect(activeList[0].source).toBe('policySettings');
    expect(activeList[0].whenToUse).toBe('Managed policy security review');
  });
});
