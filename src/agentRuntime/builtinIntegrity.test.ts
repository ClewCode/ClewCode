/**
 * Built-in workflow/agent integrity — every agent referenced by a workflow
 * topology (entry, next[]) and every handoff_to target must resolve to a
 * defined agent. Regression net for topologies that previously named agents
 * that did not exist (e.g. deep-research → collector/…).
 */

import { describe, expect, test } from 'bun:test';
import { BUILTIN_AGENTS, BUILTIN_WORKFLOWS } from './config.js';

describe('builtin runtime integrity', () => {
  test('every workflow topology node resolves to a defined agent', () => {
    for (const [wfName, wf] of Object.entries(BUILTIN_WORKFLOWS)) {
      expect(BUILTIN_AGENTS[wf.entry], `workflow ${wfName}: entry ${wf.entry}`).toBeDefined();
      for (const [node, spec] of Object.entries(wf.agents)) {
        expect(BUILTIN_AGENTS[node], `workflow ${wfName}: node ${node}`).toBeDefined();
        for (const next of spec.next) {
          expect(BUILTIN_AGENTS[next], `workflow ${wfName}: ${node} → ${next}`).toBeDefined();
        }
      }
    }
  });

  test('every handoff_to target resolves to a defined agent', () => {
    for (const [name, agent] of Object.entries(BUILTIN_AGENTS)) {
      for (const target of agent.handoff_to) {
        expect(BUILTIN_AGENTS[target], `agent ${name} handoff → ${target}`).toBeDefined();
      }
    }
  });

  test('deep-research chain is fully wired', () => {
    const wf = BUILTIN_WORKFLOWS['deep-research'];
    expect(wf).toBeDefined();
    const order = ['planner', 'collector', 'extractor', 'synthesizer', 'reporter', 'verifier'];
    for (const name of order) {
      expect(BUILTIN_AGENTS[name], `missing agent ${name}`).toBeDefined();
    }
    expect(wf!.entry).toBe('planner');
    expect(BUILTIN_AGENTS['planner']!.handoff_to).toContain('collector');
  });
});
