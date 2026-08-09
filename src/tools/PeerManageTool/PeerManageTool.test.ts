import { describe, expect, test } from 'bun:test';
import { buildDelegateCall as buildExecCall, isFanout } from '../PeerExecTool/PeerExecTool.js';
import {
  buildDelegateCall,
  missingFieldsFor,
  PEER_MANAGE_ACTIONS,
  type PeerManageInput,
  REQUIRED_FIELDS,
} from './PeerManageTool.js';

function input(partial: Partial<PeerManageInput> & { action: PeerManageInput['action'] }): PeerManageInput {
  return partial as PeerManageInput;
}

describe('peer_manage required fields', () => {
  test('every action declares its requirements', () => {
    for (const action of PEER_MANAGE_ACTIONS) {
      expect(REQUIRED_FIELDS[action]).toBeDefined();
    }
  });

  test('reports what is missing instead of dispatching', () => {
    expect(missingFieldsFor(input({ action: 'ping' }))).toEqual(['peer']);
    expect(missingFieldsFor(input({ action: 'set_role', peer: 'a' }))).toEqual(['value']);
    expect(missingFieldsFor(input({ action: 'join' }))).toEqual(['port']);
  });

  test('actions with no requirements are always satisfiable', () => {
    expect(missingFieldsFor(input({ action: 'list' }))).toEqual([]);
    expect(missingFieldsFor(input({ action: 'share' }))).toEqual([]);
  });

  test('an empty string counts as missing, not as a value', () => {
    expect(missingFieldsFor(input({ action: 'ping', peer: '' }))).toEqual(['peer']);
  });
});

describe('peer_manage dispatch', () => {
  test('there is no separate dashboard action — list carries the task view', () => {
    expect(PEER_MANAGE_ACTIONS).not.toContain('dashboard' as never);
  });

  test('every action maps to a delegate', () => {
    for (const action of PEER_MANAGE_ACTIONS) {
      const { tool } = buildDelegateCall(input({ action, peer: 'p', value: 'v', port: 1234 }));
      expect(typeof tool.call).toBe('function');
    }
  });

  test('share defaults to status rather than starting a share', () => {
    expect(buildDelegateCall(input({ action: 'share' })).args).toEqual({ action: 'status' });
    expect(buildDelegateCall(input({ action: 'share', value: 'start' })).args).toEqual({ action: 'start' });
  });

  test('renames the target field where the delegate disagrees', () => {
    // PeerInfo/SetName/SetRole call it `worker`; the facade exposes `peer`.
    expect(buildDelegateCall(input({ action: 'info', peer: 'host-1' })).args).toMatchObject({ worker: 'host-1' });
    expect(buildDelegateCall(input({ action: 'set_name', peer: 'h', value: 'bob' })).args).toMatchObject({
      worker: 'h',
      name: 'bob',
    });
    expect(buildDelegateCall(input({ action: 'set_role', peer: 'h', value: 'tester' })).args).toMatchObject({
      worker: 'h',
      role: 'tester',
    });
    // ...but ping and disconnect really do take `peer`.
    expect(buildDelegateCall(input({ action: 'ping', peer: 'h' })).args).toMatchObject({ peer: 'h' });
  });

  test('join fills in the default host', () => {
    expect(buildDelegateCall(input({ action: 'join', port: 9001 })).args).toEqual({ host: '127.0.0.1', port: 9001 });
  });
});

describe('peer_exec routing', () => {
  test('a named peer runs on that peer; no peer fans out', () => {
    expect(isFanout({ peer: 'builder-01' })).toBe(false);
    expect(isFanout({})).toBe(true);
    expect(isFanout({ peer: '' })).toBe(true);
  });

  test('single mode carries priority and dependsOn through', () => {
    const { args } = buildExecCall({
      command: 'bun test',
      peer: 'builder-01',
      priority: 'high',
      dependsOn: ['t1'],
    } as never);
    expect(args).toMatchObject({ worker: 'builder-01', command: 'bun test', priority: 'high', dependsOn: ['t1'] });
  });

  test('fan-out mode carries the filter and uses the longer default timeout', () => {
    const { args } = buildExecCall({ command: 'git pull', filter: 'builder' } as never);
    expect(args).toMatchObject({ command: 'git pull', filter: 'builder', timeout: 60 });
    expect(args).not.toHaveProperty('worker');
  });

  test('an explicit timeout wins over the per-mode default', () => {
    expect(buildExecCall({ command: 'x', peer: 'p', timeout: 5 } as never).args).toMatchObject({ timeout: 5 });
    expect(buildExecCall({ command: 'x', timeout: 5 } as never).args).toMatchObject({ timeout: 5 });
  });
});
